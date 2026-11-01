export const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro';
export const MAX_STEPS = 5000;
export const MAX_CODE = 200000;
export const VERSION = '1.4.2';
export const SUPPORTED_GRANTS = ['GM_info', 'GM_log', 'GM_addStyle', 'GM_addElement', 'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues', 'GM_getValues', 'GM_setValues', 'GM_deleteValues', 'GM_registerMenuCommand', 'GM_unregisterMenuCommand', 'GM_openInTab'];
SUPPORTED_GRANTS.push('GM_xmlhttpRequest', 'GM_addValueChangeListener', 'GM_removeValueChangeListener', 'GM_getResourceText', 'GM_getResourceURL', 'GM_notification', 'GM_setClipboard', 'GM_download');
export const canonicalGrant = value => ({ 'GM.xmlHttpRequest': 'GM_xmlhttpRequest', 'GM.getResourceUrl': 'GM_getResourceURL' }[value] || (value.startsWith('GM.') ? `GM_${value.slice(3)}` : value));
export const DEFAULT_SETTINGS = { scriptsPaused: false, blockedSites: [] };
export const DEFAULT_CODE = `// Make this page a little more yours.\n// Available: document, window, console, and standard Web APIs.\nconst heading = document.querySelector('h1');\nif (heading) {\n  heading.style.outline = '3px solid #6c9a3e';\n  heading.style.outlineOffset = '8px';\n}\nconsole.log('Hello from AutoTap!');`;
export const uid = () => crypto.randomUUID();
export const blankMacro = (name = 'Untitled macro') => ({ id: uid(), name, site: '', url: '', cycles: 1, speed: 1, cycleDelay: 500, startDelay: 500, elementTimeout: 8000, retries: 0, onError: 'stop', favorite: false, tags: [], steps: [], updatedAt: Date.now() });
export const blankScript = () => ({ id: uid(), name: 'Untitled script', code: DEFAULT_CODE, matches: [], excludeMatches: [], excludes: [], grants: [], namespace: '', scriptVersion: '1.0', description: '', enabled: false, favorite: false, tags: [], world: 'USER_SCRIPT', runAt: 'document_idle', updatedAt: Date.now() });
const number = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
const text = (v, max = 1000) => String(v ?? '').slice(0, max);
const itemId = value => /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(value || '') ? value : uid();
const tagsOf = raw => [...new Set((Array.isArray(raw) ? raw : []).map(t => text(t, 30).trim()).filter(Boolean))].slice(0, 12);
export function originOf(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : ''; } catch { return ''; } }
export function sitePattern(url) { const origin = originOf(url); return origin ? `${origin}/*` : ''; }
export function validatePattern(pattern) {
  if (!/^(https?|\*):\/\/(\*|(?:\*\.)?(?:[a-z0-9-]+\.)*[a-z0-9-]+(?::\d+)?)\/[^\s]*$/i.test(pattern)) throw new Error(`Invalid site pattern: ${pattern}. Use https://example.com/* or *://*/*`);
  return pattern;
}
export const normalizePattern = pattern => pattern === '<all_urls>' ? '*://*/*' : String(pattern).replace(/^(https?|\*):\/\/([^/]+)/i, (_, scheme, host) => `${scheme.toLowerCase()}://${host.toLowerCase()}`);
export function permissionPattern(pattern) {
  validatePattern(pattern);
  const [, scheme, host] = pattern.match(/^(\*|https?):\/\/([^/]+)\//i);
  return `${scheme.toLowerCase()}://${host.toLowerCase()}/*`;
}
export function matchesUrl(pattern, url) {
  try {
    validatePattern(pattern);
    const [, inputScheme, inputHost, path] = pattern.match(/^(\*|https?):\/\/([^/]+)(\/.*)$/i); const host = inputHost.toLowerCase(), scheme = inputScheme.toLowerCase();
    const target = new URL(url);
    const domain = host.startsWith('*.') ? host.slice(2) : host;
    if (scheme === '*' ? !/^https?:$/.test(target.protocol) : target.protocol !== `${scheme}:`) return false;
    if (host !== '*' && (host.startsWith('*.') ? target.host !== domain && !target.host.endsWith(`.${domain}`) : target.host !== host)) return false;
    const expression = path.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${expression}$`).test(target.pathname + target.search);
  } catch { return false; }
}
export function sanitizeStep(raw) {
  if (!raw || !['click', 'pointer', 'input', 'select', 'scroll', 'wheel', 'key', 'wait', 'waitFor', 'assertText', 'hover', 'checked'].includes(raw.type)) throw new Error('Unsupported action type.');
  const step = { type: raw.type, delay: Math.round(number(raw.delay, 0, 3600000, 200)), enabled: raw.enabled !== false };
  if (['click', 'input', 'select', 'wheel', 'key', 'waitFor', 'assertText', 'hover', 'checked'].includes(raw.type)) {
    step.selector = text(raw.selector, 2000).trim();
    if (!step.selector) throw new Error('An action is missing its CSS selector.');
    step.label = text(raw.label, 160);
  }
  if (['input', 'select'].includes(raw.type)) step.value = text(raw.value, 20000);
  if (raw.type === 'assertText') step.value = text(raw.value, 2000);
  if (raw.type === 'assertText' && !step.value) throw new Error('A text assertion needs expected text.');
  if (raw.type === 'checked') step.checked = raw.checked !== false;
  if (['waitFor', 'assertText'].includes(raw.type)) step.timeout = Math.round(number(raw.timeout, 100, 120000, 8000));
  if (raw.type === 'waitFor') step.condition = ['present', 'visible', 'hidden'].includes(raw.condition) ? raw.condition : 'visible';
  if (raw.type === 'key') { step.key = text(raw.key, 40) || 'Enter'; step.ctrlKey = !!raw.ctrlKey; step.shiftKey = !!raw.shiftKey; step.altKey = !!raw.altKey; step.metaKey = !!raw.metaKey; }
  if (['click', 'wheel'].includes(raw.type)) {
    step.buttons = Math.round(number(raw.buttons, 0, 31, 0));
    for (const key of ['ctrlKey', 'shiftKey', 'altKey', 'metaKey']) step[key] = !!raw[key];
    for (const key of ['pointX', 'pointY']) if (raw[key] !== undefined) step[key] = number(raw[key], 0, 1, .5);
  }
  if (raw.type === 'click') {
    step.button = Number(raw.button ?? 0);
    if (!Number.isInteger(step.button) || step.button < 0 || step.button > 4) throw new Error('Mouse button must be 0–4.');
    step.clickCount = Math.round(number(raw.clickCount, 1, 3, 1));
    step.pointerRecorded = raw.pointerRecorded === true;
  }
  if (raw.type === 'pointer') {
    if (!Array.isArray(raw.targets) || !raw.targets.length || raw.targets.length > 32 || raw.targets.some(value => typeof value !== 'string' || !value.trim() || value.length > 2000)) throw new Error('Pointer targets must contain 1–32 CSS selectors.');
    if (!Array.isArray(raw.events) || !raw.events.length || raw.events.length > 128) throw new Error('A pointer segment supports 1–128 events.');
    step.targets = raw.targets.map(value => value.trim()); let previous = 0;
    const kinds = ['down', 'move', 'up', 'dragstart', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend'];
    step.events = raw.events.map(value => {
      const packed = Array.isArray(value);
      if (packed && (value.length < 5 || value.length > 9)) throw new Error('Invalid packed pointer event.');
      const point = packed ? { kind: kinds[value[0]], target: value[1], x: value[2] / 100000, y: value[3] / 100000, t: value[4], detail: value[8] || 0, button: value[5] || 0, buttons: value[6] || 0, modifiers: value[7] || 0 } : value;
      if (!point || !kinds.includes(point.kind)) throw new Error('Unsupported pointer event.');
      if (!Number.isInteger(point.target) || point.target < 0 || point.target >= step.targets.length) throw new Error('Invalid pointer target index.');
      const t = Math.round(number(point.t, previous, 3600000, previous)); previous = t;
      const flags = packed ? Math.round(number(point.modifiers, 0, 15, 0)) : (point.altKey ? 1 : 0) | (point.ctrlKey ? 2 : 0) | (point.metaKey ? 4 : 0) | (point.shiftKey ? 8 : 0);
      const row = [kinds.indexOf(point.kind), point.target, Math.round(number(point.x, 0, 1, .5) * 100000), Math.round(number(point.y, 0, 1, .5) * 100000), t, Math.round(number(point.button, 0, 4, 0)), Math.round(number(point.buttons, 0, 31, 0)), flags, Math.round(number(point.detail, 0, 3, 0))];
      while (row.length > 5 && row.at(-1) === 0) row.pop();
      return row;
    });
  }
  if (raw.type === 'wheel') {
    for (const key of ['deltaX', 'deltaY', 'deltaZ']) step[key] = number(raw[key], -100000, 100000, 0);
    step.deltaMode = Number(raw.deltaMode ?? 0);
    if (![0, 1, 2].includes(step.deltaMode)) throw new Error('Wheel delta mode must be pixels, lines or pages.');
    if (raw.scrolls !== undefined) {
      if (!Array.isArray(raw.scrolls) || raw.scrolls.length > 8) throw new Error('A wheel gesture supports at most 8 scroll targets.');
      step.scrolls = raw.scrolls.map(target => {
        if (!target || typeof target !== 'object') throw new Error('Invalid wheel scroll target.');
        return { selector: text(target.selector, 2000).trim(), x: Math.round(number(target.x, -10000000, 10000000, 0)), y: Math.round(number(target.y, 0, 10000000, 0)) };
      });
    }
  }
  if (raw.type === 'scroll') { step.x = Math.round(number(raw.x, -10000000, 10000000, 0)); step.y = Math.round(number(raw.y, 0, 10000000, 0)); step.selector = text(raw.selector, 2000); }
  return step;
}
export function sanitizeMacro(raw, freshId = false) {
  if (!raw || !Array.isArray(raw.steps) || raw.steps.length > MAX_STEPS) throw new Error(`A macro must contain at most ${MAX_STEPS} actions.`);
  return { id: freshId ? uid() : itemId(raw.id), name: text(raw.name, 100).trim() || 'Untitled macro', site: originOf(raw.site || raw.url), url: text(raw.url, 4000), cycles: Math.round(number(raw.cycles, 1, 9999, 1)), speed: number(raw.speed, 0.25, 4, 1), cycleDelay: Math.round(number(raw.cycleDelay, 0, 3600000, 500)), startDelay: Math.round(number(raw.startDelay, 0, 3600000, 500)), elementTimeout: Math.round(number(raw.elementTimeout, 100, 120000, 8000)), retries: Math.round(number(raw.retries, 0, 3, 0)), onError: raw.onError === 'skip' ? 'skip' : 'stop', favorite: !!raw.favorite, tags: tagsOf(raw.tags), steps: raw.steps.map(sanitizeStep), updatedAt: Date.now() };
}
export function sanitizeScript(raw, freshId = false) {
  if (!raw || typeof raw.code !== 'string' || raw.code.length > MAX_CODE) throw new Error('Script must be JavaScript text under 200 KB.');
  const matches = [...new Set((Array.isArray(raw.matches) ? raw.matches : []).map(p => normalizePattern(String(p).trim())).filter(Boolean))];
  if (matches.length > 30) throw new Error('Use at most 30 site patterns per script.');
  matches.forEach(validatePattern);
  const excludeMatches = [...new Set((Array.isArray(raw.excludeMatches) ? raw.excludeMatches : []).map(p => normalizePattern(String(p).trim())))];
  if (excludeMatches.length > 30) throw new Error('Use at most 30 exclusions.');
  excludeMatches.forEach(validatePattern);
  const excludes = [...new Set((Array.isArray(raw.excludes) ? raw.excludes : []).map(p => text(p, 2000)))];
  if (excludes.length > 30 || excludes.some(p => !/^(https?|\*):\/\/[^\s]+$/i.test(p))) throw new Error('Use HTTP(S) wildcard URL exclusions, one per line.');
  const includes = [...new Set((Array.isArray(raw.includes) ? raw.includes : []).map(p => text(p, 2000)))];
  if (includes.length > 30 || includes.some(p => !/^(https?|\*):\/\/[^\s]+$/i.test(p))) throw new Error('Use HTTP(S) URL globs for @include; regular expressions are not supported.');
  const connect = [...new Set((Array.isArray(raw.connect) ? raw.connect : []).map(p => String(p).trim().toLowerCase()).filter(Boolean))];
  if (connect.length > 30 || connect.some(host => !/^(self|\*|(?:\*\.)?(?:[a-z0-9-]+\.)*[a-z0-9-]+(?::\d+)?)$/.test(host))) throw new Error('Use @connect self, *, or host names such as api.example.com.');
  const requires = (Array.isArray(raw.requires) ? raw.requires : []).map(item => ({ url: text(item.url, 2000), code: text(item.code, 200001) }));
  if (requires.length > 12 || requires.some(item => !item.url || item.code.length > 200000) || requires.reduce((n, item) => n + item.code.length, 0) > 500000) throw new Error('Attach at most 12 libraries, 200 KB each and 500 KB total.');
  const resources = (Array.isArray(raw.resources) ? raw.resources : []).map(item => ({ name: text(item.name, 100), url: text(item.url, 2000), mime: /^[\w.+-]+\/[\w.+-]+$/.test(item.mime || '') ? item.mime : 'text/plain', data: String(item.data || '') }));
  if (resources.length > 16 || new Set(resources.map(r => r.name)).size !== resources.length || resources.some(r => !r.name || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.data)) || resources.reduce((n, r) => n + r.data.length, 0) > 700000) throw new Error('Attach unique named resources up to 512 KB total (base64).');
  const grants = [...new Set((Array.isArray(raw.grants) ? raw.grants : []).map(canonicalGrant).filter(g => g !== 'none'))];
  const unsupported = grants.filter(g => !SUPPORTED_GRANTS.includes(g));
  if (unsupported.length) throw new Error(`Unsupported script permissions: ${unsupported.join(', ')}`);
  if (grants.length && raw.world === 'MAIN') throw new Error('GM APIs require the isolated execution context. Use Page context with no GM grants.');
  return { id: freshId ? uid() : itemId(raw.id), name: text(raw.name, 100).trim() || 'Untitled script', code: raw.code, matches, includes, excludeMatches, excludes, connect, requires, resources, allFrames: !!raw.allFrames, grants, namespace: text(raw.namespace, 200), scriptVersion: text(raw.scriptVersion, 50) || '1.0', description: text(raw.description, 500), enabled: freshId ? false : !!raw.enabled, favorite: !!raw.favorite, tags: tagsOf(raw.tags), world: raw.world === 'MAIN' ? 'MAIN' : 'USER_SCRIPT', runAt: ['document_start', 'document_end', 'document_idle'].includes(raw.runAt) ? raw.runAt : 'document_idle', updatedAt: Date.now() };
}
export function parseImport(source) {
  if (source.length > 16000000) throw new Error('The backup is too large (maximum 16 MB).');
  let data; try { data = JSON.parse(source); } catch { throw new Error('This file is not valid JSON.'); }
  if (data.format !== 'autotap-browser' || ![1, 2].includes(data.version) || !Array.isArray(data.macros) || !Array.isArray(data.scripts)) throw new Error('Choose an AutoTap browser backup (version 1 or 2).');
  if (data.macros.length + data.scripts.length > 300) throw new Error('Import at most 300 items at a time.');
  const scripts = data.scripts.map(s => sanitizeScript(s, true));
  const values = Object.fromEntries(data.scripts.flatMap((s, i) => data.values && Object.hasOwn(data.values, s.id) ? [[scripts[i].id, validateValues(data.values[s.id])]] : []));
  return { macros: data.macros.map(m => sanitizeMacro(m, true)), scripts, values };
}
export function validateValues(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Script values must be a JSON object.');
  let encoded; try { encoded = JSON.stringify(values); } catch { throw new Error('Script values must be JSON serializable.'); }
  if (new TextEncoder().encode(encoded).length > 131072 || Object.keys(values).length > 500) throw new Error('Each script can store up to 128 KB and 500 keys.');
  return JSON.parse(encoded);
}
export function globMatches(pattern, url) { const expression = pattern.split(/([*?])/).map(p => p === '*' ? '.*' : p === '?' ? '.' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(''); return new RegExp(`^${expression}$`).test(url); }
export function scriptMatches(script, url) { return /^https?:/.test(url) && (script.matches.some(p => matchesUrl(p, url)) || (script.includes || []).some(p => globMatches(p, url))) && !(script.excludeMatches || []).some(p => matchesUrl(p, url)) && !(script.excludes || []).some(p => globMatches(p, url)); }
export function candidatePatterns(script) { return [...new Set([...script.matches, ...(script.includes || []).map(glob => { const host = glob.match(/^(https?|\*):\/\/([^/]+)/i); const pattern = host ? `${host[1]}://${host[2]}/*` : '*://*/*'; try { return validatePattern(pattern); } catch { return '*://*/*'; } })])]; }
export function scriptPermissions(script, url = '', automatic = false) {
  const origins = automatic ? candidatePatterns(script).map(permissionPattern) : url ? [sitePattern(url)] : [];
  if (script.grants?.some(g => ['GM_xmlhttpRequest', 'GM_download'].includes(g))) for (const host of script.connect || []) {
    if (host === 'self') continue;
    if (host === '*') origins.push('http://*/*', 'https://*/*');
    else { const domain = host.replace(/^\*\./, ''); origins.push(`http://${domain}/*`, `https://${domain}/*`); if (!domain.includes(':') && !/^\d+(?:\.\d+){3}$/.test(domain)) origins.push(`http://*.${domain}/*`, `https://*.${domain}/*`); }
  }
  const permissions = ['GM_notification', 'GM_download', 'GM_setClipboard'].flatMap((grant, i) => script.grants?.includes(grant) ? [['notifications', 'downloads', 'clipboardWrite'][i]] : []);
  return { origins: [...new Set(origins.filter(Boolean))], permissions };
}
export function connectionAllowed(script, target, senderUrl) {
  let url; try { url = new URL(target); } catch { return false; }
  if (!originOf(url.href) || url.username || url.password) return false;
  return (script.connect || []).some(host => host === '*' || host === 'self' && url.origin === originOf(senderUrl) || host !== 'self' && (host.includes(':') ? url.host === host.replace(/^\*\./, '') : url.hostname === host.replace(/^\*\./, '') || url.hostname.endsWith(`.${host.replace(/^\*\./, '')}`)));
}
export function assertAttachments(script) { const missing = [...(script.requires || []).filter(r => !r.code).map(r => `@require ${r.url}`), ...(script.resources || []).filter(r => !r.data).map(r => `@resource ${r.name}`)]; if (missing.length) throw new Error(`Attach local files before running: ${missing.join(', ')}`); }
export function toCSV(rows, columns = Object.keys(rows[0] || {})) { const cell = value => { let s = String(value ?? ''); if (/^[\s\uFEFF]*[=+\-@]|^[\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; }; return [columns.map(cell).join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n'); }
export function parseUserScript(source, filename = 'Imported script') {
  const header = source.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/)?.[1] || '';
  const entries = [...header.matchAll(/^\s*\/\/\s*@([\w-]+(?::[\w-]+)?)\s*([^\r\n]*)/gm)];
  const all = key => entries.filter(m => m[1] === key).map(m => m[2].trim()).filter(Boolean);
  const grants = all('grant');
  if (grants.includes('none') && grants.length > 1) throw new Error('@grant none cannot be combined with other grants.');
  return sanitizeScript({ ...blankScript(), name: all('name')[0] || filename.replace(/\.user\.js$|\.js$/i, ''), code: source, matches: all('match'), includes: all('include'), excludeMatches: all('exclude-match'), excludes: all('exclude'), connect: all('connect'), requires: all('require').map(url => ({ url, code: '' })), resources: all('resource').map(value => { const [name, ...url] = value.split(/\s+/); return { name, url: url.join(' '), data: '' }; }), allFrames: !entries.some(m => m[1] === 'noframes'), grants, namespace: all('namespace')[0], scriptVersion: all('version')[0], description: all('description')[0], tags: all('tag'), runAt: (all('run-at')[0] || 'document-idle').replace('-', '_') });
}
export function exportUserScript(script) {
  const source = script.code.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/, '');
  const fields = [['name', script.name], ['namespace', script.namespace], ['version', script.scriptVersion], ['description', script.description], ...script.matches.map(v => ['match', v]), ...(script.includes || []).map(v => ['include', v]), ...(script.excludeMatches || []).map(v => ['exclude-match', v]), ...(script.excludes || []).map(v => ['exclude', v]), ...(script.connect || []).map(v => ['connect', v]), ...(script.requires || []).map(v => ['require', v.url]), ...(script.resources || []).map(v => ['resource', `${v.name} ${v.url || `local:${v.name}`}`]), ['run-at', script.runAt.replace('_', '-')], ...((script.grants || []).length ? script.grants.map(v => ['grant', v]) : [['grant', 'none']]), ...(!script.allFrames ? [['noframes', '']] : [])];
  return `// ==UserScript==\n${fields.filter(([key, value]) => value || key === 'noframes').map(([key, value]) => `// @${key} ${String(value).replace(/[\r\n]/g, ' ')}`).join('\n')}\n// ==/UserScript==\n\n${source}`;
}
export function wrapUserCode(code) {
  // The userScripts API, never eval or a remote script loader, executes user code.
  return `(async () => {\ntry {\nawait (async () => {\n${code}\n})();\nreturn { ok: true };\n} catch (error) { return { ok: false, error: String(error?.message || error) }; }\n})()`;
}
