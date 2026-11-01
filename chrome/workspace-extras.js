import { $, $$, icon, rpc, toast, escapeHtml as esc, download } from './ui.js';
import { parseUserScript, blankScript, sanitizeScript } from './core.js';
import { TEMPLATES } from './templates.js';
import { enhanceUniversalEditor, enhancePageTools } from './workspace-universal.js';

let context;
export function connectExtras(api) { context = api; }
const fail = error => toast(error.message || String(error), true);
const lines = value => value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const get = () => context.state();
const dirty = () => context.dirty();

export function enhanceEditor() {
  const { draft, view } = get(); if (!draft) return;
  const favorite = document.createElement('button'); favorite.className = 'btn icon-only'; favorite.id = 'favorite-item'; favorite.ariaLabel = draft.favorite ? 'Remove from favorites' : 'Add to favorites'; favorite.title = favorite.ariaLabel; favorite.textContent = draft.favorite ? '★' : '☆'; favorite.onclick = () => { draft.favorite = !draft.favorite; dirty(); favorite.textContent = draft.favorite ? '★' : '☆'; };
  $('.editor-toolbar').append(favorite);
  const org = document.createElement('div'); org.className = 'organization'; org.innerHTML = `<label>Tags <input id="item-tags" value="${esc((draft.tags || []).join(', '))}" placeholder="work, reading, daily" maxlength="300" aria-label="Item tags"></label>`; $('.editor-top').append(org);
  $('#item-tags').oninput = event => { draft.tags = event.target.value.split(',').map(s => s.trim()).filter(Boolean); dirty(); };
  view === 'scripts' ? enhanceScript(draft) : enhanceMacro(draft);
  enhanceUniversalEditor(context);
}
function enhanceMacro(draft) {
  const advanced = document.createElement('details'); advanced.className = 'advanced-options';
  advanced.innerHTML = `<summary>Reliability &amp; page tools</summary><div class="advanced-grid"><label class="field">Element timeout · ms<input id="macro-timeout" type="number" min="100" max="120000" value="${draft.elementTimeout ?? 8000}"></label><label class="field">Retries after an error<input id="macro-retries" type="number" min="0" max="3" value="${draft.retries || 0}"></label><label class="field">If an action fails<select id="macro-error"><option value="stop">Stop the macro</option><option value="skip">Skip and log the error</option></select></label></div><p class="micro-note">Retries can repeat an action. Use 0 for actions that must happen only once. Element timeouts use real time.</p><div class="row advanced-tools"><button class="btn small" id="pick-new">${icon('click')}Pick an element</button><button class="btn small" id="validate-selectors">${icon('check')}Check selectors</button></div><div id="validation-result" class="micro-note" role="status"></div>`;
  $('.settings-grid').after(advanced);
  $('#macro-error').value = draft.onError || 'stop';
  for (const [id, prop] of [['macro-timeout', 'elementTimeout'], ['macro-retries', 'retries']]) $(`#${id}`).oninput = event => { draft[prop] = Number(event.target.value); dirty(); };
  $('#macro-error').onchange = event => { draft.onError = event.target.value; dirty(); };
  $('#pick-new').onclick = () => pick().then(element => { draft.steps.push({ type: 'click', delay: 250, enabled: true, ...element }); dirty(); context.render(); toast('Element added as a click action.'); }).catch(fail);
  $('#validate-selectors').onclick = async () => { try { if (!get().targetId) throw new Error('Connect a website tab first.'); const result = await rpc('VALIDATE_MACRO', { tabId: get().targetId, macro: draft }); $('#validation-result').textContent = result.results.length ? result.results.map(r => `Action ${r.index + 1}: ${r.message}`).join('\n') : 'All enabled selectors match one non-private element on this page.'; } catch (error) { fail(error); } };
  $$('.step').forEach((node, index) => {
    const step = draft.steps[index], fields = $('.step-fields', node);
    node.classList.toggle('disabled-step', step.enabled === false);
    const enabled = document.createElement('label'); enabled.className = 'inline-option wide'; enabled.innerHTML = `<input type="checkbox" ${step.enabled !== false ? 'checked' : ''}>Enable this action`;
    $('input', enabled).onchange = event => { step.enabled = event.target.checked; node.classList.toggle('disabled-step', !step.enabled); dirty(); }; fields.prepend(enabled);
    if (!['wait', 'pointer'].includes(step.type) && !(step.type === 'scroll' && !step.selector)) {
      const button = document.createElement('button'); button.className = 'btn small quiet selector-pick'; button.textContent = 'Pick on page'; button.onclick = () => pick().then(element => { step.selector = element.selector; step.label = element.label; dirty(); context.render(); }).catch(fail); $('.wide input[data-step="selector"]', fields)?.parentElement.append(button);
    }
    const options = document.createElement('div'); options.className = 'step-extra wide';
    if (step.type === 'pointer') { const description = document.createElement('p'); description.className = 'micro-note'; description.textContent = `${step.events.length} captured pointer events across ${step.targets.length} page elements. Coordinates scale with the browser viewport. Timing is preserved; disable or delete this segment to omit it.`; options.append(description); }
    if (step.type === 'click') {
      options.innerHTML = `<label class="field">Mouse button<select data-mouse-button>${['Left / primary', 'Middle / wheel button', 'Right / secondary', 'Back / button 4', 'Forward / button 5'].map((name, value) => `<option value="${value}">${name}</option>`).join('')}</select></label><label class="field">Click count<input data-click-count type="number" min="1" max="3" value="${step.clickCount || 1}"></label>`;
      $('[data-mouse-button]', options).value = step.button || 0;
      $('[data-mouse-button]', options).onchange = event => { step.button = Number(event.target.value); dirty(); };
      $('[data-click-count]', options).oninput = event => { step.clickCount = Number(event.target.value); dirty(); };
    }
    if (step.type === 'wheel') {
      options.innerHTML = `<label class="field">Horizontal wheel delta<input data-wheel="deltaX" type="number" min="-100000" max="100000" value="${step.deltaX || 0}"></label><label class="field">Vertical wheel delta<input data-wheel="deltaY" type="number" min="-100000" max="100000" value="${step.deltaY || 0}"></label><label class="field">Delta unit<select data-wheel="deltaMode"><option value="0">Pixels</option><option value="1">Lines</option><option value="2">Pages</option></select></label>`;
      $('[data-wheel="deltaMode"]', options).value = step.deltaMode || 0;
      $$('[data-wheel]', options).forEach(input => input.onchange = event => { step[event.target.dataset.wheel] = Number(event.target.value); dirty(); });
      if (Array.isArray(step.scrolls)) {
        const recorded = structuredClone(step.scrolls), label = document.createElement('label'); label.className = 'inline-option';
        label.innerHTML = `<input data-observed-scroll type="checkbox" checked>Restore recorded scroll positions (${recorded.length})`;
        $('input', label).onchange = event => { if (event.target.checked) step.scrolls = structuredClone(recorded); else delete step.scrolls; dirty(); };
        options.append(label);
      }
    }
    if (['click', 'wheel'].includes(step.type)) {
      const modifiers = document.createElement('div'); modifiers.className = 'row'; modifiers.style.flexWrap = 'wrap';
      for (const [key, name] of [['ctrlKey', 'Ctrl'], ['shiftKey', 'Shift'], ['altKey', 'Alt'], ['metaKey', 'Meta']]) {
        const label = document.createElement('label'); label.className = 'inline-option'; label.innerHTML = `<input type="checkbox" ${step[key] ? 'checked' : ''}>${name}`;
        $('input', label).onchange = event => { step[key] = event.target.checked; dirty(); }; modifiers.append(label);
      }
      options.append(modifiers);
    }
    if (step.type === 'checked') options.innerHTML = `<label class="inline-option"><input id="checked-${index}" type="checkbox" ${step.checked !== false ? 'checked' : ''}>Desired state: checked</label>`;
    if (step.type === 'assertText') options.innerHTML = `<label class="field">Expected text<input id="assert-${index}" value="${esc(step.value || '')}" required></label>`;
    if (['waitFor', 'assertText'].includes(step.type)) options.innerHTML += `<label class="field">Timeout · ms<input data-timeout type="number" min="100" max="120000" value="${step.timeout ?? 8000}"></label>`;
    if (step.type === 'waitFor') options.innerHTML += `<label class="field">Wait until<select data-condition><option value="visible">Visible</option><option value="present">Present in DOM</option><option value="hidden">Hidden or removed</option></select></label>`;
    if (options.innerHTML) { fields.insertBefore(options, $('.step-tools', fields)); if ($('input[id^="checked-"]', options)) $('input', options).onchange = event => { step.checked = event.target.checked; dirty(); }; if ($('input[id^="assert-"]', options)) $('input[id^="assert-"]', options).oninput = event => { step.value = event.target.value; dirty(); }; if ($('[data-timeout]', options)) $('[data-timeout]', options).oninput = event => { step.timeout = Number(event.target.value); dirty(); }; if ($('[data-condition]', options)) { $('[data-condition]', options).value = step.condition || 'visible'; $('[data-condition]', options).onchange = event => { step.condition = event.target.value; dirty(); }; } }
  });
  const additions = [['waitFor', 'Wait for element'], ['assertText', 'Check text'], ['hover', 'Hover'], ['checked', 'Set checked']];
  for (const [type, label] of additions) { const button = document.createElement('button'); button.className = 'btn quiet small'; button.dataset.advancedAdd = type; button.innerHTML = `${icon('plus')}${label}`; button.onclick = () => { draft.steps.push({ type, enabled: true, selector: '#element-id', label: '', delay: 250, ...(['waitFor', 'assertText'].includes(type) ? { timeout: 8000 } : {}), ...(type === 'assertText' ? { value: 'Expected text' } : {}), ...(type === 'checked' ? { checked: true } : {}) }); dirty(); context.render(); $$('.step').at(-1).open = true; }; $('.add-actions').append(button); }
}
async function pick() { if (!get().targetId) throw new Error('Connect a website tab first.'); toast('Choose an element on the connected website. Escape cancels.'); return rpc('PICK_ELEMENT', { tabId: get().targetId }); }
function enhanceScript(draft) {
  const metadata = document.createElement('details'); metadata.className = 'advanced-options script-metadata';
  metadata.innerHTML = `<summary>Userscript permissions &amp; metadata <span class="pill">${(draft.grants || []).length} GM grants</span></summary><div class="script-meta-grid"><label class="field">GM grants<textarea id="script-grants" placeholder="GM_getValue&#10;GM_setValue&#10;GM_addStyle">${esc((draft.grants || []).join('\n'))}</textarea><small>Use GM_name or GM.name. Only declared supported APIs are exposed. Requires isolated context.</small></label><label class="field">Exclude match patterns<textarea id="script-exclude-matches" placeholder="https://example.com/private/*">${esc((draft.excludeMatches || []).join('\n'))}</textarea><small>Matching pages are excluded from auto-run.</small></label><label class="field">Exclude URL globs<textarea id="script-excludes" placeholder="https://example.com/*preview*">${esc((draft.excludes || []).join('\n'))}</textarea></label><div><label class="field">Version<input id="script-version" maxlength="50" value="${esc(draft.scriptVersion || '1.0')}"></label><label class="field">Namespace<input id="script-namespace" maxlength="200" value="${esc(draft.namespace || '')}" placeholder="your.name"></label></div><label class="field wide">Description<input id="script-description" maxlength="500" value="${esc(draft.description || '')}"></label></div><div class="row advanced-tools"><button class="btn small" id="apply-script-header">Read metadata from code</button><button class="btn small quiet" id="duplicate-script">${icon('copy')}Duplicate script</button></div><p class="micro-note">Supported: GM storage (single &amp; multiple values), styles, elements, info, logs, menu commands and opening tabs. Standard DOM/Web APIs remain available.</p>`;
  $('.script-options').after(metadata);
  for (const [id, prop] of [['script-grants', 'grants'], ['script-exclude-matches', 'excludeMatches'], ['script-excludes', 'excludes']]) $(`#${id}`).oninput = event => { draft[prop] = lines(event.target.value); dirty(); };
  for (const [id, prop] of [['script-version', 'scriptVersion'], ['script-namespace', 'namespace'], ['script-description', 'description']]) $(`#${id}`).oninput = event => { draft[prop] = event.target.value; dirty(); };
  $('#apply-script-header').onclick = () => { try { const parsed = parseUserScript(draft.code, draft.name); const { id, enabled, favorite, tags } = draft; Object.assign(draft, parsed, { id, enabled, favorite, tags }); dirty(); context.render(); toast('Metadata applied. Review the permissions, then save.'); } catch (error) { fail(error); } };
  $('#duplicate-script').onclick = async () => { try { const copy = sanitizeScript({ ...draft, id: crypto.randomUUID(), name: `${draft.name} · copy`, enabled: false }); await rpc('SAVE_SCRIPT', { script: copy }); await context.openScript(copy.id); toast('Script duplicated. Automatic execution is off.'); } catch (error) { fail(error); } };
  const storage = document.createElement('details'); storage.className = 'advanced-options'; storage.innerHTML = '<summary>Persistent script values <span class="muted">· JSON · 128 KB per script</span></summary><textarea id="gm-values" class="values-editor" aria-label="Persistent script values" spellcheck="false">{}</textarea><div class="row advanced-tools"><button id="save-gm-values" class="btn small">Save values</button><button id="reload-gm-values" class="btn small quiet">Reload</button></div><p class="micro-note">Each script has its own storage. Legacy GM_getValue reads a snapshot; await GM.getValue for fresh values across tabs. Values are included in JSON backups.</p>';
  $('.auto-toggle').before(storage);
  const read = async () => { $('#gm-values').value = JSON.stringify(await rpc('GET_SCRIPT_VALUES', { id: draft.id }), null, 2); };
  storage.addEventListener('toggle', () => { if (storage.open) read().catch(fail); }, { once: true });
  $('#reload-gm-values').onclick = () => read().catch(fail);
  $('#save-gm-values').onclick = async () => { try { await rpc('SAVE_SCRIPT_VALUES', { id: draft.id, values: JSON.parse($('#gm-values').value) }); toast('Script values saved.'); } catch (error) { fail(error); } };
}

