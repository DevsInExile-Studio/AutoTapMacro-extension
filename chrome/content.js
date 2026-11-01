(() => {
  if (globalThis.__autoTapRecorder) return;
  globalThis.__autoTapRecorder = true;
  let mode = 'idle', paused = false, generation = 0, count = 0, lastEvent = 0, scrollTimer, scrollEvent, runId;
  let host, feedback, batchTimer, batch = [], batchRunId, picking = false;
  let serial = 0, sequence = 0, lastRecorded, scrollContext, pointerGesture, scrollPositions = new WeakMap(), caretScrollUntil = new WeakMap(), wheelEvent, wheelTimer, wheelContext, wheelScrolls = new Map();
  const send = async (type, extra = {}) => { const reply = await chrome.runtime.sendMessage({ type, runId, ...extra }); if (!reply?.ok) throw new Error(reply?.error || 'AutoTap connection lost.'); return reply.data; };
  const sensitive = el => !!el?.closest?.('input[type="password"], input[type="file"], input[type="hidden"], [autocomplete^="cc-"], [autocomplete="current-password"], [autocomplete="new-password"], [autocomplete="one-time-code"], [data-autotap-private]');
  const ours = event => event.composedPath().includes(host);
  function selector(el) {
    if (!(el instanceof Element)) return '';
    const unique = value => { try { return document.querySelectorAll(value).length === 1; } catch { return false; } };
    if (el.id && unique(`#${CSS.escape(el.id)}`)) return `#${CSS.escape(el.id)}`;
    for (const attr of ['data-testid', 'data-test', 'name', 'aria-label']) {
      const value = el.getAttribute(attr);
      if (value) { const candidate = `${el.localName}[${attr}="${CSS.escape(value)}"]`; if (unique(candidate)) return candidate; }
    }
    const parts = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); if (unique(parts.join(' > '))) return parts.join(' > '); }
      else {
        const siblings = node.parentElement ? [...node.parentElement.children].filter(s => s.localName === node.localName) : [];
        parts.unshift(`${CSS.escape(node.localName)}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''}`);
        if (unique(parts.join(' > '))) return parts.join(' > ');
      }
    }
    return parts.join(' > ');
  }
  const label = el => (el.getAttribute('aria-label') || el.getAttribute('placeholder') || [...(el.labels || [])].map(node => node.textContent).join(' ') || (el.isContentEditable ? 'Editable text' : el.textContent) || el.getAttribute('name') || el.localName).trim().replace(/\s+/g, ' ').slice(0, 100);
  function paint(message) { feedback?.paint({ message, count, isPaused: paused }); }
  function overlay(name) {
    feedback?.destroy(); motion.reset(); motion.release(); serial = 0; sequence = 0; lastRecorded = null; scrollContext = null; pointerGesture = null;
    scrollPositions = new WeakMap(); caretScrollUntil = new WeakMap(); wheelEvent = null; wheelScrolls.clear(); clearTimeout(wheelTimer); scrollPositions.set(document, { x: scrollX, y: scrollY });
    feedback = globalThis.__autoTapFeedback({ name, mode, onPause: () => togglePause().catch(error => cleanup(error.message)), onStop: () => stop(mode === 'recording' ? 'Recording saved.' : 'Playback stopped.') });
    host = feedback.host; paint();
  }
  let pending = Promise.resolve();
  function flushBatch() {
    clearTimeout(batchTimer); batchTimer = null; if (!batch.length) return pending;
    const steps = batch; const eventRunId = batchRunId; const savedRevision = serial; batch = [];
    pending = pending.then(() => send('APPEND_STEPS', { steps, runId: eventRunId })).then(result => { if (result?.count !== undefined && eventRunId === runId) { count = result.count; feedback?.confirm(savedRevision); paint(); } }).catch(async error => { try { await send('FINISH', { message: `Recording stopped: ${error.message}`, runId: eventRunId }); } catch {} if (eventRunId === runId) cleanup(error.message); });
    return pending;
  }
  function append(step, context = {}) {
    const time = context.startedAt ?? performance.now(); step.delay = Math.min(3600000, Math.max(0, Math.round(time - lastEvent))); lastEvent = context.endedAt ?? time;
    const merge = lastRecorded && ['input', 'scroll'].includes(step.type) && lastRecorded.type === step.type && lastRecorded.selector === step.selector;
    if (!merge) sequence++;
    lastRecorded = { type: step.type, selector: step.selector };
    if (!context.silent) feedback?.note(step, { sequence, revision: ++serial, merge, dx: context.dx, dy: context.dy });
    if (!context.previewed) feedback?.highlight(step, context);
    batchRunId = runId;
    const last = batch.at(-1);
    if (last && ['input', 'scroll'].includes(step.type) && last.type === step.type && last.selector === step.selector) batch[batch.length - 1] = { ...step, delay: last.delay + step.delay };
    else batch.push(step);
    if (batch.length >= 50) flushBatch(); else if (!batchTimer) batchTimer = setTimeout(() => { batchTimer = null; flushBatch(); }, 120);
  }
  const mousePoint = (el, event) => { const r = el.getBoundingClientRect(); return { pointX: r.width ? Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)) : .5, pointY: r.height ? Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)) : .5 }; };
  const modifiers = event => ({ ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey });
  function recordClick(event) {
    if (mode !== 'recording' || paused || !event.isTrusted || ours(event) || event.button !== 0) return;
    const el = event.target.closest('button, a, input, select, textarea, [role="button"], label') || event.target;
    if (el instanceof HTMLLabelElement && el.control) return;
    if (el.matches('input[type="checkbox"], input[type="radio"]')) return;
    if (sensitive(el) || sensitive(event.target) || el.getRootNode() !== document) return;
    flushMovement(); append({ type: 'click', selector: selector(el), label: label(el), button: 0, buttons: event.buttons, pointerRecorded: true, clickCount: Math.min(3, event.detail || 1), ...modifiers(event), ...(event.detail ? mousePoint(el, event) : {}) }, { target: el, point: event.detail ? { x: event.clientX, y: event.clientY } : undefined });
    if (el.closest('a[href]')) flushBatch();
  }
  function recordMouseButton(event) {
    if (mode !== 'recording' || paused || !event.isTrusted || ours(event) || ![1, 2, 3, 4].includes(event.button)) return;
    const el = event.target;
    if (!(el instanceof Element) || sensitive(el) || el.getRootNode() !== document) return;
    flushMovement(); append({ type: 'click', selector: selector(el), label: label(el), button: event.button, buttons: event.buttons, pointerRecorded: true, clickCount: 1, ...modifiers(event), ...mousePoint(el, event) }, { target: el, point: { x: event.clientX, y: event.clientY } });
    // Back/Forward and middle-click links can navigate before an ordinary batch flush.
    flushBatch();
  }
  function recordInput(event) {
    if (mode !== 'recording' || paused || !event.isTrusted || ours(event) || sensitive(event.target)) return;
    const el = event.target; if (el.getRootNode() !== document || el.matches('input[type="checkbox"], input[type="radio"]')) return;
    if (el.localName === 'select' && event.type === 'input') return;
    if (!el.matches('input, textarea, select, [contenteditable="true"]')) return;
    caretScrollUntil.set(el.closest('[contenteditable="true"]') || el, performance.now() + 350);
    flushMovement(); append({ type: el.localName === 'select' ? 'select' : 'input', selector: selector(el), label: label(el), value: el.isContentEditable ? el.textContent : el.value }, { target: el });
  }
  function recordKey(event) {
    if (mode !== 'recording' || paused || !event.isTrusted || ours(event) || sensitive(event.target)) return;
    if (event.target.closest?.('input, textarea, [contenteditable="true"]')) caretScrollUntil.set(event.target.closest('[contenteditable="true"]') || event.target, performance.now() + 350);
    if (!['Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    flushMovement(); append({ type: 'key', selector: selector(event.target), label: label(event.target), key: event.key, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey }, { target: event.target });
  }
  function recordChange(event) {
    if (event.target.localName === 'select') return recordInput(event);
    const el = event.target;
    if (mode === 'recording' && !paused && event.isTrusted && !ours(event) && el.matches?.('input[type="checkbox"], input[type="radio"]') && !sensitive(el)) {
      flushMovement(); append({ type: 'checked', selector: selector(el), label: label(el), checked: el.checked }, { target: el });
    }
  }
  function flushScroll() { if (scrollEvent && mode === 'recording' && !paused) append(scrollEvent, scrollContext || {}); scrollEvent = null; scrollContext = null; clearTimeout(scrollTimer); }
  function flushWheel() {
    clearTimeout(wheelTimer);
    if (wheelEvent && mode === 'recording' && !paused) append({ ...wheelEvent, scrolls: [...wheelScrolls.values()] }, wheelContext || {});
    wheelEvent = null; wheelContext = null; wheelScrolls.clear();
  }
  function flushMovement() { motion.flush(); flushWheel(); flushScroll(); }
  function recordWheel(event) {
    if (mode !== 'recording' || paused || !event.isTrusted || ours(event) || sensitive(event.target)) return;
    const el = event.target;
    if (!(el instanceof Element) || el.getRootNode() !== document) return;
    const css = wheelEvent && wheelContext?.target === el ? wheelEvent.selector : selector(el), changesDirection = wheelEvent && ['deltaX', 'deltaY'].some(key => event[key] && wheelEvent[key] && Math.sign(event[key]) !== Math.sign(wheelEvent[key]));
    if (wheelEvent && (wheelEvent.selector !== css || wheelEvent.deltaMode !== event.deltaMode || changesDirection || ['ctrlKey', 'shiftKey', 'altKey', 'metaKey', 'buttons'].some(key => wheelEvent[key] !== event[key]))) flushWheel();
    if (!wheelEvent) { motion.flush(); flushScroll(); wheelEvent = { type: 'wheel', selector: css, label: label(el), deltaX: 0, deltaY: 0, deltaZ: 0, deltaMode: event.deltaMode, buttons: event.buttons, ...modifiers(event), ...mousePoint(el, event) }; }
    for (const key of ['deltaX', 'deltaY', 'deltaZ']) wheelEvent[key] = Math.max(-100000, Math.min(100000, wheelEvent[key] + event[key]));
    wheelContext = { target: el, dx: event.deltaX, dy: event.deltaY, previewed: true };
    feedback?.highlight(wheelEvent, wheelContext);
    clearTimeout(wheelTimer); wheelTimer = setTimeout(flushWheel, 180);
  }
  function recordScroll(event) {
    if (mode !== 'recording' || paused || ours(event) || sensitive(event.target)) return;
    const editing = event.target.closest?.('input, textarea, [contenteditable="true"]');
    if (editing && !wheelEvent && (caretScrollUntil.get(editing) || 0) > performance.now()) return;
    const root = event.target === document || event.target === document.documentElement || event.target === document.body;
    const source = root ? document : event.target;
    const position = { x: Math.round(root ? scrollX : event.target.scrollLeft), y: Math.round(root ? scrollY : event.target.scrollTop) };
    const before = scrollPositions.get(source) || { x: 0, y: 0 }; scrollPositions.set(source, position);
    const css = root ? '' : selector(event.target);
    if (wheelEvent) {
      if (wheelScrolls.size < 8 || wheelScrolls.has(css)) wheelScrolls.set(css, { selector: css, ...position });
      clearTimeout(wheelTimer); wheelTimer = setTimeout(flushWheel, 180); return;
    }
    if (scrollEvent && scrollEvent.selector !== css) flushScroll();
    scrollEvent = { type: 'scroll', selector: css, ...position };
    scrollContext = { target: root ? undefined : event.target, dx: position.x - before.x, dy: position.y - before.y, previewed: true };
    feedback?.highlight(scrollEvent, scrollContext);
    clearTimeout(scrollTimer); scrollTimer = setTimeout(flushScroll, 180);
  }
  const stopped = () => new Error('Playback stopped.');
  async function wait(ms, token) {
    let remaining = ms;
    while (remaining > 0 || paused) {
      if (generation !== token || mode !== 'playing') throw stopped();
      const start = performance.now(); const wasPaused = paused; await new Promise(resolve => setTimeout(resolve, paused ? 50 : Math.min(50, Math.max(1, remaining))));
      if (!wasPaused && !paused) remaining -= performance.now() - start;
    }
    if (generation !== token || mode !== 'playing') throw stopped();
  }
  const visible = el => el && el.isConnected && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  async function find(css, token, timeout = 8000, condition = 'visible', expectedText) {
    for (let remaining = timeout; remaining >= 0; remaining -= 100) {
      await wait(0, token); const el = document.querySelector(css);
      if (expectedText !== undefined && sensitive(el)) throw new Error('Private fields cannot be read by text assertions.');
      if (condition === 'hidden' ? !visible(el) : condition === 'present' ? !!el : visible(el)) {
        if (expectedText === undefined || String(el?.value ?? el?.textContent ?? '').includes(expectedText)) return el;
      }
      if (remaining > 0) await wait(Math.min(100, remaining), token);
    }
    if (expectedText !== undefined) throw new Error(`Expected text “${expectedText}” was not found in ${css}`);
    throw new Error(`Element not found or hidden: ${css}`);
  }
  async function action(step, token, macro) {
    if (step.type === 'wait') return;
    if (step.type === 'pointer') { await motion.replay(step, token, macro.speed); return; }
    if (['input', 'select', 'wheel', 'key', 'checked', 'scroll', 'hover'].includes(step.type)) motion.clearClick();
    if (step.type === 'waitFor' || step.type === 'assertText') { await find(step.selector, token, step.timeout ?? macro.elementTimeout ?? 8000, step.condition || 'visible', step.type === 'assertText' ? step.value : undefined); return; }
    if (step.type === 'scroll') {
      const target = step.selector ? await find(step.selector, token, macro.elementTimeout) : window;
      const dx = step.x - (target === window ? scrollX : target.scrollLeft), dy = step.y - (target === window ? scrollY : target.scrollTop);
      target.scrollTo({ left: step.x, top: step.y, behavior: 'instant' }); return { target: target === window ? undefined : target, dx, dy };
    }
    const el = await find(step.selector, token, macro.elementTimeout);
    if (sensitive(el)) throw new Error('Password, payment and private fields cannot be replayed.');
    if (step.type !== 'wheel' || el.getBoundingClientRect().bottom < 0 || el.getBoundingClientRect().top > innerHeight) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    if (step.type === 'hover') { for (const name of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter']) el.dispatchEvent(name.startsWith('pointer') ? new PointerEvent(name, { bubbles: !name.endsWith('enter'), pointerType: 'mouse' }) : new MouseEvent(name, { bubbles: !name.endsWith('enter') })); return { target: el }; }
    if (step.type !== 'wheel') el.focus?.({ preventScroll: true });
    if (step.type === 'checked') {
      if (!(el instanceof HTMLInputElement) || !['checkbox', 'radio'].includes(el.type)) throw new Error('Set checked needs a checkbox or radio input.');
      if (el.disabled) throw new Error('This checkbox is disabled.');
      if (el.checked !== step.checked) { if (step.checked || el.type === 'checkbox') el.click(); else { el.checked = false; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } }
    } else if (step.type === 'click') {
      if (el.disabled) throw new Error(`Element is disabled: ${step.selector}`);
      const button = step.button || 0, r = el.getBoundingClientRect(), held = [1, 4, 2, 8, 16][button] | (step.buttons || 0);
      const pointerResult = motion.consumeClick(button, el, token), pointerReplayed = !!pointerResult && step.pointerRecorded;
      const init = { bubbles: true, cancelable: true, composed: true, view: window, button, detail: step.clickCount || 1, clientX: r.left + r.width * (step.pointX ?? .5), clientY: r.top + r.height * (step.pointY ?? .5), ctrlKey: step.ctrlKey, shiftKey: step.shiftKey, altKey: step.altKey, metaKey: step.metaKey };
      let allowed = pointerReplayed ? pointerResult.allowed : true;
      if (!pointerReplayed) for (const type of ['pointerdown', 'mousedown']) allowed = el.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, { ...init, buttons: held, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, { ...init, buttons: held })) && allowed;
      if (button === 2) el.dispatchEvent(new PointerEvent('contextmenu', { ...init, buttons: held, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      if (!pointerReplayed) for (const type of ['pointerup', 'mouseup']) el.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, { ...init, buttons: step.buttons || 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, { ...init, buttons: step.buttons || 0 }));
      if (button === 0) { el.dispatchEvent(new MouseEvent('click', { ...init, buttons: step.buttons || 0 })); if (step.clickCount === 2) el.dispatchEvent(new MouseEvent('dblclick', { ...init, buttons: step.buttons || 0 })); }
      else {
        allowed = el.dispatchEvent(new PointerEvent('auxclick', { ...init, buttons: step.buttons || 0, pointerId: 1, pointerType: 'mouse', isPrimary: true })) && allowed;
        if (allowed && [3, 4].includes(button)) await send('MOUSE_DEFAULT', { button });
        if (allowed && button === 1 && el.closest('a[href]')) await send('MOUSE_DEFAULT', { button, url: el.closest('a[href]').href });
      }
    } else if (step.type === 'wheel') {
      const r = el.getBoundingClientRect(), clientX = Math.max(0, Math.min(innerWidth - 1, r.left + r.width * (step.pointX ?? .5))), clientY = Math.max(0, Math.min(innerHeight - 1, r.top + r.height * (step.pointY ?? .5)));
      const allowed = el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, buttons: step.buttons || 0, deltaX: step.deltaX, deltaY: step.deltaY, deltaZ: step.deltaZ, deltaMode: step.deltaMode, ctrlKey: step.ctrlKey, shiftKey: step.shiftKey, altKey: step.altKey, metaKey: step.metaKey }));
      if (Array.isArray(step.scrolls)) {
        for (const position of step.scrolls) {
          const target = position.selector ? await find(position.selector, token, macro.elementTimeout) : window;
          if (target !== window && sensitive(target)) throw new Error('Private fields cannot be scrolled.');
          target.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
        }
      } else if (allowed) {
        let target = el;
        while (target && target !== document.documentElement && target.scrollHeight <= target.clientHeight && target.scrollWidth <= target.clientWidth) target = target.parentElement;
        const unitX = step.deltaMode === 1 ? 16 : step.deltaMode === 2 ? innerWidth : 1, unitY = step.deltaMode === 1 ? 16 : step.deltaMode === 2 ? innerHeight : 1;
        (target === document.documentElement || !target ? window : target).scrollBy({ left: step.deltaX * unitX, top: step.deltaY * unitY, behavior: 'instant' });
      }
      return { target: el, dx: step.deltaX, dy: step.deltaY };
    } else if (step.type === 'input' || step.type === 'select') {
      if (el.disabled || el.readOnly) throw new Error(`Field is not editable: ${step.selector}`);
      if (el.isContentEditable) el.textContent = step.value;
      else {
        const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (!setter) throw new Error('This element does not accept a text value.');
        setter.call(el, step.value);
      }
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true })); el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    } else if (step.type === 'key') {
      const allowed = el.dispatchEvent(new KeyboardEvent('keydown', { key: step.key, code: step.key, bubbles: true, cancelable: true, ctrlKey: step.ctrlKey, shiftKey: step.shiftKey, altKey: step.altKey, metaKey: step.metaKey }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: step.key, bubbles: true }));
      // Synthetic keyboard events have no native default action. Supply the common cases.
      if (allowed && step.key === 'Enter' && el instanceof HTMLInputElement && el.form) el.form.requestSubmit();
      if (allowed && step.key === 'Tab') { const nodes = [...document.querySelectorAll('a[href], button, input, textarea, select, [tabindex]')].filter(n => !n.disabled && n.tabIndex >= 0 && n.getClientRects().length); const index = nodes.indexOf(el); nodes[(index + (step.shiftKey ? -1 : 1) + nodes.length) % nodes.length]?.focus(); }
    }
    return { target: el };
  }
  async function playback(macro) {
    const token = ++generation; const playbackRunId = runId; let lastProgress = 0; mode = 'playing'; paused = false; count = 0; overlay(macro.name);
    try {
      paint('Starting…'); await wait(macro.startDelay, token);
      for (let cycle = 1; cycle <= macro.cycles; cycle++) {
        motion.release();
        for (let i = 0; i < macro.steps.length; i++) {
          if (macro.steps[i].enabled === false) continue;
          await wait(macro.steps[i].delay / macro.speed, token);
          let failure, actionContext;
          for (let attempt = 0; attempt <= (macro.retries || 0); attempt++) {
            try { actionContext = await action(macro.steps[i], token, macro); failure = null; break; }
            catch (error) { if (token !== generation) throw error; failure = error; if (attempt < (macro.retries || 0)) await wait(250, token); }
          }
          if (failure && macro.onError !== 'skip') throw new Error(`Action ${i + 1}: ${failure.message}`);
          feedback?.note(macro.steps[i], { sequence: i + 1, cycle, skipped: !!failure, dx: actionContext?.dx, dy: actionContext?.dy });
          if (!failure) feedback?.highlight(macro.steps[i], actionContext || {});
          paint(`Cycle ${cycle}/${macro.cycles} · Action ${i + 1}/${macro.steps.length}`);
          if (performance.now() - lastProgress > 150 || i === macro.steps.length - 1 || failure) { lastProgress = performance.now(); await send('PROGRESS', { cycle, count: i + 1, runId: playbackRunId, ...(failure ? { warning: `Skipped action ${i + 1}: ${failure.message}` } : {}) }); }
        }
        if (cycle < macro.cycles) await wait(macro.cycleDelay, token);
      }
      if (token === generation) await stop('Playback complete.');
    } catch (error) { if (token === generation && mode === 'playing') await stop(`Playback stopped: ${error.message}`); }
  }
  function cleanup(message) { motion.reset(); motion.release(); ++generation; mode = 'idle'; paused = false; wheelEvent = null; wheelContext = null; wheelScrolls.clear(); clearTimeout(wheelTimer); scrollEvent = null; scrollContext = null; pointerGesture = null; batch = []; clearTimeout(scrollTimer); clearTimeout(batchTimer); batchTimer = null; feedback?.finish(message); }
  async function stop(message) {
    const oldMode = mode;
    if (oldMode === 'idle') { feedback?.destroy(); return; }
    flushMovement(); flushBatch(); mode = 'idle'; ++generation;
    await pending;
    try { await send('FINISH', { message: oldMode === 'recording' ? `Recording saved · ${count} actions.` : message }); } catch {}
    cleanup(oldMode === 'recording' ? `Saved · ${count} actions` : message);
  }
  async function togglePause() { flushMovement(); flushBatch(); await pending; const state = await send('TOGGLE_PAUSE'); paused = state.paused; lastEvent = performance.now(); paint(); return state; }
  const motion = globalThis.__autoTapPointerMotion({ active: () => mode === 'recording' && !paused, ours, sensitive, selector, emit: append, wait });
  document.addEventListener('pointermove', motion.move, { capture: true, passive: true });
  document.addEventListener('mousedown', motion.down, true);
  document.addEventListener('mouseup', motion.up, true);
  for (const type of ['dragstart', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend']) document.addEventListener(type, motion.drag, { capture: true, passive: true });
  document.addEventListener('pointerdown', event => {
    pointerGesture = mode === 'recording' && !paused && event.isTrusted && event.isPrimary && !ours(event) && !sensitive(event.target) ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', event => {
    const from = pointerGesture; pointerGesture = null;
    if (from && from.id === event.pointerId && mode === 'recording' && !paused && event.isTrusted && !ours(event) && !sensitive(event.target) && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 28) feedback?.gesture(from, { x: event.clientX, y: event.clientY });
  }, { capture: true, passive: true });
  document.addEventListener('pointercancel', () => { pointerGesture = null; }, { capture: true, passive: true });
  document.addEventListener('click', recordClick, true);
  document.addEventListener('mouseup', recordMouseButton, true);
  document.addEventListener('wheel', recordWheel, { capture: true, passive: true });
  document.addEventListener('input', recordInput, true);
  document.addEventListener('change', recordChange, true);
  document.addEventListener('keydown', recordKey, true);
  document.addEventListener('scroll', recordScroll, true);
  document.addEventListener('keydown', event => { if (event.isTrusted && event.key === 'Escape' && mode !== 'idle') { event.preventDefault(); event.stopImmediatePropagation(); stop('Stopped with Escape.'); } }, true);
  window.addEventListener('pagehide', () => { flushMovement(); flushBatch(); feedback?.destroy(); }, true);
  function pickElement(respond) {
    if (mode !== 'idle' || picking) { respond({ ok: false, error: 'Stop the session before picking an element.' }); return; }
    picking = true; const controller = new AbortController(); let candidate;
    const frame = document.createElement('div'); frame.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:3px solid #6c9a3e;background:#6c9a3e22;border-radius:3px;';
    const hint = document.createElement('div'); hint.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#f5eacd;color:#2b1d14;border:2px solid #2b1d14;border-radius:8px;padding:13px 20px;font:13px system-ui;pointer-events:none;'; hint.textContent = 'AutoTap · Click an element to pick it · Escape to cancel';
    document.documentElement.append(frame, hint);
    const finish = element => { clearTimeout(timer); controller.abort(); frame.remove(); hint.remove(); picking = false; respond(element ? { ok: true, element } : { ok: false, error: 'Element selection cancelled.' }); };
    const timer = setTimeout(() => finish(), 30000);
    document.addEventListener('pointermove', event => { candidate = event.target; if (!(candidate instanceof Element) || candidate === hint || candidate === frame || sensitive(candidate)) return; const rect = candidate.getBoundingClientRect(); Object.assign(frame.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }); }, { capture: true, signal: controller.signal });
    document.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); const el = event.target; if (sensitive(el) || el.getRootNode() !== document) { hint.textContent = 'This field is private or unsupported. Choose another element.'; return; } finish({ selector: selector(el), label: label(el) }); }, { capture: true, signal: controller.signal });
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'auxclick', 'contextmenu']) document.addEventListener(type, event => { event.preventDefault(); event.stopImmediatePropagation(); }, { capture: true, signal: controller.signal });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(); } }, { capture: true, signal: controller.signal });
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'RECORD') { runId = message.runId; ++generation; mode = 'recording'; paused = false; count = 0; lastEvent = performance.now(); pending = Promise.resolve(); overlay(message.name); respond({ ok: true }); }
    else if (message.type === 'PLAY') { runId = message.runId; playback(message.macro); respond({ ok: true }); }
    else if (message.type === 'STOP_LOCAL') { if (!message.runId || message.runId === runId) { flushMovement(); cleanup(message.message); } respond({ ok: true }); }
    else if (message.type === 'PAUSE_LOCAL') { flushMovement(); paused = message.paused; lastEvent = performance.now(); paint(); respond({ ok: true }); }
    else if (message.type === 'REQUEST_STOP') { if (message.runId && message.runId !== runId) { respond({ ok: true }); return; } stop('Stopped.').then(() => respond({ ok: true })); return true; }
    else if (message.type === 'REQUEST_PAUSE') { if (message.runId && message.runId !== runId) { respond({ ok: true, state: { mode: 'idle', paused: false } }); return; } togglePause().then(state => respond({ ok: true, state }), error => respond({ ok: false, error: error.message })); return true; }
    else if (message.type === 'PICK_ELEMENT') { pickElement(respond); return true; }
    else if (message.type === 'EXTRACT_PAGE') {
      try {
        const columns = message.columns;
        if (!columns || typeof columns !== 'object' || Array.isArray(columns) || !Object.keys(columns).length || Object.keys(columns).length > 30) throw new Error('Use a JSON object with 1–30 named columns.');
        const fields = Object.entries(columns).map(([name, raw]) => { const field = typeof raw === 'string' ? { selector: raw, attribute: 'text' } : raw; if (!field || typeof field.selector !== 'string' || field.selector.length > 2000 || name.length > 100) throw new Error('Each column needs a CSS selector.'); if (field.selector && field.selector !== ':scope') document.createDocumentFragment().querySelector(field.selector); return [name, field]; });
        const nodes = [...document.querySelectorAll(String(message.rowSelector || ''))]; let size = 0, skippedFields = 0;
        const rows = nodes.slice(0, 1000).filter(node => !sensitive(node)).map(row => Object.fromEntries(fields.map(([name, field]) => {
          const element = field.selector === ':scope' || !field.selector ? row : row.querySelector(field.selector); let value = '';
          if (element && sensitive(element)) skippedFields++;
          else if (element) { const attribute = field.attribute || 'text'; value = attribute === 'text' ? element.textContent.trim().replace(/\s+/g, ' ') : attribute === 'href' || attribute === 'src' ? element[attribute] || element.getAttribute(attribute) || '' : attribute === 'value' ? element.value || '' : element.getAttribute(attribute) || ''; }
          value = String(value).slice(0, 10000); size += value.length; if (size > 1000000) throw new Error('Extract less data: output is limited to about 2 MB.'); return [name, value];
        })));
        respond({ ok: true, rows, columns: fields.map(([name]) => name), url: location.href, matched: nodes.length, truncated: nodes.length > 1000, skippedFields });
      } catch (error) { respond({ ok: false, error: error.message }); }
    }
    else if (message.type === 'VALIDATE_MACRO') {
      const results = [];
      message.macro.steps.forEach((step, index) => {
        if (step.enabled === false || step.type === 'wait') return;
        const selectors = step.type === 'pointer' ? step.targets : [step.selector, ...(step.type === 'wheel' ? (step.scrolls || []).map(target => target.selector) : [])];
        for (const css of new Set(selectors.filter(Boolean))) {
          try { const nodes = document.querySelectorAll(css); if (nodes.length !== 1 || sensitive(nodes[0])) results.push({ index, selector: css, message: !nodes.length ? 'Not found in this page' : nodes.length > 1 ? `${nodes.length} matches; first will be used` : 'Private field is excluded' }); }
          catch (error) { results.push({ index, selector: css, message: error.message }); }
        }
      });
      respond({ ok: true, results });
    }
  });
})();
