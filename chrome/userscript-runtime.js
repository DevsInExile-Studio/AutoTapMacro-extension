import { VERSION, wrapUserCode } from './core.js';
import { bootstrapExtras, urlRulesMatch } from './userscript-extras.js';

// This function is serialized into a Chrome USER_SCRIPT world. No eval or page-message bridge.
function bootstrap(config) {
  const cache = Object.assign(Object.create(null), config.values);
  const pending = new Set(), callbacks = new Map(), failures = [];
  let order = Promise.resolve();
  const track = (promise, options = {}) => { pending.add(promise); promise.then(() => pending.delete(promise), error => { pending.delete(promise); if (!options.quiet) failures.push(error); }); return promise; };
  const ordered = new Set(['START', 'GET_VALUES', 'SET_VALUES', 'DELETE_VALUES', 'LISTENER_ADD', 'LISTENER_REMOVE', 'MENU_SET', 'MENU_REMOVE']);
  const rpc = (op, args = {}, options = {}) => {
    const send = () => chrome.runtime.sendMessage({ type: 'GM', token: config.token, scriptId: config.id, op, ...args }).then(reply => { if (!reply?.ok) throw Object.assign(new Error(reply?.error || 'AutoTap script connection lost.'), { kind: reply?.kind }); return reply.data; });
    const promise = ordered.has(op) ? order.then(send) : send(); if (ordered.has(op)) order = promise.catch(() => {}); return track(promise, options);
  };
  const has = key => Object.hasOwn(cache, key);
  const requireGrant = name => { if (!config.grants.includes(name)) throw new Error(`Add @grant ${name} before using this API.`); };
  const safeValue = value => { const encoded = JSON.stringify(value); if (encoded === undefined) throw new Error('GM values must be JSON serializable.'); return JSON.parse(encoded); };
  function appendToRoot(element) { const root = document.head || document.documentElement; if (root) { root.append(element); return; } const observer = new MutationObserver(() => { const target = document.head || document.documentElement; if (target) { target.append(element); observer.disconnect(); } }); observer.observe(document, { childList: true, subtree: true }); }
  const legacy = {
    GM_getValue: (key, fallback) => has(String(key)) ? structuredClone(cache[String(key)]) : fallback,
    GM_listValues: () => Object.keys(cache),
    GM_getValues: keys => { const defaults = Array.isArray(keys) ? Object.fromEntries(keys.map(k => [k, undefined])) : keys; return Object.fromEntries(Object.entries(defaults || cache).map(([key, fallback]) => [key, has(key) ? structuredClone(cache[key]) : fallback])); },
    GM_setValue: (key, value) => { cache[String(key)] = safeValue(value); return rpc('SET_VALUES', { values: { [String(key)]: cache[String(key)] } }); },
    GM_setValues: values => { const safe = safeValue(values); Object.assign(cache, safe); return rpc('SET_VALUES', { values: safe }); },
    GM_deleteValue: key => { delete cache[String(key)]; return rpc('DELETE_VALUES', { keys: [String(key)] }); },
    GM_deleteValues: keys => { keys.forEach(key => delete cache[String(key)]); return rpc('DELETE_VALUES', { keys: keys.map(String) }); },
    GM_addStyle: css => { const style = document.createElement('style'); style.textContent = String(css); appendToRoot(style); return style; },
    GM_addElement: (parent, tag, attrs) => { const defaultRoot = typeof parent === 'string'; if (defaultRoot) { attrs = tag; tag = parent; } const el = document.createElement(tag); for (const [key, value] of Object.entries(attrs || {})) key === 'textContent' ? el.textContent = String(value) : el.setAttribute(key, String(value)); defaultRoot ? appendToRoot(el) : parent.append(el); return el; },
    GM_log: (...args) => { console.log(`[AutoTap · ${config.name}]`, ...args); return rpc('LOG', { level: 'info', message: args.map(value => { try { return typeof value === 'string' ? value : JSON.stringify(value); } catch { return String(value); } }).join(' ').slice(0, 1500) }); },
    GM_registerMenuCommand: (name, callback, options) => { if (typeof callback !== 'function') throw new Error('A menu command needs a callback.'); const id = String(typeof options === 'object' && options.id || crypto.randomUUID()); callbacks.set(id, callback); rpc('MENU_SET', { id, label: String(name).slice(0, 100) }).catch(console.warn); return id; },
    GM_unregisterMenuCommand: id => { callbacks.delete(String(id)); return rpc('MENU_REMOVE', { id: String(id) }); },
    GM_openInTab: (url, options) => { const ready = rpc('OPEN_TAB', { url: new URL(url, location.href).href, active: typeof options === 'boolean' ? !options : options?.active !== false }); return { ready, close: async () => rpc('CLOSE_TAB', { tabId: (await ready).tabId }) }; }
  };
  const api = {};
  for (const [name, implementation] of Object.entries(legacy)) {
    if (!config.grants.includes(name)) continue;
    api[name] = (...args) => { requireGrant(name); return implementation(...args); };
  }
  const GM = {};
  for (const [name, implementation] of Object.entries(api)) GM[name.slice(3)] = async (...args) => {
    if (['GM_getValue', 'GM_getValues', 'GM_listValues'].includes(name)) { const values = await rpc('GET_VALUES'); for (const key of Object.keys(cache)) delete cache[key]; Object.assign(cache, values); }
    return implementation(...args);
  };
  const info = Object.freeze({ scriptHandler: 'AutoTap Macro', version: config.handlerVersion, scriptMetaStr: config.meta, scriptWillUpdate: false, script: { name: config.name, namespace: config.namespace, version: config.scriptVersion, description: config.description, grants: config.grants, matches: config.matches, includes: config.includes, excludes: config.excludes, resources: config.resources.map(item => ({ name: item.name, url: item.url })), options: { noframes: !config.allFrames } } });
  api.GM_info = info; GM.info = info;
  const key = `autotap:${config.id}`;
  // Re-running a script replaces its old menu callbacks in this world.
  globalThis.__autotapScriptMenus ||= Object.create(null);
  globalThis.__autotapScriptMenus[key] = async id => { const callback = callbacks.get(id); if (!callback) throw new Error('Menu command expired. Reload the page.'); await callback(); await drain(); return { ok: true }; };
  async function drain() { while (pending.size) await Promise.all([...pending]); if (failures.length) throw failures.shift(); }
  return { api, GM, rpc, drain, track, updateCache: (key, value) => { if (value === undefined) delete cache[key]; else cache[key] = value; } };
}

