import { buildUserCode } from './userscript-runtime.js';
import { originOf, scriptMatches, scriptPermissions, candidatePatterns, assertAttachments, validateValues } from './core.js';
import { createGMExtras } from './gm-extras-service.js';

export function createScriptService({ library, mutate, settings, log }) {
  const worldId = id => `autotap-${id}`;
  const valueKey = id => `values:${id}`;
  const tokenKey = id => `token:${id}`;
  const values = async id => (await chrome.storage.local.get(valueKey(id)))[valueKey(id)] || {};
  const available = async () => { try { if (!chrome.userScripts) return false; await chrome.userScripts.getScripts(); return true; } catch { return false; } };
  async function requireAPI() { if (!await available()) throw new Error('Enable “Allow user scripts” in this extension’s Chrome details, then try again.'); }
  async function ensureWorld(id) {
    const wanted = worldId(id); let worlds = await chrome.userScripts.getWorldConfigurations();
    if (worlds.some(world => world.worldId === wanted && world.messaging)) return;
    if (worlds.length >= 95) {
      const { scripts } = await library(); const sessions = await chrome.storage.session.get(null);
      const active = new Set([...scripts.filter(script => script.enabled).map(script => worldId(script.id)), ...Object.entries(sessions).filter(([key, value]) => key.startsWith('manual:') && value.expires > Date.now()).map(([, value]) => worldId(value.script.id)), wanted]);
      for (const world of worlds) if (world.worldId?.startsWith('autotap-') && !active.has(world.worldId)) await chrome.userScripts.resetWorldConfiguration(world.worldId);
    }
    await chrome.userScripts.configureWorld({ worldId: wanted, messaging: true });
  }
  async function tokenFor(id) {
    let token = (await chrome.storage.local.get(tokenKey(id)))[tokenKey(id)];
    if (!token) { token = crypto.randomUUID(); await chrome.storage.local.set({ [tokenKey(id)]: token }); }
    return token;
  }
  async function source(script) { return buildUserCode(script, { token: await tokenFor(script.id), values: await values(script.id), automatic: true }); }
  async function refreshStored(id) { const saved = (await library()).scripts.find(s => s.id === id); if (saved?.enabled && await available()) { try { await register(saved); } catch (error) { console.warn('GM values saved; automatic registration will refresh on the next sync:', error.message); } } }
  async function registration(script) {
    const current = await settings();
    const excludeMatches = [...new Set([...(script.excludeMatches || []), ...current.blockedSites])];
    return { id: script.id, matches: candidatePatterns(script), excludeMatches, excludeGlobs: script.excludes || [], js: [{ code: await source(script) }], world: script.world, ...(script.world === 'USER_SCRIPT' ? { worldId: worldId(script.id) } : {}), runAt: script.runAt, allFrames: !!script.allFrames };
  }
  async function register(script) {
    await requireAPI();
    const existing = (await chrome.userScripts.getScripts({ ids: [script.id] }))[0];
    const current = await settings();
    if (script.enabled && !candidatePatterns(script).length) throw new Error('Add a site pattern before enabling automatic execution.');
    if (script.enabled && !await chrome.permissions.contains(scriptPermissions(script, '', true))) throw new Error('Grant the required site and optional API permissions first.');
    const shouldRun = script.enabled && !current.scriptsPaused;
    if (!shouldRun) { if (existing) await chrome.userScripts.unregister({ ids: [script.id] }); return; }
    assertAttachments(script);
    if (script.world === 'USER_SCRIPT') await ensureWorld(script.id);
    const desired = await registration(script);
    if (existing) {
      // userScripts.update retains an omitted worldId; explicitly unregister when changing worlds.
      if (existing.world !== script.world) { await chrome.userScripts.unregister({ ids: [script.id] }); try { await chrome.userScripts.register([desired]); } catch (error) { await chrome.userScripts.register([existing]); throw error; } }
      else await chrome.userScripts.update([desired]);
    } else await chrome.userScripts.register([desired]);
  }
  async function sync() {
    if (!await available()) return { available: false, errors: [] };
    const { scripts } = await library(); const current = await settings();
    const existing = await chrome.userScripts.getScripts(); const errors = [];
    const wanted = new Set(scripts.filter(s => s.enabled && !current.scriptsPaused).map(s => s.id));
    const obsolete = existing.filter(s => !wanted.has(s.id)).map(s => s.id);
    if (obsolete.length) await chrome.userScripts.unregister({ ids: obsolete });
    for (const script of scripts.filter(s => wanted.has(s.id))) {
      try { await register(script); } catch (error) { errors.push(`${script.name}: ${error.message}`); }
    }
    return { available: true, errors };
  }
  async function run(script, tabId, url) {
    await requireAPI();
    assertAttachments(script);
    if (!await chrome.permissions.contains(scriptPermissions(script, url))) throw new Error('Grant the required site and optional API permissions from the workshop.');
    const token = crypto.randomUUID();
    if (script.world === 'USER_SCRIPT') {
      await ensureWorld(script.id);
      const sessions = await chrome.storage.session.get(null);
      const obsolete = Object.entries(sessions).filter(([key, value]) => key.startsWith('manual:') && (value.expires <= Date.now() || value.tabId === tabId && value.script.id === script.id)).map(([key]) => key);
      if (obsolete.length) await chrome.storage.session.remove([...obsolete, ...obsolete.map(key => `owned:${key.slice(7)}`)]);
      await chrome.storage.session.set({ [`manual:${token}`]: { script: { ...script, code: '', requires: [], resources: [] }, tabId, origin: originOf(url), expires: Date.now() + 86400000 } });
    }
    await log({ kind: 'script', itemId: script.id, name: script.name, status: 'running', message: 'Manual run started.', site: originOf(url) });
    const results = await chrome.userScripts.execute({ target: { tabId }, js: [{ code: buildUserCode(script, { token, values: await values(script.id) }) }], world: script.world, ...(script.world === 'USER_SCRIPT' ? { worldId: worldId(script.id) } : {}), injectImmediately: true });
    const result = results[0];
    if (!result || result.error || result.result?.ok === false) {
      const error = result?.error || result?.result?.error || 'The page changed before this script finished.';
      // Main-world scripts have no message bridge, so report their result here.
      if (script.world === 'MAIN' || result?.error || !result?.result?.reported) await log({ kind: 'script', itemId: script.id, name: script.name, status: 'error', message: error, site: originOf(url) });
      throw new Error(error);
    }
    if (script.world === 'MAIN') await log({ kind: 'script', itemId: script.id, name: script.name, status: 'success', message: 'Script finished in page context.', site: originOf(url) });
    return { message: 'Script finished. GM_log output is in Activity; console.log output is in the page console.' };
  }
  async function authorize(message, sender) {
    if (!sender.tab || !sender.documentId || !originOf(sender.url) || typeof message.scriptId !== 'string' || typeof message.token !== 'string') throw new Error('Invalid userscript sender.');
    const manual = (await chrome.storage.session.get(`manual:${message.token}`))[`manual:${message.token}`];
    if (manual && sender.frameId === 0 && manual.script.id === message.scriptId && manual.tabId === sender.tab.id && manual.origin === originOf(sender.url) && manual.expires > Date.now()) return manual.script;
    const expected = (await chrome.storage.local.get(tokenKey(message.scriptId)))[tokenKey(message.scriptId)];
    const { scripts } = await library(); const script = scripts.find(s => s.id === message.scriptId); const current = await settings();
    if (!expected || expected !== message.token || !script?.enabled || sender.frameId !== 0 && !script.allFrames || current.scriptsPaused || current.blockedSites.some(p => scriptMatches({ matches: [p] }, sender.url)) || !scriptMatches(script, sender.url)) throw new Error('This script’s access expired or automatic execution is paused.');
    return script;
  }
  const allowed = (script, ...grants) => { if (!grants.some(g => script.grants?.includes(g))) throw new Error(`Script needs @grant ${grants[0]}.`); };
  const extras = createGMExtras({ authorize, allowed, mutate, worldId });
  async function menusFor(tabId) { return (await chrome.storage.session.get(`menus:${tabId}`))[`menus:${tabId}`] || []; }
  async function receive(message, sender) {
    if (message?.type !== 'GM') throw new Error('Unknown userscript request.');
    const script = await authorize(message, sender);
    switch (message.op) {
      case 'GET_VALUES': allowed(script, 'GM_getValue', 'GM_getValues', 'GM_listValues'); return values(script.id);
      case 'SET_VALUES': allowed(script, 'GM_setValue', 'GM_setValues'); return mutate(async () => {
        const incoming = validateValues(message.values); const next = validateValues({ ...await values(script.id), ...incoming });
        await extras.writeValues(script.id, next, sender, message.token);
        await refreshStored(script.id);
      });
      case 'DELETE_VALUES': allowed(script, 'GM_deleteValue', 'GM_deleteValues'); return mutate(async () => {
        if (!Array.isArray(message.keys) || message.keys.length > 500) throw new Error('Invalid keys.');
        const next = await values(script.id); message.keys.forEach(key => delete next[String(key)]);
        await extras.writeValues(script.id, next, sender, message.token); await refreshStored(script.id);
      });
      case 'START': return mutate(async () => { const menus = await menusFor(sender.tab.id); const listeners = (await chrome.storage.session.get(`listeners:${script.id}`))[`listeners:${script.id}`] || []; await chrome.storage.session.set({ [`menus:${sender.tab.id}`]: menus.filter(m => !(m.scriptId === script.id && m.documentId === sender.documentId && m.token !== message.token)), [`listeners:${script.id}`]: listeners.filter(m => !(m.documentId === sender.documentId && m.token !== message.token || m.tabId === sender.tab.id && m.frameId === sender.frameId && m.documentId !== sender.documentId)) }); });
      case 'END': case 'ERROR': case 'LOG':
        if (message.op === 'LOG') allowed(script, 'GM_log');
        return log({ kind: 'script', itemId: script.id, name: script.name, status: message.op === 'ERROR' ? 'error' : message.op === 'LOG' ? 'info' : 'success', message: String(message.message || 'Script finished.').slice(0, 1500), site: originOf(sender.url) });
      case 'MENU_SET': allowed(script, 'GM_registerMenuCommand'); return mutate(async () => {
        const menus = await menusFor(sender.tab.id); const id = String(message.id).slice(0, 100);
        const next = menus.filter(m => !(m.id === id && m.scriptId === script.id && m.documentId === sender.documentId));
        if (next.length >= 40) throw new Error('At most 40 script menu commands are available per tab.');
        next.push({ id, scriptId: script.id, scriptName: script.name, label: String(message.label).slice(0, 100), documentId: sender.documentId, token: message.token });
        await chrome.storage.session.set({ [`menus:${sender.tab.id}`]: next });
      });
      case 'MENU_REMOVE': allowed(script, 'GM_unregisterMenuCommand'); return mutate(async () => { const menus = await menusFor(sender.tab.id); await chrome.storage.session.set({ [`menus:${sender.tab.id}`]: menus.filter(m => !(m.scriptId === script.id && m.id === message.id && m.documentId === sender.documentId)) }); });
      case 'OPEN_TAB': {
        allowed(script, 'GM_openInTab'); if (!originOf(message.url)) throw new Error('GM_openInTab only supports HTTP(S) addresses.');
        const tab = await chrome.tabs.create({ url: String(message.url).slice(0, 4000), active: message.active !== false });
        await mutate(async () => { const key = `owned:${message.token}`; const ids = (await chrome.storage.session.get(key))[key] || []; await chrome.storage.session.set({ [key]: [...ids, tab.id].slice(-100) }); });
        return { tabId: tab.id };
      }
      case 'CLOSE_TAB': {
        allowed(script, 'GM_openInTab'); const ids = (await chrome.storage.session.get(`owned:${message.token}`))[`owned:${message.token}`] || [];
        if (!ids.includes(message.tabId)) throw new Error('A script can close only tabs it created.'); await chrome.tabs.remove(message.tabId); return;
      }
      default: return extras.receive(script, message, sender);
    }
  }
  async function invoke(tabId, scriptId, id) {
    const menu = (await menusFor(tabId)).find(m => m.scriptId === scriptId && m.id === id); if (!menu) throw new Error('This menu command expired. Reload the page.');
    await requireAPI();
    const result = await chrome.userScripts.execute({ target: { tabId, documentIds: [menu.documentId] }, world: 'USER_SCRIPT', worldId: worldId(scriptId), js: [{ code: `(async () => { try { const invoke = globalThis.__autotapScriptMenus?.[${JSON.stringify(`autotap:${scriptId}`)}]; if (!invoke) throw new Error('Menu command expired. Reload this page.'); return await invoke(${JSON.stringify(id)}); } catch(error) { return { ok: false, error: String(error.message || error) }; } })()` }] });
    if (!result[0] || result[0].error || result[0].result?.ok === false) throw new Error(result[0]?.error || result[0]?.result?.error || 'The menu command is no longer available.');
    return { message: 'Script command finished.' };
  }
  async function remove(id) {
    await extras.cleanup({ scriptId: id });
    if (await available() && (await chrome.userScripts.getScripts({ ids: [id] })).length) await chrome.userScripts.unregister({ ids: [id] });
    if (await available()) await chrome.userScripts.resetWorldConfiguration(worldId(id));
    await chrome.storage.local.remove([valueKey(id), tokenKey(id)]); await chrome.storage.session.remove(`listeners:${id}`);
    const sessions = await chrome.storage.session.get(null); const changes = {}, removeKeys = [];
    for (const [key, value] of Object.entries(sessions)) {
      if (key.startsWith('menus:')) changes[key] = value.filter(m => m.scriptId !== id);
      if (key.startsWith('manual:') && value.script.id === id) removeKeys.push(key);
    }
    if (Object.keys(changes).length) await chrome.storage.session.set(changes); if (removeKeys.length) await chrome.storage.session.remove(removeKeys);
  }
  async function saveValues(id, next) { await extras.writeValues(id, validateValues(next)); await refreshStored(id); }
  return { available, requireAPI, register, sync, run, receive, menusFor, invoke, remove, values, saveValues, changed: extras.changed, cleanup: extras.cleanup };
}