export async function renderExtraView(view) {
  const node = $('#extra-view');
  if (view === 'activity') return renderActivity(node);
  const settings = await rpc('GET_SETTINGS');
  if (get().view !== view) return;
  node.innerHTML = `<div class="eyebrow">MORE TOOLS FOR YOUR WORKSHOP</div><h2 class="hand">A useful little toolbox.</h2><p class="guide-intro">Start from a recipe, keep automatic scripts under control, and inspect your collection.</p><div class="tool-settings"><h3 class="hand">Automatic scripts</h3><label class="inline-option"><input id="pause-scripts" type="checkbox" ${settings.scriptsPaused ? 'checked' : ''}>Pause all automatic scripts</label><label class="field">Never auto-run scripts on these sites<textarea id="blocked-sites" placeholder="https://example.com/*">${esc(settings.blockedSites.join('\n'))}</textarea></label><div class="row"><button id="save-tool-settings" class="btn small green">Save controls</button><span class="micro-note">Applies to future loads. Reload pages to clear existing script effects.</span></div></div><div class="section-label"><h3 class="hand">JavaScript recipes</h3><span class="eyebrow">LOCAL · EDITABLE · OFF BY DEFAULT</span></div><div class="template-grid">${TEMPLATES.map(t => `<article class="template-card"><span class="template-symbol">${icon('code')}</span><h3>${esc(t.name)}</h3><p>${esc(t.description)}</p><button class="btn small" data-template="${t.id}">${icon('plus')}Use this recipe</button></article>`).join('')}</div><div class="notice" style="margin-top:24px"><b>Compatibility.</b> GM_getValue/setValue/deleteValue/listValues and their multiple-value counterparts, GM_addStyle, GM_addElement, GM_info, GM_log, GM_registerMenuCommand/unregisterMenuCommand and GM_openInTab are supported with modern GM.* aliases. GM network requests, value-change listeners, resource helpers, notifications, downloads and plain-text clipboard writes are available with declared grants. Fetch declared dependencies for review or attach local files. Cookie APIs, unsafeWindow and regex URL rules remain unsupported. Embedded frames are opt-in and checked against site rules.</div>`;
  $('#save-tool-settings').onclick = async () => { try { await rpc('SAVE_SETTINGS', { settings: { scriptsPaused: $('#pause-scripts').checked, blockedSites: lines($('#blocked-sites').value) } }); toast('Automatic script controls saved.'); } catch (error) { fail(error); } };
  $$('[data-template]').forEach(button => button.onclick = async () => { try { if (!await context.confirmDiscard()) return; const template = TEMPLATES.find(t => t.id === button.dataset.template); const script = sanitizeScript({ ...blankScript(), name: template.name, description: template.description, grants: template.grants, connect: template.connect || [], code: template.code }); await rpc('SAVE_SCRIPT', { script }); await context.openScript(script.id); toast('Recipe copied into your collection. Choose sites before enabling auto-run.'); } catch (error) { fail(error); } });
  enhancePageTools(context);
}
async function renderActivity(node) {
  const activity = await rpc('GET_ACTIVITY');
  if (get().view !== 'activity') return;
  node.innerHTML = `<div class="row"><div class="grow"><div class="eyebrow">THE LAST 100 ENTRIES · STORED LOCALLY</div><h2 class="hand">Workshop activity</h2></div><button id="activity-refresh" class="btn small">Refresh</button><button id="activity-export" class="btn small quiet">Export log</button><button id="activity-clear" class="btn small quiet danger">Clear</button></div><div class="activity-controls"><label class="inline-option"><input id="activity-errors" type="checkbox">Errors and warnings only</label></div><div id="activity-list"></div>`;
  const render = () => { const items = $('#activity-errors').checked ? activity.filter(e => ['error', 'warning'].includes(e.status)) : activity; $('#activity-list').innerHTML = items.length ? items.map(e => `<article class="activity-entry ${esc(e.status)}"><div class="row"><span class="pill">${esc(e.status)}</span><strong class="grow">${esc(e.name || 'AutoTap')}</strong><time>${esc(new Date(e.time).toLocaleString('en-GB'))}</time></div><p>${esc(e.message)}</p><small>${esc(e.kind)}${e.site ? ` · ${esc(e.site)}` : ''}</small></article>`).join('') : '<div class="shelf-empty">No entries here yet.</div>'; };
  $('#activity-errors').onchange = render; render();
  $('#activity-refresh').onclick = () => renderActivity(node).catch(fail);
  $('#activity-export').onclick = () => download('autotap-activity.json', JSON.stringify(activity, null, 2));
  $('#activity-clear').onclick = async () => { await rpc('CLEAR_ACTIVITY'); await renderActivity(node); };
}
