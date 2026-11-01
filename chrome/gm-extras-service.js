import { connectionAllowed, sitePattern, originOf } from './core.js';
export function parseJSONResponse(text) { try { return JSON.parse(text); } catch { return null; } }

export function normalizeRequest(raw) {
  if (!raw || typeof raw.url !== 'string' || raw.url.length > 6000) throw new Error('A request needs an HTTP(S) URL.');
  const method = String(raw.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)) throw new Error('Unsupported HTTP method.');
  const headers = Object.fromEntries(Object.entries(raw.headers || {}).map(([key, value]) => [key, String(value)]));
  if (Object.keys(headers).length > 40 || JSON.stringify(headers).length > 16000) throw new Error('Too many request headers.');
  if (Object.keys(headers).some(key => /^(cookie2?|host|origin|referer|user-agent|content-length|connection|accept-encoding|sec-.+|proxy-.+)$/i.test(key))) throw new Error('Cookie, origin, referer and browser-controlled request headers cannot be overridden.');
  if (!['text', 'json', 'arraybuffer', 'blob', 'document'].includes(raw.responseType || 'text')) throw new Error('Unsupported responseType. Use text, json, arraybuffer, blob or document.');
  if (raw.data != null) {
    if (typeof raw.data !== 'string') throw new Error('Request bodies must be serialized.');
    const bytes = raw.binary ? atob(raw.data).length : new TextEncoder().encode(raw.data).length;
    if (raw.data.length > 1400000 || bytes > 1048576) throw new Error('Request bodies are limited to 1 MB.');
  }
  return { url: raw.url, method, headers, data: raw.data, binary: !!raw.binary, timeout: Math.min(30000, Math.max(100, Number(raw.timeout) || 15000)), responseType: raw.responseType || 'text', anonymous: raw.anonymous !== false };
}
const base64 = bytes => { let text = ''; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(text); };
export function safeFilename(input) {
  const value = String(input || 'download').replace(/\\/g, '/');
  if (value.length > 180 || /^(\/|[a-z]:)/i.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Use a relative filename without parent-directory segments.');
  return value.replace(/[<>:"|?*\x00-\x1f]/g, '_');
}
export function createGMExtras({ authorize, allowed, mutate, worldId }) {
  const requests = new Map(), aborted = new Map(), origins = new Map(); let offscreenCreating, notificationListeners = false, downloadListeners = false;
  const session = async key => (await chrome.storage.session.get(key))[key];
  async function nativePermission(name) { if (!await chrome.permissions.contains({ permissions: [name] })) throw new Error(`Grant Chrome's ${name} permission by running/saving this script from the workshop.`); }
  async function permitURL(script, url, senderUrl) {
    if (!connectionAllowed(script, url, senderUrl)) throw new Error('The target is not allowed by this script’s @connect rules.');
    if (!await chrome.permissions.contains({ origins: [sitePattern(url)] })) throw new Error('Grant site access for the @connect target in the workshop.');
  }
  async function dispatch(target, event) {
    try {
      await authorize({ scriptId: target.scriptId, token: target.token }, { tab: { id: target.tabId }, frameId: target.frameId || 0, documentId: target.documentId, url: target.url });
      const result = await chrome.userScripts.execute({ target: { tabId: target.tabId, documentIds: [target.documentId] }, world: 'USER_SCRIPT', worldId: worldId(target.scriptId), js: [{ code: `(async () => { const fn = globalThis.__autotapScriptEvents?.[${JSON.stringify(target.scriptId)}]; if (!fn) return false; return await fn(${JSON.stringify(event)}); })()` }] });
      return !result[0]?.error && result[0]?.result !== false;
    } catch { return false; }
  }
  const targetOf = (script, message, sender) => ({ scriptId: script.id, token: message.token, tabId: sender.tab.id, frameId: sender.frameId, documentId: sender.documentId, url: sender.url });
  async function writeValues(id, next, sender, token) {
    const key = `values:${id}`, previous = (await chrome.storage.local.get(key))[key] || {};
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    const record = { fingerprint: JSON.stringify(next), documentId: sender?.documentId, token };
    const queue = origins.get(id) || []; queue.push(record); origins.set(id, queue.slice(-20));
    try { await chrome.storage.local.set({ [key]: next }); } catch (error) { origins.set(id, queue.filter(item => item !== record)); throw error; }
  }
  async function changed(changes) {
    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith('values:')) continue;
      const id = key.slice(7), before = change.oldValue || {}, after = change.newValue || {};
      const queue = origins.get(id) || []; const index = queue.findIndex(item => item.fingerprint === JSON.stringify(after)); const source = index < 0 ? null : queue.splice(index, 1)[0];
      origins.set(id, queue);
      const listeners = await session(`listeners:${id}`) || [];
      for (const listener of listeners) {
        if (JSON.stringify(before[listener.key]) === JSON.stringify(after[listener.key])) continue;
        const ok = await dispatch(listener, { type: 'value', id: listener.id, key: listener.key, oldValue: before[listener.key], newValue: after[listener.key], remote: !source || source.documentId !== listener.documentId || source.token !== listener.token });
        if (!ok) mutate(async () => { const current = await session(`listeners:${id}`) || []; await chrome.storage.session.set({ [`listeners:${id}`]: current.filter(item => !(item.id === listener.id && item.documentId === listener.documentId)) }); }).catch(console.warn);
      }
    }
  }
  async function request(script, message, sender, grant = 'GM_xmlhttpRequest') {
    allowed(script, grant); const input = normalizeRequest(message.request);
    await permitURL(script, input.url, sender.url);
    if (requests.size >= 16 || [...requests.values()].filter(item => item.token === message.token).length >= 8) throw new Error('Too many active network requests.');
    const id = `${message.token}:${message.id}`; const controller = new AbortController();
    const cancelled = aborted.get(id); if (cancelled?.documentId === sender.documentId && cancelled.until > Date.now()) { aborted.delete(id); throw Object.assign(new Error('Network request aborted.'), { kind: 'abort' }); }
    if (requests.has(id)) throw new Error('Duplicate request ID.');
    const item = { token: message.token, scriptId: script.id, tabId: sender.tab.id, documentId: sender.documentId, controller, timedOut: false }; requests.set(id, item);
    const timer = setTimeout(() => { item.timedOut = true; controller.abort(); }, input.timeout);
    try {
      const body = input.data && input.binary ? Uint8Array.from(atob(input.data), c => c.charCodeAt(0)) : input.data;
      const response = await fetch(input.url, { method: input.method, headers: input.headers, body: ['GET', 'HEAD'].includes(input.method) ? undefined : body, signal: controller.signal, credentials: input.anonymous ? 'omit' : 'include', redirect: 'error' });
      const reader = response.body?.getReader(); const chunks = []; let size = 0;
      if (reader) while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 4194304) { item.tooLarge = true; controller.abort(); throw new Error('Response exceeds 4 MB.'); } chunks.push(part.value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const binary = ['blob', 'arraybuffer'].includes(input.responseType); const responseText = binary ? '' : new TextDecoder().decode(bytes);
      return { readyState: 4, status: response.status, statusText: response.statusText, finalUrl: response.url, responseHeaders: [...response.headers].map(([key, value]) => `${key}: ${value}`).join('\r\n'), responseText, response: input.responseType === 'json' ? parseJSONResponse(responseText) : binary ? base64(bytes) : responseText, binary, contentType: response.headers.get('content-type') || 'application/octet-stream', loaded: size };
    } catch (error) {
      throw Object.assign(new Error(item.tooLarge ? error.message : item.timedOut ? 'Network request timed out.' : controller.signal.aborted ? 'Network request aborted.' : error.message), { kind: item.tooLarge ? 'error' : item.timedOut ? 'timeout' : controller.signal.aborted ? 'abort' : 'error' });
    } finally { clearTimeout(timer); requests.delete(id); }
  }
  async function clipboard(text) {
    await nativePermission('clipboardWrite');
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL('offscreen.html')] });
    if (!contexts.length) {
      offscreenCreating ||= chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['CLIPBOARD'], justification: 'Write text requested by an explicitly granted userscript.' }).finally(() => offscreenCreating = null);
      await offscreenCreating;
    }
    const result = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_CLIPBOARD', text });
    if (!result?.ok) throw new Error(result?.error || 'Clipboard write failed.');
  }
  function installListeners() {
    if (!notificationListeners && chrome.notifications) { notificationListeners = true;
    chrome.notifications.onClicked.addListener(async id => { const record = await session(`notification:${id}`); if (record) await dispatch(record, { type: 'notification', id: record.callbackId, event: 'click' }); });
    chrome.notifications.onClosed.addListener(id => notificationDone(id).catch(console.warn));
    }
    if (!downloadListeners && chrome.downloads) { downloadListeners = true;
    chrome.downloads.onChanged.addListener(async delta => {
      if (!delta.state || !['complete', 'interrupted'].includes(delta.state.current)) return;
      const record = await session(`download:${delta.id}`); if (!record) return;
      await chrome.storage.session.remove(`download:${delta.id}`); await dispatch(record, { type: 'download', id: record.callbackId, event: delta.state.current === 'complete' ? 'load' : 'error', error: delta.error?.current || '' });
    });
    }
  }
  installListeners(); chrome.permissions.onAdded.addListener(installListeners);
  async function notificationDone(id) { const record = await session(`notification:${id}`); if (record) { await chrome.storage.session.remove(`notification:${id}`); await dispatch(record, { type: 'notification', id: record.callbackId, event: 'done' }); } }
  async function receive(script, message, sender) {
    switch (message.op) {
      case 'XHR': return request(script, message, sender);
      case 'XHR_ABORT': { allowed(script, 'GM_xmlhttpRequest'); const id = `${message.token}:${message.id}`, item = requests.get(id); if (item?.documentId === sender.documentId) item.controller.abort(); else { for (const [key, value] of aborted) if (value.until < Date.now()) aborted.delete(key); if (aborted.size < 100) aborted.set(id, { documentId: sender.documentId, until: Date.now() + 5000 }); } return; }
      case 'LISTENER_ADD': {
        allowed(script, 'GM_addValueChangeListener'); return mutate(async () => {
          const listeners = await session(`listeners:${script.id}`) || []; if (listeners.length >= 100) throw new Error('At most 100 value listeners per script.');
          listeners.push({ ...targetOf(script, message, sender), id: String(message.id).slice(0, 100), key: String(message.key).slice(0, 1000) });
          await chrome.storage.session.set({ [`listeners:${script.id}`]: listeners });
        });
      }
      case 'LISTENER_REMOVE': allowed(script, 'GM_removeValueChangeListener'); return mutate(async () => { const listeners = await session(`listeners:${script.id}`) || []; await chrome.storage.session.set({ [`listeners:${script.id}`]: listeners.filter(item => !(item.documentId === sender.documentId && item.id === message.id)) }); });
      case 'CLIPBOARD': allowed(script, 'GM_setClipboard'); if (typeof message.text !== 'string' || message.text.length > 1000000) throw new Error('Clipboard text is limited to 1 MB.'); return clipboard(message.text);
      case 'NOTIFY': {
        allowed(script, 'GM_notification'); await nativePermission('notifications'); installListeners();
        const id = `autotap-${crypto.randomUUID()}`;
        await chrome.storage.session.set({ [`notification:${id}`]: { ...targetOf(script, message, sender), callbackId: message.id } });
        try { await chrome.notifications.create(id, { type: 'basic', iconUrl: 'assets/icon-128.png', title: String(message.title || script.name).slice(0, 150), message: String(message.text || '').slice(0, 2000) }); } catch (error) { await chrome.storage.session.remove(`notification:${id}`); throw error; }
        if (message.timeout) setTimeout(() => chrome.notifications.clear(id).then(() => notificationDone(id)).catch(() => {}), Math.min(25000, Math.max(1000, message.timeout)));
        return { id };
      }
      case 'NOTIFY_REMOVE': {
        allowed(script, 'GM_notification'); const record = await session(`notification:${message.id}`); if (record?.token !== message.token) throw new Error('Notification is not owned by this script.'); await chrome.notifications.clear(message.id); await notificationDone(message.id); return;
      }
      case 'DOWNLOAD': {
        allowed(script, 'GM_download'); await nativePermission('downloads'); installListeners(); let url = String(message.url);
        const cancelled = aborted.get(`${message.token}:${message.id}`); if (cancelled?.documentId === sender.documentId && cancelled.until > Date.now()) throw Object.assign(new Error('Download aborted.'), { kind: 'abort' });
        if (url.startsWith('data:')) { if (!/^data:[^,\r\n]{0,2000},/.test(url) || url.length > 2800000) throw new Error('Use a data URL under 2 MB.'); }
        else { const result = await request(script, { ...message, request: { url, headers: message.headers, anonymous: message.anonymous, responseType: 'arraybuffer' } }, sender, 'GM_download'); if (result.status < 200 || result.status >= 300) throw new Error(`Download returned HTTP ${result.status}.`); url = `data:${result.contentType};base64,${result.response}`; }
        const id = await chrome.downloads.download({ url, filename: safeFilename(message.name), saveAs: !!message.saveAs, conflictAction: 'uniquify' });
        const record = { ...targetOf(script, message, sender), callbackId: message.id }; await chrome.storage.session.set({ [`download:${id}`]: record });
        const current = (await chrome.downloads.search({ id }))[0];
        if (current && ['complete', 'interrupted'].includes(current.state)) { await chrome.storage.session.remove(`download:${id}`); dispatch(record, { type: 'download', id: message.id, event: current.state === 'complete' ? 'load' : 'error', error: current.error || '' }).catch(console.warn); }
        return { id };
      }
      case 'DOWNLOAD_ABORT': { allowed(script, 'GM_download'); if (message.requestId) { const id = `${message.token}:${message.requestId}`, item = requests.get(id); if (item?.documentId === sender.documentId) item.controller.abort(); else if (aborted.size < 100) aborted.set(id, { documentId: sender.documentId, until: Date.now() + 5000 }); } if (message.id === undefined) return; const record = await session(`download:${message.id}`); if (!record) return; if (record.token !== message.token) throw new Error('Download is not owned by this script.'); await chrome.downloads.cancel(message.id); return; }
      default: throw new Error('Unsupported GM operation.');
    }
  }
  async function cleanup({ tabId, scriptId } = {}) {
    const applies = item => (tabId === undefined || item.tabId === tabId) && (scriptId === undefined || item.scriptId === scriptId);
    for (const request of requests.values()) if (applies(request)) request.controller.abort();
    const all = await chrome.storage.session.get(null), changes = {}, remove = [];
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith('listeners:')) changes[key] = value.filter(item => !applies(item));
      else if ((key.startsWith('notification:') || key.startsWith('download:')) && applies(value)) { remove.push(key); if (key.startsWith('notification:') && chrome.notifications) await chrome.notifications.clear(key.slice(13)).catch(() => {}); }
    }
    if (Object.keys(changes).length) await chrome.storage.session.set(changes); if (remove.length) await chrome.storage.session.remove(remove);
  }
  return { receive, changed, writeValues, dispatch, cleanup };
}
