export const $ = (query, scope = document) => scope.querySelector(query);
export const $$ = (query, scope = document) => [...scope.querySelectorAll(query)];
export const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const shapes = {
  github: '<path d="M9 19c-4.5 1.4-4.5-2.5-6.3-3M15 22v-3.9c0-1.1-.4-1.8-.9-2.3 3-.3 6.2-1.5 6.2-6.9 0-1.5-.5-2.7-1.4-3.6.2-.4.6-1.8-.1-3.6 0 0-1.1-.4-3.7 1.4a12.7 12.7 0 0 0-6.7 0C5.8 1.3 4.7 1.7 4.7 1.7 4 3.5 4.4 4.9 4.6 5.3A5.2 5.2 0 0 0 3.2 9c0 5.4 3.2 6.6 6.2 6.9-.5.5-.9 1.4-.9 2.5V22"/>',
  record: '<circle cx="12" cy="12" r="7" fill="currentColor"/>',
  play: '<path d="m8 4 12 8-12 8z"/>', stop: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  plus: '<path d="M12 4v16M4 12h16"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  code: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/>',
  macro: '<path d="M8 4H4v16h16v-4M8 12h8M12 8v8M16 4h4v4"/>',
  book: '<path d="M12 5C9 2 4 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1zm0 0v15"/>',
  copy: '<path d="M8 8h13v13H8zM16 4H3v12"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6"/>', download: '<path d="M12 3v13m-5-5 5 5 5-5M3 16v5h18v-5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', external: '<path d="M14 3h7v7m0-7L11 13M10 4H3v17h17v-7"/>',
  check: '<path d="m4 12 5 5L20 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  click: '<path d="m7 3 2 17 4-5 6-1zM3 7 1 6M7 1V0m5 5 2-2"/>',
  input: '<path d="M3 5h18v14H3zM8 9v6m-2-6h4m-4 6h4m3-4h5m-5 3h4"/>',
  scroll: '<path d="M12 2v20m-4-16 4-4 4 4M8 18l4 4 4-4M4 10H2v4h2m16-4h2v4h-2"/>',
  pause: '<path d="M8 4v16m8-16v16"/>', up: '<path d="m5 14 7-7 7 7"/>', down: '<path d="m5 10 7 7 7-7"/>',
  save: '<path d="M3 3h15l3 3v15H3zM7 3v6h10V3M7 21v-8h10v8"/>', settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--paper)"/><circle cx="16" cy="12" r="2" fill="var(--paper)"/><circle cx="8" cy="18" r="2" fill="var(--paper)"/>'
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.macro}</svg>`;
export async function rpc(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...extra });
  if (!response?.ok) throw new Error(response?.error || 'Could not connect to AutoTap. Reload the extension.');
  return response.data;
}
export function toast(message, error = false) {
  let node = $('#toast'); if (!node) { node = document.createElement('div'); node.id = 'toast'; node.setAttribute('role', 'status'); document.body.append(node); }
  node.textContent = message; node.className = `toast visible${error ? ' error' : ''}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('visible'), error ? 9000 : 4000);
}
export function download(name, source, type = 'application/json') { const url = URL.createObjectURL(new Blob([source], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function installIcons() { $$('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon)); }
export const friendlySite = value => { try { return new URL(value).hostname; } catch { return 'Any website'; } };

let activeConfirmation = false;
export async function confirmDialog({ title = 'Continue?', message, confirmLabel = 'Continue', danger = false }) {
  if (activeConfirmation) return false;
  activeConfirmation = true;
  const opener = document.activeElement, dialog = document.createElement('dialog');
  dialog.className = 'paper confirm-dialog'; dialog.setAttribute('aria-labelledby', 'confirm-title'); dialog.setAttribute('aria-describedby', 'confirm-message');
  dialog.innerHTML = `<form method="dialog"><div class="confirm-body"><span class="confirm-symbol ${danger ? 'danger' : ''}">${icon(danger ? 'trash' : 'book')}</span><h2 class="hand" id="confirm-title"></h2><p id="confirm-message"></p></div><div class="confirm-actions"><button class="btn quiet" value="cancel" autofocus>Cancel</button><button class="btn ${danger ? 'red' : 'green'}" value="confirm"></button></div></form>`;
  $('#confirm-title', dialog).textContent = title; $('#confirm-message', dialog).textContent = message;
  $('[value="confirm"]', dialog).textContent = confirmLabel;
  document.body.append(dialog);
  return new Promise(resolve => {
    let done = false;
    const finish = result => { if (done) return; done = true; if (dialog.open) dialog.close(); dialog.remove(); activeConfirmation = false; if (opener?.isConnected) opener.focus({ preventScroll: true }); resolve(result); };
    dialog.addEventListener('close', () => finish(dialog.returnValue === 'confirm'));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) finish(false); });
    dialog.showModal();
  });
}
