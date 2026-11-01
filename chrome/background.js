import { blankMacro, sanitizeMacro, sanitizeScript, sanitizeStep, parseImport, sitePattern, originOf, validatePattern, validateValues, DEFAULT_SETTINGS, MAX_STEPS, scriptMatches } from './core.js';
import { createScriptService } from './script-service.js';
import { createRepository } from './repository.js';
import { fetchDeclaredAttachments } from './attachments.js';
import { pageAvailability } from './page-target.js';

let writeQueue = Promise.resolve();
const mutate = task => { const next = writeQueue.then(task); writeQueue = next.catch(() => {}); return next; };
const repository = createRepository(chrome.storage.local);
const library = repository.read;
const persist = repository.write;
const settings = async () => ({ ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get('settings')).settings });
const logLimits = new Map();
const log = entry => mutate(async () => {
  const key = `${entry.itemId}:${Math.floor(Date.now() / 1000)}`; const limit = logLimits.get(key) || 0;
  if (limit >= 12 && ['info', 'running'].includes(entry.status)) return;
  if (logLimits.size > 100) logLimits.clear(); logLimits.set(key, limit + 1);
  const activity = (await chrome.storage.local.get('activity')).activity || [];
  activity.unshift({ id: crypto.randomUUID(), time: Date.now(), ...entry, message: String(entry.message || '').slice(0, 1500) });
  try { await chrome.storage.local.set({ activity: activity.slice(0, 100) }); } catch (error) { console.warn('AutoTap could not save the activity log:', error.message); }
});
const scripts = createScriptService({ library, settings, log, mutate });
const session = async tabId => (await chrome.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`] || { mode: 'idle' };
async function badge(tabId, mode) {
  try { await chrome.action.setBadgeText({ tabId, text: mode === 'recording' ? 'REC' : mode === 'playing' ? '▶' : '' }); await chrome.action.setBadgeBackgroundColor({ tabId, color: mode === 'recording' ? '#b9392b' : '#4b6f2b' }); } catch {}
}
async function setSession(tabId, state) { const previous = await session(tabId); await chrome.storage.session.set({ [`tab:${tabId}`]: state }); if (previous.mode !== state.mode) await badge(tabId, state.mode); }
async function finish(tabId, message = 'Stopped.', expectedRunId) {
  const state = await session(tabId);
  if (expectedRunId && expectedRunId !== state.runId) return state;
  await setSession(tabId, { mode: 'idle', message, lastMacroId: state.macroId });
  try { await chrome.tabs.sendMessage(tabId, { type: 'STOP_LOCAL', message, runId: state.runId }); } catch {}
  if (state.mode !== 'idle') log({ kind: 'macro', itemId: state.macroId, name: state.name || 'Recording', status: message.startsWith('Playback stopped:') ? 'error' : message === 'Playback complete.' ? 'success' : 'info', message }).catch(console.warn);
  return { mode: 'idle', message };
}
async function requestStop(tabId) {
  const before = await session(tabId);
  try { const reply = await Promise.race([chrome.tabs.sendMessage(tabId, { type: 'REQUEST_STOP', runId: before.runId }), new Promise((_, reject) => setTimeout(() => reject(new Error('Stop timed out.')), 3000))]); if (!reply?.ok) throw new Error('Stop was not acknowledged.'); return session(tabId); }
  catch { return mutate(() => finish(tabId, 'Stopped.', before.runId)); }
}
async function targetTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const availability = pageAvailability(tab);
  if (!availability.supported) throw new Error(availability.reason);
  return tab;
}
async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['recorder-feedback.js', 'pointer-motion.js', 'content.js'] });
}
async function startRecording(tabId, name) {
  const tab = await targetTab(tabId);
  if ((await session(tabId)).mode !== 'idle') throw new Error('Stop the current recording or playback first.');
  await inject(tabId);
  const macro = { ...blankMacro(name || `Recording · ${new URL(tab.url).hostname}`), site: originOf(tab.url), url: tab.url };
  const data = await library(); data.macros.unshift(macro); await persist({ macros: data.macros });
  const runId = crypto.randomUUID();
  await setSession(tabId, { mode: 'recording', macroId: macro.id, name: macro.name, runId, paused: false, count: 0, startedAt: Date.now() });
  try { await chrome.tabs.sendMessage(tabId, { type: 'RECORD', name: macro.name, runId }); } catch (error) { await finish(tabId, 'Recording could not start.'); throw error; }
  return macro;
}
async function play(tabId, macroId) {
  const tab = await targetTab(tabId);
  if ((await session(tabId)).mode !== 'idle') throw new Error('Stop the current recording or playback first.');
  const { macros } = await library(); const macro = macros.find(m => m.id === macroId);
  if (!macro?.steps.some(s => s.enabled !== false)) throw new Error('Record or enable some actions before playing this macro.');
  if (macro.site && macro.site !== originOf(tab.url)) throw new Error(`Open this macro’s website first: ${macro.site}`);
  await inject(tabId);
  const runId = crypto.randomUUID();
  await setSession(tabId, { mode: 'playing', macroId, runId, name: macro.name, count: 0, total: macro.steps.length, cycle: 1, cycles: macro.cycles, paused: false });
  try { await chrome.tabs.sendMessage(tabId, { type: 'PLAY', macro, runId }); } catch (error) { await finish(tabId, 'Playback could not start.'); throw error; }
}
async function handle(message, sender) {
  if (!message || typeof message.type !== 'string') throw new Error('Invalid AutoTap command.');
  const fromPage = !!sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(''));
  const pageTypes = ['GET_SESSION', 'APPEND_STEP', 'APPEND_STEPS', 'PROGRESS', 'FINISH', 'TOGGLE_PAUSE', 'MOUSE_DEFAULT'];
  if (fromPage && !pageTypes.includes(message.type)) throw new Error('This command is available only in the extension.');
  const tabId = fromPage ? sender.tab.id : message.tabId;
  switch (message.type) {
    case 'GET_LIBRARY': return library();
    case 'GET_SESSION': return Number.isInteger(tabId) ? session(tabId) : { mode: 'idle' };
    case 'RECORD': return mutate(() => startRecording(tabId, message.name));
    case 'PLAY': return mutate(() => play(tabId, message.id));
    case 'STOP': return requestStop(tabId);
    case 'MOUSE_DEFAULT': {
      const state = await session(tabId);
      if (!fromPage || state.mode !== 'playing' || state.paused || state.runId !== message.runId) throw new Error('Mouse navigation requires an active playback session.');
      if (message.button === 3) return chrome.tabs.goBack(tabId);
      if (message.button === 4) return chrome.tabs.goForward(tabId);
      if (message.button === 1) {
        const url = new URL(String(message.url || ''));
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Middle-click links must use http or https.');
        const tab = await chrome.tabs.get(tabId);
        return chrome.tabs.create({ url: url.href, active: false, windowId: tab.windowId, openerTabId: tabId });
      }
      throw new Error('Unsupported mouse navigation.');
    }
    case 'FINISH': return mutate(async () => { if (fromPage && (await session(tabId)).runId !== message.runId) return; return finish(tabId, String(message.message || 'Finished.').slice(0, 400)); });
    case 'TOGGLE_PAUSE': {
      if (!fromPage) { const before = await session(tabId); if (before.mode === 'idle') return before; const result = await chrome.tabs.sendMessage(tabId, { type: 'REQUEST_PAUSE', runId: before.runId }); if (!result?.ok) throw new Error(result?.error || 'Could not pause this session.'); return result.state; }
      return mutate(async () => { const state = await session(tabId); if (state.mode === 'idle' || state.runId !== message.runId) return state; state.paused = !state.paused; await setSession(tabId, state); return state; });
    }
    case 'APPEND_STEP': case 'APPEND_STEPS': return mutate(async () => {
      const state = await session(tabId); if (state.mode !== 'recording' || state.paused || (fromPage && state.runId !== message.runId)) return;
      const data = await library(); const index = data.macros.findIndex(m => m.id === state.macroId); if (index < 0) return finish(tabId, 'Macro no longer exists.');
      const macro = { ...data.macros[index], steps: [...data.macros[index].steps] }; data.macros[index] = macro;
      const incoming = message.type === 'APPEND_STEP' ? [message.step] : message.steps;
      if (!Array.isArray(incoming) || incoming.length > 100) throw new Error('Invalid recording batch.');
      const steps = incoming.map(sanitizeStep);
      for (const step of steps) {
      // Coalesce adjacent text and scroll events without losing the time spent on them.
      const last = macro.steps.at(-1);
      if (last && ['input', 'scroll'].includes(step.type) && last.type === step.type && last.selector === step.selector) macro.steps[macro.steps.length - 1] = { ...step, delay: Math.min(3600000, last.delay + step.delay) };
      else if (macro.steps.length < MAX_STEPS) macro.steps.push(step);
      }
      macro.updatedAt = Date.now(); await persist({ macros: data.macros }); state.count = macro.steps.length; await setSession(tabId, state);
      if (macro.steps.length >= MAX_STEPS) await finish(tabId, 'Recording saved. Maximum 5,000 actions reached.');
      return { count: state.count };
    });
    case 'PROGRESS': return mutate(async () => { const state = await session(tabId); if (state.mode === 'playing' && (!fromPage || state.runId === message.runId)) { Object.assign(state, { count: message.count, cycle: message.cycle }); if (message.warning) { state.skipped = (state.skipped || 0) + 1; log({ kind: 'macro', itemId: state.macroId, name: state.name, status: 'warning', message: String(message.warning).slice(0, 500) }).catch(console.warn); } await setSession(tabId, state); } });
    case 'SAVE_MACRO': return mutate(async () => { const macro = sanitizeMacro(message.macro); const sessions = await chrome.storage.session.get(null); if (Object.values(sessions).some(s => s.mode !== 'idle' && s.macroId === macro.id)) throw new Error('Stop this macro before editing it.'); const data = await library(); const i = data.macros.findIndex(m => m.id === macro.id); i < 0 ? data.macros.unshift(macro) : data.macros.splice(i, 1, macro); await persist({ macros: data.macros }); return macro; });
    case 'DELETE_MACRO': return mutate(async () => { const sessions = await chrome.storage.session.get(null); if (Object.values(sessions).some(s => s.mode !== 'idle' && s.macroId === message.id)) throw new Error('Stop this macro before deleting it.'); const data = await library(); data.macros = data.macros.filter(m => m.id !== message.id); await persist({ macros: data.macros }); });
    case 'SCRIPT_STATUS': return { available: await scripts.available() };
    case 'SYNC_SCRIPTS': return mutate(() => scripts.sync());
    case 'SAVE_SCRIPT': return mutate(async () => {
      const script = sanitizeScript(message.script);
      const data = await library(); const i = data.scripts.findIndex(s => s.id === script.id);
      const previous = data.scripts[i];
      if (script.enabled || await scripts.available()) await scripts.register(script);
      i < 0 ? data.scripts.unshift(script) : data.scripts.splice(i, 1, script);
      try { await persist({ scripts: data.scripts }); } catch (error) { if (previous) await scripts.register(previous); else await scripts.remove(script.id); throw error; }
      return script;
    });
    case 'DELETE_SCRIPT': return mutate(async () => { await scripts.remove(message.id); const data = await library(); data.scripts = data.scripts.filter(s => s.id !== message.id); await persist({ scripts: data.scripts }); });
    case 'RUN_SCRIPT': {
      const tab = await targetTab(tabId); const script = sanitizeScript(message.script);
      if (!(await chrome.permissions.contains({ origins: [sitePattern(tab.url)] }))) throw new Error('Grant access to this site before running JavaScript.');
      return scripts.run(script, tabId, tab.url);
    }
    case 'IMPORT': return mutate(async () => { const incoming = parseImport(message.source); const data = await library(); data.macros.push(...incoming.macros); data.scripts.push(...incoming.scripts); await persist({ ...data, ...Object.fromEntries(Object.entries(incoming.values).map(([id, value]) => [`values:${id}`, value])) }); return { macros: incoming.macros.length, scripts: incoming.scripts.length }; });
    case 'EXPORT': { const data = await library(); const values = Object.fromEntries(await Promise.all(data.scripts.map(async s => [s.id, await scripts.values(s.id)]))); return { format: 'autotap-browser', version: 2, ...data, values }; }
    case 'GET_SETTINGS': return settings();
    case 'SAVE_SETTINGS': return mutate(async () => { const previous = await settings(); const blockedSites = [...new Set(message.settings?.blockedSites || [])]; if (blockedSites.length > 30) throw new Error('Use at most 30 blocked sites.'); blockedSites.forEach(validatePattern); const current = { scriptsPaused: !!message.settings?.scriptsPaused, blockedSites }; await chrome.storage.local.set({ settings: current }); try { await scripts.sync(); } catch (error) { await chrome.storage.local.set({ settings: previous }); await scripts.sync(); throw error; } return current; });
    case 'GET_ACTIVITY': return (await chrome.storage.local.get('activity')).activity || [];
    case 'CLEAR_ACTIVITY': return mutate(() => chrome.storage.local.set({ activity: [] }));
    case 'GET_SCRIPT_VALUES': return scripts.values(message.id);
    case 'SAVE_SCRIPT_VALUES': return mutate(() => scripts.saveValues(message.id, message.values));
    case 'GET_TAB_TOOLS': { const tab = await targetTab(tabId); const data = await library(); return { scripts: data.scripts.filter(s => scriptMatches(s, tab.url)).map(({ code, ...s }) => s), menus: (await scripts.menusFor(tabId)).map(({ token, ...m }) => m), settings: await settings() }; }
    case 'RUN_SAVED_SCRIPT': { const tab = await targetTab(tabId); const script = (await library()).scripts.find(s => s.id === message.id); if (!script) throw new Error('Script no longer exists.'); return scripts.run(script, tabId, tab.url); }
    case 'SCRIPT_COMMAND': return scripts.invoke(tabId, message.scriptId, message.id);
    case 'PICK_ELEMENT': { if ((await session(tabId)).mode !== 'idle') throw new Error('Stop the current session before picking an element.'); await targetTab(tabId); await inject(tabId); await chrome.tabs.update(tabId, { active: true }); const result = await chrome.tabs.sendMessage(tabId, { type: 'PICK_ELEMENT' }); if (!result?.ok) throw new Error(result?.error || 'Element selection cancelled.'); return result.element; }
    case 'VALIDATE_MACRO': { await targetTab(tabId); await inject(tabId); return chrome.tabs.sendMessage(tabId, { type: 'VALIDATE_MACRO', macro: sanitizeMacro(message.macro) }); }
    case 'EXTRACT_PAGE': { await targetTab(tabId); await inject(tabId); const result = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE', rowSelector: message.rowSelector, columns: message.columns }); if (!result.ok) throw new Error(result.error); return result; }
    case 'FETCH_ATTACHMENTS': return fetchDeclaredAttachments(message.script);
    case 'OPEN_WORKSPACE': await chrome.tabs.create({ url: chrome.runtime.getURL(`workspace.html${Number.isInteger(tabId) ? `?tab=${tabId}` : ''}`) }); return;
    case 'OPEN_DETAILS': await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }); return;
    default: throw new Error('Unknown AutoTap command.');
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'OFFSCREEN_CLIPBOARD') return false;
  handle(message, sender).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.message || String(error) })); return true;
});
chrome.runtime.onUserScriptMessage.addListener((message, sender, respond) => { scripts.receive(message, sender).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.message || String(error), kind: error.kind })); return true; });
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') { repository.changed(changes); scripts.changed(changes).catch(console.warn); } });
chrome.runtime.onInstalled.addListener(() => { chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(console.warn); mutate(() => scripts.sync()).catch(console.warn); });
chrome.runtime.onStartup.addListener(() => { mutate(() => scripts.sync()).catch(console.warn); });
chrome.permissions.onRemoved.addListener(() => { mutate(() => scripts.sync()).catch(console.warn); });
chrome.tabs.onRemoved.addListener(tabId => { mutate(async () => { await scripts.cleanup({ tabId }); const all = await chrome.storage.session.get(null); const keys = [`tab:${tabId}`, `menus:${tabId}`, ...Object.entries(all).filter(([key, value]) => key.startsWith('manual:') && value.tabId === tabId).map(([key]) => key)]; await chrome.storage.session.remove(keys); }).catch(console.warn); });
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') mutate(async () => { await chrome.storage.session.remove(`menus:${tabId}`); if ((await session(tabId)).mode !== 'idle') await finish(tabId, 'Page navigation stopped the session. Recorded actions were saved.'); }).catch(console.warn);
});
chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab) return;
  try { if (command === 'stop') await requestStop(tab.id); else if (command === 'record') await mutate(() => startRecording(tab.id)); } catch (error) { console.warn(error.message); }
});
