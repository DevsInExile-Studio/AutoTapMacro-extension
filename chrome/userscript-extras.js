// Serialized into the userscript world alongside the packaged compatibility runtime.
export function bootstrapExtras(runtime, config) {
  const { api, GM, rpc } = runtime;
  const listeners = new Map(), notifications = new Map(), downloads = new Map(), resourceURLs = new Map();
  const bytes64 = bytes => { let result = ''; for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(result); };
  const decode = data => Uint8Array.from(atob(data), char => char.charCodeAt(0));
  const expose = (name, implementation, modern = name.slice(3)) => { if (!config.grants.includes(name)) return; api[name] = implementation; GM[modern] = async (...args) => implementation(...args); };
  const errorCallback = async (options, error) => { const kind = error.kind === 'timeout' ? 'ontimeout' : error.kind === 'abort' ? 'onabort' : 'onerror'; if (typeof options[kind] === 'function') await options[kind]({ error: error.message, status: 0, readyState: 4 }); };
  async function bodyData(data, headers) {
    if (data == null || typeof data === 'string') return { data };
    if (data instanceof URLSearchParams) { headers['Content-Type'] ||= 'application/x-www-form-urlencoded;charset=UTF-8'; return { data: data.toString() }; }
    if (data instanceof FormData) { const entries = [...data.entries()]; if (entries.some(([, value]) => typeof value !== 'string')) throw new Error('FormData file uploads are not supported; pass Blob/ArrayBuffer data instead.'); headers['Content-Type'] ||= 'application/x-www-form-urlencoded;charset=UTF-8'; return { data: new URLSearchParams(entries).toString() }; }
    if (data instanceof Blob && data.size > 1048576) throw new Error('Request body exceeds 1 MB.');
    const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
    if (bytes) { if (bytes.length > 1048576) throw new Error('Request body exceeds 1 MB.'); return { data: bytes64(bytes), binary: true }; }
    throw new Error('Serialize object request bodies with JSON.stringify.');
  }
  function xhr(options, modern = false) {
    if (!options || !options.url) throw new Error('GM_xmlhttpRequest needs a URL.');
    const id = crypto.randomUUID(); let aborted = false, sent = false;
    const promise = (async () => {
      const headers = { ...options.headers }; const body = await bodyData(options.data, headers);
      if (aborted) throw Object.assign(new Error('Network request aborted.'), { kind: 'abort' });
      sent = true;
      const result = await rpc('XHR', { id, request: { url: new URL(options.url, location.href).href, method: options.method, headers, ...body, timeout: options.timeout, responseType: options.responseType, anonymous: options.anonymous } }, { quiet: true });
      if (result.binary) { const bytes = decode(result.response); result.response = options.responseType === 'blob' ? new Blob([bytes], { type: result.contentType }) : bytes.buffer; }
      if (options.responseType === 'document') { result.responseXML = new DOMParser().parseFromString(result.responseText, /xml/.test(options.overrideMimeType || result.contentType) ? 'application/xml' : 'text/html'); result.response = result.responseXML; }
      else if (options.responseType !== 'json' && !result.binary) result.response = result.responseText;
      await options.onreadystatechange?.(result); await options.onprogress?.({ lengthComputable: true, loaded: result.loaded, total: result.loaded }); await options.onload?.(result); return result;
    })();
    const abort = () => { aborted = true; if (sent) rpc('XHR_ABORT', { id }, { quiet: true }).catch(() => {}); };
    const handled = promise.catch(async error => { await errorCallback(options, error); if (modern || !options.onerror && !options.ontimeout && !options.onabort) throw error; });
    runtime.track(handled, { quiet: modern || !!(options.onerror || options.ontimeout || options.onabort) });
    handled.abort = abort;
    return modern ? handled : { abort };
  }
  expose('GM_xmlhttpRequest', options => xhr(options));
  if (config.grants.includes('GM_xmlhttpRequest')) GM.xmlHttpRequest = GM.xmlhttpRequest = options => xhr(options, true);
  expose('GM_addValueChangeListener', (key, callback) => {
    if (typeof callback !== 'function') throw new Error('A value listener needs a callback.');
    const id = crypto.randomUUID(); listeners.set(id, callback); rpc('LISTENER_ADD', { id, key: String(key) }).catch(console.warn); return id;
  });
  expose('GM_removeValueChangeListener', id => { listeners.delete(String(id)); return rpc('LISTENER_REMOVE', { id: String(id) }); });
  const resource = name => { const found = (config.resources || []).find(item => item.name === name); if (!found?.data) throw new Error(`Attach a resource named ${name}.`); return found; };
  expose('GM_getResourceText', name => new TextDecoder().decode(decode(resource(String(name)).data)));
  expose('GM_getResourceURL', name => { name = String(name); if (!resourceURLs.has(name)) { const item = resource(name); resourceURLs.set(name, URL.createObjectURL(new Blob([decode(item.data)], { type: item.mime }))); } return resourceURLs.get(name); });
  if (GM.getResourceURL) GM.getResourceUrl = GM.getResourceURL;
  expose('GM_setClipboard', (text, info, callback) => { const type = typeof info === 'string' ? info : info?.type || 'text'; if (!['text', 'text/plain'].includes(type)) throw new Error('Only plain-text clipboard writes are supported.'); return rpc('CLIPBOARD', { text: String(text) }).then(() => callback?.()); });
  expose('GM_notification', (details, title, image, onclick) => {
    const options = typeof details === 'object' ? details : { text: String(details), title, image, onclick };
    if (typeof details === 'object' && typeof title === 'function') options.ondone = title;
    const id = crypto.randomUUID(); notifications.set(id, { ...options, done: false });
    const ready = rpc('NOTIFY', { id, text: options.text, title: options.title, timeout: options.timeout });
    return { ready, remove: async () => rpc('NOTIFY_REMOVE', { id: (await ready).id }) };
  });
  function download(options, filename, modern = false) {
    const details = typeof options === 'string' ? { url: options, name: filename } : options;
    if (!details?.url) throw new Error('GM_download needs a URL.');
    const id = crypto.randomUUID(); let resolve, reject, nativeId, aborted = false;
    const complete = new Promise((yes, no) => { resolve = yes; reject = no; }); complete.catch(() => {});
    downloads.set(id, { ...details, resolve, reject, done: false });
    const ready = (async () => {
      let url = details.url;
      if (url instanceof Blob || String(url).startsWith('blob:')) { const blob = url instanceof Blob ? url : await (await fetch(url)).blob(); if (blob.size > 2097152) throw new Error('Blob downloads are limited to 2 MB.'); url = `data:${blob.type || 'application/octet-stream'};base64,${bytes64(new Uint8Array(await blob.arrayBuffer()))}`; }
      const result = await rpc('DOWNLOAD', { id, url: String(url), name: details.name, saveAs: details.saveAs, headers: details.headers, anonymous: details.anonymous }, { quiet: true }); nativeId = result.id;
      if (aborted) await rpc('DOWNLOAD_ABORT', { id: nativeId }); return result;
    })().catch(error => { details.onerror?.({ error: error.message }); downloads.delete(id); reject(error); if (modern || !details.onerror) throw error; });
    runtime.track(ready, { quiet: !modern && !!details.onerror });
    const abort = async () => { if (!downloads.has(id)) return; aborted = true; return rpc('DOWNLOAD_ABORT', { requestId: id, id: nativeId }, { quiet: true }); };
    if (modern) { complete.abort = abort; return complete; } return { abort, ready };
  }
  expose('GM_download', (options, filename) => download(options, filename));
  if (config.grants.includes('GM_download')) GM.download = (options, filename) => download(options, filename, true);
  globalThis.__autotapScriptEvents ||= Object.create(null);
  globalThis.__autotapScriptEvents[config.id] = async event => {
    if (event.type === 'value') {
      const callback = listeners.get(event.id); if (!callback) return false;
      runtime.updateCache(event.key, event.newValue);
      try { await callback(event.key, event.oldValue, event.newValue, !!event.remote); } catch (error) { rpc('ERROR', { message: `Value listener: ${error.message}` }).catch(console.warn); } return true;
    }
    if (event.type === 'notification') {
      const item = notifications.get(event.id); if (!item) return false;
      if (event.event === 'click') await item.onclick?.();
      else if (!item.done) { item.done = true; notifications.delete(event.id); await item.ondone?.(); } return true;
    }
    if (event.type === 'download') {
      const item = downloads.get(event.id); if (!item || item.done) return false; item.done = true; downloads.delete(event.id);
      if (event.event === 'load') { await item.onload?.({ readyState: 4 }); item.resolve({ readyState: 4 }); }
      else { const error = new Error(event.error || 'Download interrupted.'); await item.onerror?.({ error: error.message }); item.reject(error); } return true;
    }
    return false;
  };
}

export function urlRulesMatch(script, url) {
  const glob = (pattern, input) => new RegExp('^' + pattern.split(/([*?])/).map(p => p === '*' ? '.*' : p === '?' ? '.' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$').test(input);
  const match = pattern => {
    try { const [, scheme, host, path] = pattern.match(/^(\*|https?):\/\/([^/]+)(\/.*)$/i), parsed = new URL(url), domain = host.replace(/^\*\./, '').toLowerCase(); return (scheme === '*' || `${scheme.toLowerCase()}:` === parsed.protocol) && (host === '*' || parsed.host === domain || host.startsWith('*.') && parsed.host.endsWith('.' + domain)) && new RegExp('^' + path.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(parsed.pathname + parsed.search); } catch { return false; }
  };
  return /^https?:/.test(url) && ((script.matches || []).some(match) || (script.includes || []).some(p => glob(p, url))) && !(script.excludeMatches || []).some(match) && !(script.excludes || []).some(p => glob(p, url));
}
