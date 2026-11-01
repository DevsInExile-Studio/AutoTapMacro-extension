import { PLAY_STORE, blankMacro, blankScript, sanitizeMacro, sanitizeScript, sitePattern, originOf, permissionPattern, matchesUrl, parseUserScript, exportUserScript, scriptPermissions, scriptMatches, candidatePatterns } from './core.js';
import { $, $$, icon, rpc, toast, escapeHtml as esc, download, installIcons, friendlySite, confirmDialog } from './ui.js';
import { connectExtras, enhanceEditor, renderExtraView } from './workspace-extras.js';

let data = { macros: [], scripts: [] }, view = 'macros', selected = null, draft = null, dirty = false, tabs = [], targetId = Number(new URLSearchParams(location.search).get('tab')) || null;
let scriptAvailable = false, activeSession = { mode: 'idle' };
let sortMode = 'favorites', favoritesOnly = false, viewGeneration = 0;
const collection = () => data[view] || [];
const displayType = type => ({ click: 'Click', pointer: 'Pointer path', input: 'Type text', select: 'Choose option', scroll: 'Scroll', wheel: 'Mouse wheel', key: 'Press key', wait: 'Wait', waitFor: 'Wait for element', assertText: 'Check text', hover: 'Hover', checked: 'Set checked' }[type]);
const stepIcon = type => ({ click: 'click', pointer: 'click', input: 'input', select: 'input', scroll: 'scroll', wheel: 'scroll', key: 'input', wait: 'clock', waitFor: 'clock', assertText: 'check', hover: 'click', checked: 'check' }[type]);
const confirmDiscard = async () => !dirty || await confirmDialog({ title: 'Unsaved changes', message: 'Leave this item without saving your changes?', confirmLabel: 'Discard changes' });
function markDirty() { dirty = true; const status = $('#save-status'); if (status) status.textContent = 'Unsaved changes'; }
function setClean() { dirty = false; const status = $('#save-status'); if (status) status.textContent = 'All changes saved'; }
async function load() { data = await rpc('GET_LIBRARY'); $('#macro-count').textContent = data.macros.length; $('#script-count').textContent = data.scripts.length; }
async function refreshTabs() {
  const all = await chrome.tabs.query({ currentWindow: true });
  tabs = all.filter(tab => originOf(tab.url));
  if (targetId && !tabs.some(tab => tab.id === targetId)) { try { const tab = await chrome.tabs.get(targetId); if (originOf(tab.url)) tabs.unshift(tab); else targetId = null; } catch { targetId = null; } }
  if (!targetId && tabs.length) targetId = (tabs.find(tab => tab.active) || tabs[0]).id;
}
function targetBar() {
  return `<div class="target-bar">${icon('external')}<span>Connected tab</span><select id="target-tab" aria-label="Target browser tab"><option value="">Choose a website…</option>${tabs.map(t => `<option value="${t.id}" ${t.id === targetId ? 'selected' : ''}>${esc(t.title || t.url)}</option>`).join('')}</select><button class="link-button" id="refresh-tabs">Refresh</button></div>${!targetId ? '<p class="notice" style="margin-bottom:18px">Open a website and use the AutoTap icon → <b>Open workshop</b> to connect that tab.</p>' : ''}`;
}
function renderList() {
  const query = $('#search').value.toLowerCase();
  const filtered = collection().filter(item => `${item.name} ${item.site || ''} ${(item.tags || []).join(' ')} ${item.description || ''}`.toLowerCase().includes(query) && (!favoritesOnly || item.favorite));
  filtered.sort((a, b) => sortMode === 'name' ? a.name.localeCompare(b.name) : sortMode === 'recent' ? (b.updatedAt || 0) - (a.updatedAt || 0) : Number(!!b.favorite) - Number(!!a.favorite));
  $('#item-list').innerHTML = filtered.length ? filtered.map(item => `<button class="item${item.id === selected ? ' selected' : ''}" data-id="${esc(item.id)}" role="listitem"><span class="item-symbol">${icon(view === 'scripts' ? 'code' : 'macro')}</span><span class="grow"><span class="item-name">${esc(item.name)}</span><span class="item-meta">${view === 'macros' ? `${item.steps.length} actions · ${esc(friendlySite(item.site))}` : `${item.enabled ? 'Auto-run on' : 'Manual run'} · ${candidatePatterns(item).length} rules`}</span></span>${item.enabled ? '<span class="item-dot"></span>' : ''}</button>`).join('') : `<div class="shelf-empty">${query ? 'No matches on this shelf.' : view === 'macros' ? 'A fresh page.<br>Your first macro goes here.' : 'A little code can go a long way.'}</div>`;
  $$('.item').forEach(button => button.addEventListener('click', async () => { if (!await confirmDiscard()) return; selected = button.dataset.id; draft = structuredClone(collection().find(item => item.id === selected)); dirty = false; renderList(); renderEditor(); }));
  $$('.item').forEach(button => { const item = collection().find(i => i.id === button.dataset.id); if (item?.favorite) $('.item-name', button).textContent = `★ ${item.name}`; });
}
function renderEmpty() {
  const scripts = view === 'scripts';
  $('#editor').innerHTML = `<div class="empty" style="min-height:550px"><div class="eyebrow">${scripts ? 'A BLANK PAGE, ENDLESS POSSIBILITIES' : 'SMALL TASKS. A LITTLE LESS OFTEN.'}</div><div class="empty-illustration"><div class="sheet"></div><div class="seal">${icon(scripts ? 'code' : 'play')}</div></div><h2 class="hand">${scripts ? 'Your ideas, in JavaScript.' : 'Give repetition a rest.'}</h2><p>${scripts ? 'Tweak a page. Automate a little routine. Write your own JavaScript and decide where it runs.' : 'Record a routine once, then let AutoTap handle the clicks, typing and scrolling for you.'}</p><div class="new-banner"><button id="empty-create" class="btn green">${icon('plus')}${scripts ? 'Create a script' : 'Create your first macro'}</button>${!scripts ? `<button id="empty-record" class="btn">${icon('record')}Record a website</button>` : ''}</div><span class="muted" style="font-size:12px">Your collection stays in this browser. No account needed.</span></div>`;
  $('#empty-create').onclick = () => createItem().catch(showError);
  if ($('#empty-record')) $('#empty-record').onclick = () => record().catch(showError);
}
const field = (label, prop, value, min, max) => `<label class="field">${label}<input type="number" data-macro="${prop}" value="${value}" min="${min}" max="${max}" step="1" required></label>`;
function stepRow(step, index) {
  const valueInfo = step.type === 'pointer' ? `${step.events.length} pointer events · ${(Array.isArray(step.events.at(-1)) ? step.events.at(-1)[4] : step.events.at(-1)?.t) || 0} ms` : ['input', 'select'].includes(step.type) ? `“${step.value.slice(0, 55)}”` : step.type === 'scroll' ? `x ${step.x}, y ${step.y}` : step.type === 'wheel' ? `Δx ${step.deltaX || 0}, Δy ${step.deltaY || 0}` : step.type === 'key' ? step.key : step.selector || 'A moment to breathe';
  return `<details class="step" data-index="${index}"><summary><span class="step-index">${String(index + 1).padStart(2, '0')}</span><span class="step-symbol">${icon(stepIcon(step.type))}</span><span class="step-info"><span class="step-title">${step.type === 'click' ? (['Click', 'Middle click', 'Right click', 'Mouse Back', 'Mouse Forward'][step.button || 0]) : displayType(step.type)}${step.label ? ` · ${esc(step.label.slice(0, 45))}` : ''}</span><span class="step-subtitle">${esc(valueInfo)}</span></span><span class="step-time">${step.delay} ms</span>${icon('down', 'step-chevron')}</summary><div class="step-fields">${!['wait', 'pointer'].includes(step.type) ? `<label class="field wide">CSS selector${step.type === 'scroll' ? ' (empty = page)' : ''}<input data-step="selector" value="${esc(step.selector || '')}" placeholder="#element-id"></label>` : ''}${['input', 'select'].includes(step.type) ? `<label class="field wide">${step.type === 'select' ? 'Option value' : 'Text value'}<input data-step="value" value="${esc(step.value)}"></label>` : ''}${step.type === 'key' ? `<label class="field">Key<input data-step="key" value="${esc(step.key)}"></label>` : ''}${step.type === 'scroll' ? `<label class="field">Horizontal position<input data-step="x" type="number" min="-10000000" value="${step.x}"></label><label class="field">Vertical position<input data-step="y" type="number" min="0" value="${step.y}"></label>` : ''}<label class="field">${step.type === 'wait' ? 'Wait duration' : 'Delay before action'} (ms)<input data-step="delay" type="number" min="0" max="3600000" value="${step.delay}"></label><div class="step-tools"><button class="btn small icon-only" data-step-action="up" aria-label="Move action ${index + 1} up" ${!index ? 'disabled' : ''}>${icon('up')}</button><button class="btn small icon-only" data-step-action="down" aria-label="Move action ${index + 1} down" ${index === draft.steps.length - 1 ? 'disabled' : ''}>${icon('down')}</button><button class="btn small icon-only" data-step-action="copy" aria-label="Duplicate action ${index + 1}">${icon('copy')}</button><button class="btn small icon-only danger" data-step-action="delete" aria-label="Delete action ${index + 1}">${icon('trash')}</button></div></div></details>`;
}
function renderMacro() {
  $('#editor').innerHTML = `<header class="editor-top"><div class="row"><div class="grow"><div class="eyebrow">MACRO NOTES / ${String(data.macros.findIndex(m => m.id === selected) + 1).padStart(2, '0')}</div><input class="name-field" id="item-name" aria-label="Macro name" maxlength="100" value="${esc(draft.name)}"><div class="editor-meta">${icon('macro')}<span>${draft.steps.length} actions</span><span>·</span><span>${esc(friendlySite(draft.site))}</span><span class="pill green">Browser macro</span></div></div><div class="row editor-toolbar"><button id="play-macro" class="btn green" ${!draft.steps.length ? 'disabled' : ''}>${icon('play')}Play macro</button><button id="more-copy" class="btn icon-only" title="Duplicate macro" aria-label="Duplicate macro">${icon('copy')}</button></div></div></header><div class="editor-body">${targetBar()}<div id="session-area"></div><div class="eyebrow">PLAY IT YOUR WAY</div><div class="settings-grid">${field('Cycles', 'cycles', draft.cycles, 1, 9999)}<label class="field">Playback speed<select data-macro="speed">${[...new Set([.25, .5, 1, 1.5, 2, 3, 4, Number(draft.speed) || 1])].sort((a, b) => a - b).map(v => `<option value="${v}" ${Number(draft.speed) === v ? 'selected' : ''}>${v}×${v === 1 ? ' · Original' : ''}</option>`).join('')}</select></label>${field('Start delay · ms', 'startDelay', draft.startDelay, 0, 3600000)}${field('Between cycles · ms', 'cycleDelay', draft.cycleDelay, 0, 3600000)}</div><div class="section-label actions-heading"><h3 class="hand">The action sequence</h3><span class="eyebrow">CLICK A STEP TO EDIT</span></div><div class="action-list">${draft.steps.length ? draft.steps.map(stepRow).join('') : '<div class="step-empty">No actions on this page yet.<br>Record a website or build a sequence with the buttons below.</div>'}</div><div class="add-actions">${['click', 'input', 'select', 'scroll', 'wheel', 'key', 'wait'].map(type => `<button class="btn quiet small" data-add="${type}">${icon(type === 'wait' ? 'clock' : 'plus')}${displayType(type)}</button>`).join('')}</div></div><footer class="editor-foot"><div class="hint"><span id="save-status" class="${dirty ? 'dirty' : ''}">${dirty ? 'Unsaved changes' : 'All changes saved'}</span><br>Delays scale with playback speed.</div><button id="delete-item" class="btn small quiet danger" title="Delete macro" aria-label="Delete macro">${icon('trash')}</button><button id="record-new" class="btn small">${icon('record')}Record new</button><button id="save-item" class="btn green small">${icon('save')}Save changes</button></footer>`;
  $('[data-macro="speed"]').value = draft.speed;
  $$('[data-macro]').forEach(input => input.addEventListener('input', () => { draft[input.dataset.macro] = Number(input.value); markDirty(); }));
  $$('[data-step]').forEach(input => input.addEventListener('input', () => { const index = Number(input.closest('.step').dataset.index); draft.steps[index][input.dataset.step] = input.type === 'number' ? Number(input.value) : input.value; markDirty(); }));
  $$('[data-step-action]').forEach(button => button.onclick = () => { const i = Number(button.closest('.step').dataset.index), command = button.dataset.stepAction; if (command === 'up' && i) [draft.steps[i - 1], draft.steps[i]] = [draft.steps[i], draft.steps[i - 1]]; if (command === 'down' && i < draft.steps.length - 1) [draft.steps[i], draft.steps[i + 1]] = [draft.steps[i + 1], draft.steps[i]]; if (command === 'copy') draft.steps.splice(i + 1, 0, structuredClone(draft.steps[i])); if (command === 'delete') draft.steps.splice(i, 1); markDirty(); renderEditor(); });
  $$('[data-add]').forEach(button => button.onclick = () => { const type = button.dataset.add; draft.steps.push({ type, delay: type === 'wait' ? 1000 : 250, ...(type !== 'wait' ? { selector: type === 'scroll' ? '' : '#element-id', label: '' } : {}), ...(['input', 'select'].includes(type) ? { value: '' } : {}), ...(type === 'scroll' ? { x: 0, y: 500 } : {}), ...(type === 'wheel' ? { deltaX: 0, deltaY: 300, deltaMode: 0 } : {}), ...(type === 'key' ? { key: 'Enter' } : {}) }); markDirty(); renderEditor(); $$('.step').at(-1).open = true; });
  $('#play-macro').onclick = () => playMacro().catch(showError);
  $('#record-new').onclick = () => record().catch(showError);
  $('#more-copy').onclick = () => duplicate().catch(showError);
  renderSession();
}
function renderScript() {
  $('#editor').innerHTML = `<header class="editor-top"><div class="row"><div class="grow"><div class="eyebrow">A LITTLE JAVASCRIPT GOES A LONG WAY</div><input class="name-field" id="item-name" aria-label="Script name" maxlength="100" value="${esc(draft.name)}"><div class="editor-meta">${icon('code')}<span>Your code, your rules</span><span class="pill green">JavaScript</span></div></div><div class="row editor-toolbar"><button id="run-script" class="btn green">${icon('play')}Run once</button><button id="download-script" class="btn icon-only" title="Export JavaScript" aria-label="Export JavaScript">${icon('download')}</button></div></div></header><div class="editor-body">${targetBar()}${!scriptAvailable ? `<div class="notice script-status"><b>One small setup step.</b> In Chrome extension settings, enable <b>Allow user scripts</b>. Then return here and click Recheck.<div class="row" style="margin-top:8px"><button class="btn small" id="enable-scripts">Open extension settings</button><button class="btn small quiet" id="recheck-scripts">Recheck</button></div></div>` : ''}<div class="code-editor"><div class="code-top"><span>● &nbsp;${esc(draft.name)}.js</span><span>JavaScript · ${draft.world === 'MAIN' ? 'Page context' : 'Isolated context'}</span></div><textarea id="script-code" aria-label="JavaScript code" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off">${esc(draft.code)}</textarea></div><div class="script-options"><label class="field">Run automatically on these sites<textarea id="script-matches" placeholder="https://example.com/*" spellcheck="false">${esc(draft.matches.join('\n'))}</textarea><small>One Chrome match pattern per line. Site access is requested when you enable auto-run.</small></label><div><label class="field">Execution context<select id="script-world"><option value="USER_SCRIPT" ${draft.world === 'USER_SCRIPT' ? 'selected' : ''}>Isolated · recommended</option><option value="MAIN" ${draft.world === 'MAIN' ? 'selected' : ''}>Page · access page JavaScript</option></select></label><label class="field">Run at<select id="script-run-at">${['document_idle', 'document_end', 'document_start'].map(v => `<option value="${v}" ${draft.runAt === v ? 'selected' : ''}>${v.replace('document_', 'Document ')}</option>`).join('')}</select></label></div></div><label class="auto-toggle"><input type="checkbox" id="script-enabled" ${draft.enabled ? 'checked' : ''}>Enable automatic execution <span class="muted" style="font-weight:400">· applies after saving, on the next page load</span></label><div id="script-result" class="script-result" role="status"></div></div><footer class="editor-foot"><div class="hint"><span id="save-status" class="${dirty ? 'dirty' : ''}">${dirty ? 'Unsaved changes' : 'All changes saved'}</span><br>GM APIs · explicit grants</div><button id="delete-item" class="btn small quiet danger" aria-label="Delete script">${icon('trash')}</button><button id="save-item" class="btn green small">${icon('save')}Save script</button></footer>`;
  for (const [id, prop] of [['script-code', 'code'], ['script-world', 'world'], ['script-run-at', 'runAt']]) $(`#${id}`).addEventListener('input', event => { draft[prop] = event.target.value; markDirty(); });
  $('#script-matches').addEventListener('input', event => { draft.matches = event.target.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean); markDirty(); });
  $('#script-enabled').onchange = event => { draft.enabled = event.target.checked; markDirty(); };
  $('#script-code').addEventListener('keydown', event => { if (event.key === 'Tab') { event.preventDefault(); const el = event.target; el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end'); draft.code = el.value; markDirty(); } });
  $('#run-script').onclick = () => runScript().catch(showError);
  $('#download-script').onclick = () => download(`${draft.name.replace(/[^a-z0-9_-]/gi, '-')}.user.js`, exportUserScript(draft), 'text/javascript');
  if ($('#enable-scripts')) $('#enable-scripts').onclick = () => rpc('OPEN_DETAILS').catch(showError);
  if ($('#recheck-scripts')) $('#recheck-scripts').onclick = async () => { try { const result = await rpc('SYNC_SCRIPTS'); scriptAvailable = result.available; renderEditor(); if (!scriptAvailable) toast('Allow user scripts is still off.', true); } catch (error) { showError(error); } };
}
function renderEditor() {
  if (!draft) return renderEmpty();
  view === 'scripts' ? renderScript() : renderMacro();
  $('#item-name').addEventListener('input', event => { draft.name = event.target.value; markDirty(); });
  $('#save-item').onclick = () => save().catch(showError);
  $('#delete-item').onclick = () => remove().catch(showError);
  $('#target-tab').onchange = event => { targetId = Number(event.target.value) || null; pollSession(); };
  $('#refresh-tabs').onclick = async () => { await refreshTabs(); renderEditor(); };
  enhanceEditor();
  if (view === 'macros' && draft.url && !targetId) { const a = document.createElement('button'); a.className = 'btn small'; a.textContent = 'Open original website'; $('.target-bar').append(a); a.onclick = async () => { if (!await chrome.permissions.request({ origins: [sitePattern(draft.url)] })) return toast('Site access was not granted.', true); const tab = await chrome.tabs.create({ url: draft.url }); targetId = tab.id; await refreshTabs(); renderEditor(); }; }
}
async function save() {
  if (view === 'scripts') {
    const script = sanitizeScript(draft);
    if (script.enabled && candidatePatterns(script).length) {
      const granted = await chrome.permissions.request(scriptPermissions(script, '', true));
      if (!granted) throw new Error('Site access was not granted. Turn off auto-run to save this script for manual use.');
    }
    draft = await rpc('SAVE_SCRIPT', { script });
  } else {
    if ($$('input:invalid', $('#editor')).length) throw new Error('Check the number fields before saving.');
    draft = await rpc('SAVE_MACRO', { macro: sanitizeMacro(draft) });
  }
  selected = draft.id; setClean(); await load(); renderList(); renderEditor(); toast('Saved to your collection.');
}
async function createItem() {
  if (!await confirmDiscard()) return;
  if (view === 'scripts') { draft = await rpc('SAVE_SCRIPT', { script: blankScript() }); }
  else { const macro = blankMacro(); const tab = tabs.find(t => t.id === targetId); if (tab) { macro.site = originOf(tab.url); macro.url = tab.url; } draft = await rpc('SAVE_MACRO', { macro }); }
  selected = draft.id; dirty = false; await load(); renderList(); renderEditor(); $('#item-name').focus(); $('#item-name').select();
}
async function duplicate() { const macro = structuredClone(draft); macro.id = crypto.randomUUID(); macro.name += ' · copy'; draft = await rpc('SAVE_MACRO', { macro }); selected = draft.id; dirty = false; await load(); renderList(); renderEditor(); toast('A fresh copy, ready to edit.'); }
async function remove() {
  const id = selected, itemView = view, name = draft.name;
  if (!await confirmDialog({ title: itemView === 'scripts' ? 'Delete script?' : 'Delete macro?', message: `Delete “${name}”? This cannot be undone.`, confirmLabel: 'Delete', danger: true })) return;
  await rpc(itemView === 'scripts' ? 'DELETE_SCRIPT' : 'DELETE_MACRO', { id });
  if (selected === id && view === itemView) { selected = null; draft = null; dirty = false; }
  await load(); renderList(); renderEditor(); toast('Removed from your collection.');
}
async function record() {
  if (!await confirmDiscard()) return;
  if (!targetId) { toast('Open a website, click the AutoTap icon, then choose Record this tab.', true); return; }
  const macro = await rpc('RECORD', { tabId: targetId });
  view = 'macros'; selected = macro.id; draft = macro; dirty = false; await load(); renderList(); renderEditor(); await chrome.tabs.update(targetId, { active: true });
}
async function playMacro() {
  if (!targetId) throw new Error('Connect a website tab first.');
  if (dirty) { if (!await confirmDialog({ title: 'Save before playing?', message: 'Save your changes and play this macro?', confirmLabel: 'Save & play' })) return; await save(); }
  await rpc('PLAY', { tabId: targetId, id: draft.id }); await chrome.tabs.update(targetId, { active: true }); pollSession();
}
async function runScript() {
  const script = sanitizeScript(draft); const tab = tabs.find(t => t.id === targetId);
  if (!tab) throw new Error('Connect a website tab first.');
  if (!await chrome.permissions.request(scriptPermissions(script, tab.url))) throw new Error('Required permissions were not granted.');
  if (candidatePatterns(script).length && !scriptMatches(script, tab.url) && !await confirmDialog({ title: 'Run on this website?', message: 'This tab does not match the script’s automatic rules. Run it here once?', confirmLabel: 'Run once' })) return;
  $('#run-script').disabled = true; $('#script-result').textContent = 'Running on the connected tab…';
  try { const result = await rpc('RUN_SCRIPT', { tabId: targetId, script }); if ($('#script-result')) $('#script-result').textContent = result.message; toast('JavaScript finished.'); }
  catch (error) { if ($('#script-result')) $('#script-result').textContent = error.message; throw error; }
  finally { if ($('#run-script')) $('#run-script').disabled = false; }
}
function renderSession() {
  const area = $('#session-area'); if (!area) return;
  if (activeSession.mode === 'idle') { area.innerHTML = ''; return; }
  area.innerHTML = `<div class="session-banner"><span class="dot"></span><span class="grow">${activeSession.paused ? 'Paused' : activeSession.mode === 'recording' ? 'Recording' : 'Playing'} · ${activeSession.count || 0} actions${activeSession.mode === 'playing' ? ` · Cycle ${activeSession.cycle}/${activeSession.cycles}` : ''}</span><button class="btn small" id="session-pause">${activeSession.paused ? 'Resume' : 'Pause'}</button><button class="btn red small" id="session-stop">${icon('stop')}Stop</button></div>`;
  $('#session-pause').onclick = () => rpc('TOGGLE_PAUSE', { tabId: targetId }).then(pollSession).catch(showError);
  $('#session-stop').onclick = () => rpc('STOP', { tabId: targetId }).then(pollSession).catch(showError);
}
async function pollSession() {
  if (!targetId || document.hidden) return;
  try { const previous = activeSession; activeSession = await rpc('GET_SESSION', { tabId: targetId }); if (JSON.stringify(previous) !== JSON.stringify(activeSession)) { renderSession(); if (previous.mode !== 'idle' && activeSession.mode === 'idle') { await load(); renderList(); if (!dirty && selected) { draft = structuredClone(collection().find(m => m.id === selected)); renderEditor(); } if (activeSession.message) toast(activeSession.message, activeSession.message.startsWith('Playback stopped:')); } } } catch {}
}
async function switchView(next) {
  if (next !== view && !await confirmDiscard()) return;
  const generation = ++viewGeneration;
  view = next; dirty = false; $('#search').value = ''; $$('.tab').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#library-view').hidden = !['macros', 'scripts'].includes(view); $('#guide-view').hidden = view !== 'guide'; $('#extra-view').hidden = !['tools', 'activity'].includes(view);
  if (view === 'tools' || view === 'activity') { selected = null; draft = null; return renderExtraView(view); }
  if (view === 'guide') return;
  $('#list-title').textContent = view === 'scripts' ? 'The script shelf' : 'The macro shelf'; $('#search').placeholder = view === 'scripts' ? 'Find a script…' : 'Find a macro…'; $('#new-item').title = $('#new-item').ariaLabel = view === 'scripts' ? 'Create new script' : 'Create new macro';
  selected = collection()[0]?.id || null; draft = selected ? structuredClone(collection()[0]) : null;
  if (view === 'scripts') scriptAvailable = (await rpc('SCRIPT_STATUS')).available;
  if (generation !== viewGeneration) return;
  renderList(); renderEditor();
}
const showError = error => toast(error.message || String(error), true);
connectExtras({ state: () => ({ draft, view, targetId, tabs }), dirty: markDirty, render: renderEditor, confirmDiscard, openScript: async id => { dirty = false; await load(); await switchView('scripts'); selected = id; draft = structuredClone(data.scripts.find(s => s.id === id)); renderList(); renderEditor(); } });
installIcons(); $('#android-link').href = PLAY_STORE;
$('#list-sort').onchange = event => { sortMode = event.target.value; renderList(); };
$('#favorites-only').onclick = event => { favoritesOnly = !favoritesOnly; event.currentTarget.setAttribute('aria-pressed', String(favoritesOnly)); renderList(); };
window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && draft && ['macros', 'scripts'].includes(view)) { event.preventDefault(); save().catch(showError); } });
$$('.tab').forEach(button => button.onclick = () => switchView(button.dataset.view).catch(showError));
$('#new-item').onclick = () => createItem().catch(showError); $('#search').oninput = renderList;
$('#script-details').onclick = () => rpc('OPEN_DETAILS').catch(showError);
$('#import-button').onclick = () => $('#import-file').click();
$('#import-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  if (!await confirmDiscard()) { event.target.value = ''; return; }
  dirty = false;
  try {
    if (file.size > 16000000) throw new Error('Choose a file smaller than 16 MB.');
    const source = await file.text();
    if (file.name.endsWith('.js')) {
      const script = parseUserScript(source, file.name);
      await rpc('SAVE_SCRIPT', { script }); await load(); await switchView('scripts'); selected = script.id; draft = script; renderList(); renderEditor(); toast('Script imported. Automatic execution is off.');
    } else {
      const result = await rpc('IMPORT', { source }); await load(); renderList(); toast(`Imported ${result.macros} macros and ${result.scripts} scripts. Imported scripts have auto-run off.`);
    }
  } catch (error) { showError(error); } finally { event.target.value = ''; }
};
$('#export-button').onclick = async () => { try { download(`autotap-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await rpc('EXPORT'), null, 2)); toast('Backup downloaded. Macro values, script code and GM storage are included.'); } catch (error) { showError(error); } };
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
let refreshTimer;
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && Object.keys(changes).some(key => ['macros', 'scripts'].includes(key) || /^(macro|script):/.test(key))) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => load().then(renderList).catch(showError), 160); } });
try { await Promise.all([load(), refreshTabs()]); await switchView('macros'); await pollSession(); } catch (error) { showError(error); }
setInterval(pollSession, 1500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshTabs().then(pollSession); } });
