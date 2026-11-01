import { PLAY_STORE, originOf, scriptMatches, scriptPermissions } from './core.js';
import { $, $$, icon, installIcons, rpc, toast, escapeHtml as esc } from './ui.js';
import { pageAvailability } from './page-target.js';
let tab, state = { mode: 'idle' }, libraryCache, toolsCache, refreshing = false, refreshQueued = false, recordStarting = false, section = 'macros';
installIcons(); $('#android-link').href = PLAY_STORE;
const sectionTabs = $$('[data-section]');
function selectSection(button) {
  section = button.dataset.section;
  sectionTabs.forEach(item => { const active = item === button; item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; });
  $('#recent-macros').setAttribute('aria-labelledby', button.id);
  refresh().catch(showError);
}
sectionTabs.forEach((button, index) => {
  button.onclick = () => selectSection(button);
  button.onkeydown = event => {
    const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1;
    if (next < 0) return;
    event.preventDefault(); sectionTabs[next].focus(); selectSection(sectionTabs[next]);
  };
});
async function refresh() {
  if (refreshing) { refreshQueued = true; return; } refreshing = true;
  const activeSection = section;
  try {
  const [library, next] = await Promise.all([libraryCache ? Promise.resolve(libraryCache) : rpc('GET_LIBRARY').then(value => libraryCache = value), tab ? rpc('GET_SESSION', { tabId: tab.id }) : Promise.resolve({ mode: 'idle' })]);
  if (activeSection !== section) return;
  state = next;
  const availability = pageAvailability(tab), { supported } = availability;
  $('#page-site').textContent = availability.label; $('#page-site').title = tab?.url || availability.label;
  $('#ready').innerHTML = `<span class="dot"></span>${state.mode !== 'idle' ? state.paused ? 'Paused' : state.mode === 'recording' ? 'Recording' : 'Playing' : availability.status}`;
  $('#ready').classList.toggle('unavailable', !supported);
  $('#ready').classList.toggle('recording', state.mode === 'recording' && !state.paused);
  $('#record-note').textContent = availability.reason; $('#record-note').classList.toggle('unavailable', !supported);
  $('#record').disabled = !supported || recordStarting; $('#record').hidden = state.mode !== 'idle' || activeSection !== 'macros'; $('#record-note').hidden = state.mode !== 'idle' || (activeSection !== 'macros' && supported);
  $('#session').hidden = state.mode === 'idle' || activeSection !== 'macros';
  if (state.mode !== 'idle') {
    $('#session').innerHTML = `<div class="session-controls"><div class="session-status">${state.mode === 'recording' ? 'Recording your routine' : esc(state.name || 'Playing macro')}<br><span class="muted">${state.count || 0} actions${state.mode === 'playing' ? ` · Cycle ${state.cycle}/${state.cycles}` : ''}</span></div><div class="row"><button id="pause" class="btn small">${icon('pause')}${state.paused ? 'Resume' : 'Pause'}</button><button id="stop" class="btn red small">${icon('stop')}${state.mode === 'recording' ? 'Stop &amp; save' : 'Stop'}</button></div></div>`;
    $('#pause').onclick = () => rpc('TOGGLE_PAUSE', { tabId: tab.id }).then(refresh).catch(showError);
    $('#stop').onclick = () => rpc('STOP', { tabId: tab.id }).then(refresh).catch(showError);
  }
  const macros = library.macros.filter(m => !m.site || m.site === originOf(tab?.url)).slice(0, 2);
  $('#recent-macros').innerHTML = macros.length ? macros.map(m => `<div class="recent-row"><span class="recent-symbol">${icon('macro')}</span><div class="grow"><div class="recent-name">${esc(m.name)}</div><div class="recent-meta">${m.steps.length} actions · ${m.cycles} ${m.cycles === 1 ? 'cycle' : 'cycles'} · ${m.speed}×</div></div><button class="btn small green" data-play="${esc(m.id)}" aria-label="Play ${esc(m.name)}" ${!supported || !m.steps.length || state.mode !== 'idle' ? 'disabled' : ''}>${icon('play')}</button></div>`).join('') : `<div class="recent-empty">${!supported ? 'Browse your macros in the workshop.' : library.macros.length ? 'No macros for this website yet.' : 'Your first routine starts with Record.'}</div>`;
  $$('[data-play]').forEach(button => button.onclick = async () => { try { await rpc('PLAY', { tabId: tab.id, id: button.dataset.play }); window.close(); } catch (error) { showError(error); } });
  if (activeSection !== 'macros') {
    if (!supported) { $('#recent-macros').innerHTML = '<div class="recent-empty">Open a website to see its scripts.</div>'; return; }
    toolsCache ||= await rpc('GET_TAB_TOOLS', { tabId: tab.id });
    if (activeSection !== section) return;
    if (activeSection === 'scripts') {
      const candidates = library.scripts.filter(s => scriptMatches(s, tab.url));
      $('#recent-macros').innerHTML = `<div class="popup-tools-list">${candidates.length ? candidates.map(s => `<div class="recent-row"><div class="grow"><div class="recent-name">${esc(s.name)}</div><div class="recent-meta">${s.enabled ? 'Auto-run on' : 'Manual'} · ${(s.grants || []).length} GM grants</div></div><button class="btn small green" data-script="${esc(s.id)}" aria-label="Run ${esc(s.name)}">${icon('play')}</button></div>`).join('') : '<div class="recent-empty">No matching scripts.<br>Create one in the workshop.</div>'}</div><label class="popup-pause"><input type="checkbox" id="popup-pause-auto" ${toolsCache.settings.scriptsPaused ? 'checked' : ''}>Pause automatic scripts</label>`;
      $$('[data-script]').forEach(button => button.onclick = async () => { try { const script = library.scripts.find(s => s.id === button.dataset.script); if (!await chrome.permissions.request(scriptPermissions(script, tab.url))) throw new Error('Required permissions were not granted.'); button.disabled = true; await rpc('RUN_SAVED_SCRIPT', { tabId: tab.id, id: button.dataset.script }); toast('Script finished.'); toolsCache = null; } catch (error) { showError(error); } finally { button.disabled = false; } });
      $('#popup-pause-auto').onchange = async event => { try { await rpc('SAVE_SETTINGS', { settings: { ...toolsCache.settings, scriptsPaused: event.target.checked } }); toolsCache = null; } catch (error) { showError(error); } };
    } else {
      $('#recent-macros').innerHTML = `<div class="popup-tools-list">${toolsCache.menus.length ? toolsCache.menus.map((m, index) => `<button class="script-command" data-command="${index}"><strong>${esc(m.label)}</strong><small>${esc(m.scriptName)}</small></button>`).join('') : '<div class="recent-empty">No commands on this page.<br>Run a script with a menu first.</div>'}</div>`;
      $$('[data-command]').forEach(button => button.onclick = async () => { try { const command = toolsCache.menus[Number(button.dataset.command)]; button.disabled = true; await rpc('SCRIPT_COMMAND', { tabId: tab.id, scriptId: command.scriptId, id: command.id }); toast('Command finished.'); } catch (error) { showError(error); } finally { button.disabled = false; } });
    }
  }
  } finally { refreshing = false; if (refreshQueued) { refreshQueued = false; queueMicrotask(() => refresh().catch(showError)); } }
}
const showError = error => toast(error.message, true);
$('#record').onclick = async () => { if (recordStarting) return; recordStarting = true; try { $('#record').disabled = true; await rpc('RECORD', { tabId: tab.id }); window.close(); } catch (error) { recordStarting = false; await refresh().catch(() => {}); showError(error); } };
const open = () => rpc('OPEN_WORKSPACE', { tabId: tab?.id }).then(() => window.close()).catch(showError);
$('#open-workspace').onclick = open; $('#open-workspace-small').onclick = open;
try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); await refresh(); } catch (error) { showError(error); }
let refreshTimer;
const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh().catch(() => {}), 60); };
chrome.tabs.onUpdated.addListener((id, change, updated) => { if (id === tab?.id && (change.url || change.status === 'complete')) { tab = updated; toolsCache = null; scheduleRefresh(); } });
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && Object.keys(changes).some(key => ['macros', 'scripts', 'settings'].includes(key) || /^(macro|script):/.test(key))) { libraryCache = null; toolsCache = null; scheduleRefresh(); } if (area === 'session' && (changes[`tab:${tab?.id}`] || changes[`menus:${tab?.id}`])) { toolsCache = null; scheduleRefresh(); } });
setInterval(() => { if (state.mode !== 'idle') refresh().catch(() => {}); }, 1500);
