import { originOf, sitePattern, sanitizeScript } from './core.js';

export function attachmentOrigins(script) {
  return [...new Set([...(script.requires || []), ...(script.resources || [])].filter(item => item.url && !item.url.startsWith('local:')).map(item => {
    const url = new URL(item.url); if (!originOf(url.href) || url.username || url.password) throw new Error('Declared files must use direct HTTP(S) URLs without credentials.'); return sitePattern(url.href);
  }))];
}
async function fetchFile(reference, limit) {
  const url = new URL(reference); const hash = url.hash.slice(1); url.hash = '';
  if (!await chrome.permissions.contains({ origins: [sitePattern(url.href)] })) throw new Error(`Grant access to ${url.origin} to fetch this declared file.`);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url.href, { credentials: 'omit', redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error(`Declared file returned HTTP ${response.status}: ${url.href}`);
    const reader = response.body.getReader(), parts = []; let size = 0;
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > limit) { controller.abort(); throw new Error('Declared file exceeds its size limit.'); } parts.push(next.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    if (!bytes.length) throw new Error('Declared file is empty.');
    if (hash && /^(?:sha\d+|md5)=/i.test(hash)) {
      const [algorithm, expected] = hash.split('='); const bits = algorithm.slice(3);
      if (!['256', '384', '512'].includes(bits)) throw new Error('Integrity hashes support SHA-256, SHA-384 and SHA-512.');
      const digest = new Uint8Array(await crypto.subtle.digest(`SHA-${bits}`, bytes));
      const hex = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join(''); const binary = String.fromCharCode(...digest);
      const wanted = decodeURIComponent(hash.slice(algorithm.length + 1)).replace(/=+$/, '');
      if (wanted.toLowerCase() !== hex && wanted !== btoa(binary).replace(/=+$/, '')) throw new Error('Integrity hash mismatch; the file was not attached.');
    }
    return { bytes, mime: (response.headers.get('content-type') || 'application/octet-stream').split(';')[0] };
  } finally { clearTimeout(timer); }
}
export async function fetchDeclaredAttachments(raw) {
  const script = sanitizeScript(raw); attachmentOrigins(script);
  const tasks = [
    ...script.requires.filter(item => item.url && !item.url.startsWith('local:')).map(item => async () => { const file = await fetchFile(item.url, 200000); item.code = new TextDecoder().decode(file.bytes); }),
    ...script.resources.filter(item => item.url && !item.url.startsWith('local:')).map(item => async () => { const file = await fetchFile(item.url, 524288); let binary = ''; for (let i = 0; i < file.bytes.length; i += 8192) binary += String.fromCharCode(...file.bytes.subarray(i, i + 8192)); item.data = btoa(binary); item.mime = file.mime; })
  ];
  let next = 0, stopped = false;
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => { while (!stopped && next < tasks.length) { try { await tasks[next++](); } catch (error) { stopped = true; throw error; } } }));
  // Return editor data only. Never register, save or execute fetched code here.
  return sanitizeScript(script);
}
