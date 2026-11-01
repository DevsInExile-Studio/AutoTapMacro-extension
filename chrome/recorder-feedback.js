(() => {
  if (globalThis.__autoTapFeedback) return;
  const preferences = { effects: true };
  const readPreferences = () => chrome.storage.local.get('recorderUi').then(({ recorderUi }) => Object.fromEntries(['effects'].filter(key => typeof recorderUi?.[key] === 'boolean').map(key => [key, recorderUi[key]]))).catch(() => ({}));
  const paths = {
    click: '<path d="m7 3 2 17 4-5 6-1z"/>',
    pointer: '<path d="m3 17 5-9 5 5 8-9M17 4h4v4"/>',
    input: '<path d="M3 5h18v14H3zM8 9v6m-2-6h4m-4 6h4m3-4h5"/>',
    select: '<path d="M4 5h16v14H4zm4 6 4 4 4-4"/>',
    scroll: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
    wheel: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
    key: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h1m3 0h1m3 0h1m-8 5h8"/>',
    checked: '<path d="m5 12 5 5L20 6"/>',
    hover: '<path d="m7 3 2 17 4-5 6-1z"/>',
    wait: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    waitFor: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    assertText: '<path d="m5 12 5 5L20 6"/>'
  };
  const symbol = type => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[type] || paths.click}</svg>`;
  const make = (tag, className, text) => { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const clipped = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 64);

  globalThis.__autoTapFeedback = ({ name, mode, onPause, onStop }) => {
    let disposed = false, finished = false, paused = false, effects = preferences.effects, touched = false;
    let saved = 0, savedRevision = 0, elapsedPaused = 0, pausedAt = null, endedAt, currentMessage, lastEffect = 0, lastEffectTarget, announceTimer, removeTimer, toastTimer, clearToastTimer;
    let actions = [], departing = null;
    const cardAnimations = new Map();
    const ready = readPreferences();
    const started = performance.now(), reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const effectsHost = make('div', ''); effectsHost.id = 'autotap-visual-feedback';
    effectsHost.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483646!important;contain:strict!important;display:block!important;';
    const effectsRoot = effectsHost.attachShadow({ mode: 'closed' });
    effectsRoot.innerHTML = `<style>:host,*{pointer-events:none!important}*{box-sizing:border-box}.effect{position:absolute;color:#4b6f2b;animation:fade .58s ease-out both}.ripple{width:28px;height:28px;margin:-14px;border:2px solid currentColor;border-radius:50%;background:#6c9a3e16;animation:ripple .48s ease-out both}.ripple::after{content:'';position:absolute;inset:9px;background:currentColor;border-radius:50%}.target{border:2px solid #6c9a3e99;background:#6c9a3e0c;border-radius:5px;animation:target .55s ease-out both}.gesture{inset:0;width:100%;height:100%;overflow:visible}.gesture line{stroke-dasharray:var(--length);animation:draw .22s ease-out both}.key{padding:3px 7px;border-radius:4px;background:#f5eacd;color:#4b6f2b;box-shadow:0 1px 6px #2b1d1420;font:700 12px system-ui,sans-serif;white-space:nowrap}@keyframes ripple{from{opacity:.85;transform:scale(.45)}to{opacity:0;transform:scale(1.65)}}@keyframes target{0%{opacity:0}20%{opacity:1}100%{opacity:0}}@keyframes fade{0%{opacity:0}18%{opacity:1}100%{opacity:0}}@keyframes draw{from{stroke-dashoffset:var(--length)}to{stroke-dashoffset:0}}@media(prefers-reduced-motion:reduce){.effect{display:none;animation:none}}</style><div class="effects" aria-hidden="true"></div>`;
    const layer = effectsRoot.querySelector('.effects');
    const host = make('div', ''); host.id = 'autotap-floating-controls';
    host.style.cssText = 'all:initial!important;position:fixed!important;bottom:20px!important;left:50%!important;transform:translateX(-50%)!important;z-index:2147483647!important;display:block!important;max-width:calc(100vw - 24px)!important;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      :host{all:initial}*{box-sizing:border-box}.panel{position:relative;width:440px;max-width:calc(100vw - 24px);background:#f5eacd;color:#2b1d14;border:1px solid #b9a47b88;border-radius:7px;box-shadow:0 4px 18px #2b1d1426;font:13px/1.4 system-ui,sans-serif;animation:arrive .2s ease-out both}.bar{display:flex;gap:9px;align-items:center;padding:10px 12px}.identity{flex:1;min-width:0}.name{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status{color:#5a4531;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}.dot{width:9px;height:9px;border-radius:50%;background:#b9392b;flex:none;animation:pulse 1.8s ease-out infinite}.panel[data-mode=playing] .dot,.panel[data-mode=idle] .dot{background:#6c9a3e}.panel[data-paused=true] .dot{background:#806c50;animation:none}.panel[data-mode=idle] .dot{animation:none}.panel[data-error=true] .dot{background:#b9392b}.panel[data-error=true] .status{color:#a52e23}.grip{cursor:move;touch-action:none;border:0;background:transparent;color:#67563e;padding:5px 0;font:20px system-ui;line-height:1}.grip:active{cursor:grabbing}button{font:700 12px/1.4 system-ui,sans-serif;color:#2b1d14;border:0;border-radius:4px;padding:7px 9px;background:#e9d9b3;cursor:pointer;transition:background .15s,transform .15s}button:hover{background:#dfcda7}button:active{transform:scale(.97)}button:focus-visible{outline:3px solid #5b6b78;outline-offset:2px}.stop{background:#b9392b;color:#fff8e8}.stop:hover{background:#a52e23}.effects-toggle{display:grid;place-items:center;width:28px;height:30px;flex:none;padding:5px;background:transparent;color:#67563e}.effects-toggle[aria-pressed=true]{color:#4b6f2b}.effects-toggle svg{width:17px;height:17px}.action-carousel{position:absolute;bottom:calc(100% + 8px);left:0;right:0;height:34px;overflow:hidden;opacity:0;visibility:hidden;transform:translateY(4px);transition:opacity .18s,transform .18s,visibility .18s;pointer-events:none;mask-image:linear-gradient(to right,transparent,#000 8px,#000 calc(100% - 6px),transparent)}.action-carousel *{pointer-events:none}.action-carousel.visible{opacity:1;visibility:visible;transform:translateY(0)}.action-toast{position:absolute;top:0;display:flex;align-items:center;gap:5px;min-width:0;height:34px;padding:7px 8px;background:#f5eacd;color:#2b1d14;border:1px solid #b9a47b66;border-radius:6px;font-size:12px;line-height:18px;white-space:nowrap;opacity:1;will-change:transform,opacity}.action-toast[data-age="1"]{opacity:.76}.action-toast[data-age="2"]{opacity:.48}.action-symbol{display:flex;flex:none;color:#4b6f2b}.action-symbol svg{width:16px;height:16px}.action-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.confirmation{flex:none;color:#67563e}.action-toast[data-saved=true] .confirmation{color:#4b6f2b}.action-toast[data-skipped=true] .confirmation{color:#946012}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}@keyframes arrive{from{opacity:0}to{opacity:1}}@keyframes pulse{0%{box-shadow:0 0 0 0 #b9392b26}70%,100%{box-shadow:0 0 0 5px #b9392b00}}@media(max-width:480px){.bar{padding:9px 10px;gap:7px}.grip{display:none}.effects-toggle{width:24px;padding:3px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
      [hidden]{display:none!important}
    </style><section class="panel" role="region" aria-label="AutoTap controls"><div class="action-carousel" aria-hidden="true"></div><div class="bar"><button class="grip" aria-label="Drag recording panel" title="Drag panel">⠿</button><span class="dot" aria-hidden="true"></span><div class="identity"><div class="name"></div><div class="status"></div></div><button class="effects-toggle" type="button" aria-pressed="true" aria-label="Interaction highlights" title="Turn off interaction highlights"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/></svg></button><button class="pause" type="button">Pause</button><button class="stop" type="button" title="Stop · Alt+Shift+X">Stop</button></div><div class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div></section>`;
    const panel = root.querySelector('.panel'), status = root.querySelector('.status'), pauseButton = root.querySelector('.pause'), stopButton = root.querySelector('.stop');
    const effectsButton = root.querySelector('.effects-toggle'), carousel = root.querySelector('.action-carousel');
    root.querySelector('.name').textContent = name;
    function clock() { const now = endedAt ?? pausedAt ?? performance.now(); const seconds = Math.max(0, Math.floor((now - started - elapsedPaused) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
    function renderStatus() {
      status.textContent = `${currentMessage || (mode === 'recording' ? `${paused ? 'Paused' : 'Recording'} · ${saved} saved` : paused ? 'Paused' : 'Playing…')} · ${clock()}`;
      status.title = status.textContent;
      panel.dataset.mode = finished ? 'idle' : mode; panel.dataset.paused = String(paused);
      pauseButton.textContent = paused ? 'Resume' : 'Pause'; pauseButton.setAttribute('aria-label', paused ? 'Resume session' : 'Pause session');
    }
    function updatePreferences() {
      effectsButton.setAttribute('aria-pressed', String(effects));
      effectsButton.title = effects ? 'Turn off interaction highlights' : 'Turn on interaction highlights';
    }
    function savePreferences() { touched = true; preferences.effects = effects; chrome.storage.local.set({ recorderUi: { effects } }).catch(() => {}); updatePreferences(); }
    effectsButton.onclick = () => { effects = !effects; if (!effects) layer.replaceChildren(); savePreferences(); };
    pauseButton.onclick = onPause; stopButton.onclick = onStop;
    ready.then(value => { if (!disposed && !touched) { Object.assign(preferences, value); effects = preferences.effects; updatePreferences(); } });
    let drag, moved = false;
    const grip = root.querySelector('.grip');
    const endDrag = () => { drag = null; };
    grip.onpointerdown = event => { if (event.button !== 0) return; const r = host.getBoundingClientRect(); drag = { dx: event.clientX - r.left, dy: event.clientY - r.top }; grip.setPointerCapture(event.pointerId); };
    // Reserve a little space above a manually moved bar for the one-line notice.
    function place(left, top) {
      const r = host.getBoundingClientRect(), maxTop = Math.max(0, innerHeight - r.height);
      host.style.setProperty('left', `${Math.max(0, Math.min(innerWidth - r.width, left))}px`, 'important');
      host.style.setProperty('top', `${Math.max(Math.min(44, maxTop), Math.min(maxTop, top))}px`, 'important');
      host.style.setProperty('bottom', 'auto', 'important'); host.style.setProperty('transform', 'none', 'important');
    }
    grip.onpointermove = event => { if (drag) { moved = true; place(event.clientX - drag.dx, event.clientY - drag.dy); } };
    grip.onpointerup = endDrag; grip.onpointercancel = endDrag; grip.onlostpointercapture = endDrag;
    grip.onkeydown = event => {
      const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
      if (!delta) return;
      event.preventDefault(); const r = host.getBoundingClientRect(); moved = true; place(r.left + delta[0], r.top + delta[1]);
    };
    const resize = () => { if (moved) { const r = host.getBoundingClientRect(); place(r.left, r.top); } layoutCards(false); };
    window.addEventListener('resize', resize);
    const motionChanged = () => { if (reduced.matches) layoutCards(false); };
    reduced.addEventListener('change', motionChanged);
    document.documentElement.append(effectsHost, host); updatePreferences(); renderStatus();
    const ticker = setInterval(renderStatus, 1000);
    const timers = new Map();
    function removeEffect(node) { clearTimeout(timers.get(node)); timers.delete(node); node.remove(); }
    function show(node) {
      if (disposed || finished || paused || !effects || reduced.matches || document.hidden) return;
      while (layer.childElementCount >= 8) removeEffect(layer.firstElementChild);
      layer.append(node); timers.set(node, setTimeout(() => removeEffect(node), 650));
    }
    function gesture(from, to) {
      if (!effects || reduced.matches || disposed || finished || paused || document.hidden) return;
      const distance = Math.hypot(to.x - from.x, to.y - from.y); if (distance < 8) return;
      const fraction = Math.min(1, 100 / distance), x1 = to.x - (to.x - from.x) * fraction, y1 = to.y - (to.y - from.y) * fraction;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'effect gesture'); svg.style.setProperty('--length', `${Math.min(distance, 100)}`);
      // Coordinates are numeric pointer/scroll values, never page HTML.
      svg.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${to.x}" y2="${to.y}" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="${to.x}" cy="${to.y}" r="4" fill="currentColor"/>`;
      show(svg);
    }
    function highlight(step, context = {}) {
      if (!effects || reduced.matches || disposed || finished || paused || document.hidden) return;
      const now = performance.now();
      if (['input', 'scroll', 'wheel'].includes(step.type) && now - lastEffect < 220 && lastEffectTarget === context.target) return;
      lastEffect = now; lastEffectTarget = context.target;
      const rect = context.target?.getBoundingClientRect?.();
      if (step.type === 'scroll' || step.type === 'wheel') {
        const center = rect ? { x: Math.max(16, Math.min(innerWidth - 16, rect.right - 20)), y: Math.max(40, Math.min(innerHeight - 40, rect.top + rect.height / 2)) } : { x: innerWidth - 26, y: innerHeight / 2 };
        const dx = context.dx || 0, dy = context.dy || 0; const length = Math.hypot(dx, dy) || 1;
        gesture({ x: center.x - dx / length * 42, y: center.y - dy / length * 42 }, center); return;
      }
      if (!rect || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) return;
      if (step.type === 'click' || step.type === 'checked') {
        const point = context.point || { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const dot = make('div', 'effect ripple'); dot.style.left = `${Math.max(0, Math.min(innerWidth, point.x))}px`; dot.style.top = `${Math.max(0, Math.min(innerHeight, point.y))}px`; show(dot);
      } else {
        const frame = make('div', 'effect target'); frame.style.cssText = `left:${Math.max(0, rect.left - 2)}px;top:${Math.max(0, rect.top - 2)}px;width:${Math.min(innerWidth, rect.width + 4)}px;height:${Math.min(innerHeight, rect.height + 4)}px;`; show(frame);
        if (step.type === 'key') { const key = make('div', 'effect key', step.key); key.style.left = `${Math.max(8, Math.min(innerWidth - 90, rect.left))}px`; key.style.top = `${Math.max(8, rect.top - 27)}px`; show(key); }
      }
    }
    function describe(step, { dx = 0, dy = 0 } = {}) {
      const target = clipped(step.label) || (step.selector ? 'Page element' : 'Page');
      if (step.type === 'pointer') return [step.events.some(point => Array.isArray(point) ? point[0] === 1 && point[6] : point.kind === 'move' && point.buttons) ? 'Drag pointer' : step.events.some(point => Array.isArray(point) ? point[0] >= 3 : point.kind.startsWith('drag') || point.kind === 'drop') ? 'Drag & drop' : 'Move pointer', `${step.events.length} events`];
      if (step.type === 'click') return [`${['Click', 'Middle click', 'Right click', 'Mouse Back', 'Mouse Forward'][step.button || 0]} · ${target}`, step.clickCount === 2 ? 'Double click' : ''];
      if (step.type === 'wheel') { const direction = Math.abs(step.deltaX) > Math.abs(step.deltaY) ? step.deltaX > 0 ? 'right' : 'left' : step.deltaY > 0 ? 'down' : step.deltaY < 0 ? 'up' : ''; return [`Wheel ${direction}`.trim(), `${target} · Δx ${step.deltaX}, Δy ${step.deltaY}`]; }
      if (step.type === 'input') return [`Type · ${target}`, `${String(step.value || '').length} characters · text hidden`];
      if (step.type === 'select') return [`Choose option · ${target}`, 'Selection changed'];
      if (step.type === 'checked') return [`${step.checked ? 'Check' : 'Uncheck'} · ${target}`, step.checked ? 'Enabled' : 'Disabled'];
      if (step.type === 'key') return [`Press ${step.key} · ${target}`, 'Keyboard action'];
      if (step.type === 'scroll') { const direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'Right' : 'Left' : dy > 0 ? 'Down' : dy < 0 ? 'Up' : 'Scroll'; return [step.selector ? 'Scroll container' : 'Scroll page', `${direction} · Position ${step.x}, ${step.y}`]; }
      return [`${({ click: 'Click', hover: 'Hover', wait: 'Wait', waitFor: 'Wait for element', assertText: 'Check text' })[step.type] || 'Action'}${step.type === 'wait' ? '' : ` · ${target}`}`, step.type === 'wait' ? `${step.delay} ms` : ''];
    }
    function cancelCard(node) { const animation = cardAnimations.get(node); if (animation) { cardAnimations.delete(node); animation.cancel(); } }
    function removeDeparting() { if (departing) { cancelCard(departing); departing.remove(); departing = null; } }
    function clearCards() {
      for (const animation of cardAnimations.values()) animation.cancel();
      cardAnimations.clear(); carousel.replaceChildren(); actions = []; departing = null;
    }
    function animateCard(node, frames, after) {
      const animation = node.animate(frames, { duration: 260, easing: 'cubic-bezier(.22,.8,.25,1)' });
      cardAnimations.set(node, animation);
      animation.finished.then(() => { if (cardAnimations.get(node) === animation) { cardAnimations.delete(node); after?.(); } }).catch(() => {});
    }
    function positions() {
      return new Map(actions.map(action => [action.node, { x: action.node.getBoundingClientRect().left, opacity: Number(getComputedStyle(action.node).opacity) }]));
    }
    function layoutCards(animate = true, before = positions(), leaving = null) {
      const width = carousel.clientWidth, slot = Math.max(0, (width - 12) / 3), gap = 6;
      const start = (width - (actions.length * slot + Math.max(0, actions.length - 1) * gap)) / 2;
      const origin = carousel.getBoundingClientRect().left;
      const moving = animate && !reduced.matches && !document.hidden;
      actions.forEach((action, index) => {
        const node = action.node, old = before.get(node), left = start + index * (slot + gap);
        cancelCard(node); node.style.width = `${slot}px`; node.style.left = `${left}px`; node.dataset.age = String(actions.length - index - 1);
        if (moving) {
          const opacity = Number(getComputedStyle(node).opacity);
          animateCard(node, [{ transform: `translateX(${old ? old.x - origin - left : width + 8 - left}px)`, opacity: old?.opacity ?? 0 }, { transform: 'translateX(0)', opacity }]);
        }
      });
      if (leaving) {
        const node = leaving.node, old = before.get(node);
        cancelCard(node); node.classList.add('leaving'); node.style.width = `${slot}px`; node.style.left = `${old ? old.x - origin : 0}px`; departing = node;
        if (moving && old) animateCard(node, [{ transform: 'translateX(0)', opacity: old.opacity }, { transform: `translateX(${-slot - gap}px)`, opacity: 0 }], () => { if (departing === node) { node.remove(); departing = null; } });
        else removeDeparting();
      } else if (!animate) removeDeparting();
    }
    function hideNotification(immediate = false) {
      clearTimeout(toastTimer); clearTimeout(announceTimer); clearTimeout(clearToastTimer);
      carousel.classList.remove('visible'); carousel.setAttribute('aria-hidden', 'true');
      if (immediate || reduced.matches) clearCards();
      else clearToastTimer = setTimeout(clearCards, 200);
    }
    function note(step, { sequence, revision, merge = false, skipped = false, cycle, dx, dy } = {}) {
      if (disposed || finished) return;
      clearTimeout(clearToastTimer);
      if (!carousel.classList.contains('visible')) clearCards();
      const sameAction = merge && actions.at(-1)?.sequence === sequence;
      const before = positions();
      let action = sameAction ? actions.at(-1) : null, leaving = null;
      if (!action) {
        removeDeparting();
        const node = make('div', 'action-toast'); node.innerHTML = `<span class="action-symbol">${symbol(step.type)}</span><span class="action-title"></span><span class="confirmation"></span>`;
        action = { node, sequence, revision }; actions.push(action); carousel.append(node);
        if (actions.length > 3) leaving = actions.shift();
      }
      action.revision = revision;
      const node = action.node, [title, detail] = describe(step, { dx, dy });
      const text = skipped ? `Skipped · ${title}` : title;
      node.dataset.sequence = String(sequence); node.querySelector('.action-title').textContent = text;
      node.title = `${text}${detail ? ` · ${detail}` : ''}${cycle ? ` · Cycle ${cycle}` : ''}`;
      node.dataset.skipped = String(skipped); node.dataset.saved = String(mode !== 'recording' || revision <= savedRevision);
      const confirmation = node.querySelector('.confirmation');
      confirmation.textContent = skipped ? '!' : mode !== 'recording' ? '✓' : revision <= savedRevision ? '✓' : '·';
      confirmation.title = skipped ? 'Action skipped' : mode !== 'recording' ? 'Action completed' : revision <= savedRevision ? 'Saved locally' : 'Saving…';
      if (!sameAction) layoutCards(true, before, leaving);
      carousel.classList.add('visible'); carousel.setAttribute('aria-hidden', 'false');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => hideNotification(), 1600);
      clearTimeout(announceTimer); announceTimer = setTimeout(() => { if (!disposed) root.querySelector('.sr-only').textContent = text; }, 500);
    }
    function destroy() { if (disposed) return; disposed = true; clearInterval(ticker); clearTimeout(removeTimer); hideNotification(true); for (const timer of timers.values()) clearTimeout(timer); timers.clear(); window.removeEventListener('resize', resize); reduced.removeEventListener('change', motionChanged); host.remove(); effectsHost.remove(); }
    return {
      host,
      note, highlight, gesture,
      paint({ message, count = saved, isPaused = paused } = {}) {
        if (disposed || finished) return;
        if (isPaused !== paused) { if (isPaused) pausedAt = performance.now(); else { elapsedPaused += performance.now() - pausedAt; pausedAt = null; } paused = isPaused; if (paused) hideNotification(true); }
        saved = count; currentMessage = message; renderStatus();
      },
      confirm(revision) { savedRevision = Math.max(savedRevision, revision); for (const action of actions) if (action.revision <= savedRevision && action.node.dataset.skipped !== 'true') { action.node.dataset.saved = 'true'; const node = action.node.querySelector('.confirmation'); node.textContent = '✓'; node.title = 'Saved locally'; } },
      finish(message) { if (disposed || finished) return; endedAt = pausedAt ?? performance.now(); paused = false; currentMessage = message; finished = true; panel.dataset.error = String(/^(Playback|Recording) stopped:/.test(message)); hideNotification(true); renderStatus(); pauseButton.hidden = true; stopButton.textContent = 'Close'; clearInterval(ticker); for (const timer of timers.values()) clearTimeout(timer); timers.clear(); effectsHost.remove(); removeTimer = setTimeout(destroy, 5000); },
      destroy
    };
  };
})();