export function buildUserCode(script, { token, values = {}, automatic = false } = {}) {
  const guard = automatic ? `if (!(${urlRulesMatch.toString()})(${JSON.stringify({ matches: script.matches, includes: script.includes, excludeMatches: script.excludeMatches, excludes: script.excludes })}, location.href)) return;\n` : '';
  const code = `${(script.requires || []).map(item => item.code).join('\n;\n')}\n;\n${script.code}`;
  if (script.world === 'MAIN') return wrapUserCode(guard + code);
  const config = { id: script.id, name: script.name, namespace: script.namespace, scriptVersion: script.scriptVersion, description: script.description, matches: script.matches, includes: script.includes || [], excludes: script.excludes || [], allFrames: !!script.allFrames, meta: script.code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/)?.[1] || '', resources: script.resources || [], grants: script.grants || [], handlerVersion: VERSION, token, values };
  const bindings = ['GM_info', 'GM_log', 'GM_addStyle', 'GM_addElement', 'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues', 'GM_getValues', 'GM_setValues', 'GM_deleteValues', 'GM_registerMenuCommand', 'GM_unregisterMenuCommand', 'GM_openInTab', 'GM_xmlhttpRequest', 'GM_addValueChangeListener', 'GM_removeValueChangeListener', 'GM_getResourceText', 'GM_getResourceURL', 'GM_notification', 'GM_setClipboard', 'GM_download'].join(', ');
  return `(async () => { ${guard} if (typeof globalThis.chrome?.runtime?.sendMessage !== 'function') return { ok: false, error: 'Chrome has reached its isolated-script limit on this page. Reload the page before running more distinct scripts.' }; const __cfg = ${JSON.stringify(config)}; const __at = (${bootstrap.toString()})(__cfg); (${bootstrapExtras.toString()})(__at, __cfg); const GM = __at.GM; const { ${bindings} } = __at.api; try { __at.rpc('START', { automatic: ${automatic} }); await (async () => {\n${code}\n})(); await __at.drain(); await __at.rpc('END', { message: 'Script finished.' }); return { ok: true }; } catch (error) { const message = String(error?.message || error); let reported = false; try { await __at.rpc('ERROR', { message }); reported = true; } catch {} return { ok: false, error: message, reported }; } })()`;
}
