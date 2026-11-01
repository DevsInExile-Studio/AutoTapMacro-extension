(() => {
  if (globalThis.__autoTapPointerMotion) return;
  globalThis.__autoTapPointerMotion = ({ active, ours, sensitive, selector, emit, wait }) => {
    let events = [], targets = [], indices = new WeakMap(), timer, lastPoint = null;
    let held = 0, hoverTarget = null, transfer = null, lastRelease = null;
    const heldTargets = new Map();
    const kinds = ['down', 'move', 'up', 'dragstart', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend'];
    const mask = button => [1, 4, 2, 8, 16][button] || 0;
    function reset(keepPosition = false) { clearTimeout(timer); events = []; targets = []; indices = new WeakMap(); if (!keepPosition) lastPoint = null; }
    function flush() {
      clearTimeout(timer);
      if (!events.length) return;
      const start = events[0].at, end = events.at(-1).at;
      const path = events.map(point => {
        const row = [kinds.indexOf(point.kind), point.target, Math.round(point.x * 100000), Math.round(point.y * 100000), Math.round(point.at - start), point.button, point.buttons, (point.altKey ? 1 : 0) | (point.ctrlKey ? 2 : 0) | (point.metaKey ? 4 : 0) | (point.shiftKey ? 8 : 0), point.detail || 0];
        while (row.length > 5 && row.at(-1) === 0) row.pop(); return row;
      });
      const moved = path.some(point => point[0] === 1 || point[0] >= 3);
      emit({ type: 'pointer', targets, events: path }, { startedAt: start, endedAt: end, silent: !moved, previewed: true });
      reset(true);
    }
    function capture(event, kind) {
      if (!active() || !event.isTrusted || ours(event) || sensitive(event.target)) return;
      const target = event.target;
      if (!(target instanceof Element) || target.getRootNode() !== document) return;
      if (kind === 'move' && lastPoint?.target === target && lastPoint.x === event.clientX && lastPoint.y === event.clientY && lastPoint.buttons === event.buttons) return;
      lastPoint = { target, x: event.clientX, y: event.clientY, buttons: event.buttons };
      if (kind === 'down') flush();
      if (!indices.has(target)) {
        if (targets.length >= 32) flush();
        indices.set(target, targets.length); targets.push(selector(target));
      }
      events.push({ kind, target: indices.get(target), x: Math.round(event.clientX / Math.max(1, innerWidth) * 100000) / 100000, y: Math.round(event.clientY / Math.max(1, innerHeight) * 100000) / 100000,
        detail: Math.min(3, Math.max(0, event.detail || 0)), button: Math.max(0, Math.min(4, event.button || 0)), buttons: event.buttons & 31, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, at: performance.now() });
      if (events.length >= 128) flush();
      else { clearTimeout(timer); timer = setTimeout(flush, 100); }
    }
    function mouse(target, type, init) { return target.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, init)); }
    function release() {
      for (const [button, record] of heldTargets) {
        const target = record.target;
        held &= ~mask(button);
        if (target?.isConnected) for (const type of ['pointerup', 'mouseup']) mouse(target, type, { bubbles: true, cancelable: true, composed: true, button, buttons: held });
      }
      heldTargets.clear(); held = 0; hoverTarget = null; transfer = null; lastRelease = null;
    }
    async function replay(step, token, speed) {
      let previous = 0, dispatchCost = 0;
      const targetCache = new Array(step.targets.length);
      for (const value of step.events) {
        const flags = Array.isArray(value) ? value[7] || 0 : 0;
        const point = Array.isArray(value) ? { kind: kinds[value[0]], target: value[1], x: value[2] / 100000, y: value[3] / 100000, t: value[4], detail: value[8] || 0, button: value[5] || 0, buttons: value[6] || 0, altKey: !!(flags & 1), ctrlKey: !!(flags & 2), metaKey: !!(flags & 4), shiftKey: !!(flags & 8) } : value;
        await wait(Math.max(0, (point.t - previous) / speed - dispatchCost), token); previous = point.t;
        const started = performance.now(), x = Math.max(0, Math.min(innerWidth - 1, point.x * innerWidth)), y = Math.max(0, Math.min(innerHeight - 1, point.y * innerHeight));
        let recordedTarget = targetCache[point.target];
        if (!recordedTarget?.isConnected) { recordedTarget = document.querySelector(step.targets[point.target]); targetCache[point.target] = recordedTarget; }
        if (!recordedTarget && point.kind === 'down') throw new Error('Pointer press target was not found.');
        const target = recordedTarget || document.elementFromPoint(x, y);
        if (!target || sensitive(target)) throw new Error('Pointer target is missing or private.');
        const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, detail: point.detail || 0, button: point.button, buttons: point.buttons,
          ctrlKey: point.ctrlKey, shiftKey: point.shiftKey, altKey: point.altKey, metaKey: point.metaKey };
        if (point.kind === 'down') {
          held = point.buttons; const record = { target, allowed: true }; heldTargets.set(point.button, record); target.focus?.({ preventScroll: true });
          for (const type of ['pointerdown', 'mousedown']) record.allowed = mouse(target, type, init) && record.allowed;
        } else if (point.kind === 'up') {
          let allowed = heldTargets.get(point.button)?.allowed ?? true;
          for (const type of ['pointerup', 'mouseup']) allowed = mouse(target, type, init) && allowed;
          lastRelease = { button: point.button, target, token, allowed };
          held = point.buttons; heldTargets.delete(point.button);
        } else if (point.kind === 'move') {
          if (hoverTarget !== target) {
            if (hoverTarget?.isConnected) for (const type of ['pointerout', 'pointerleave', 'mouseout', 'mouseleave']) mouse(hoverTarget, type, { ...init, relatedTarget: target, bubbles: !type.endsWith('leave') });
            for (const type of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter']) mouse(target, type, { ...init, relatedTarget: hoverTarget, bubbles: !type.endsWith('enter') });
            hoverTarget = target;
          }
          held = point.buttons;
          mouse(target, 'pointermove', { ...init, button: -1 }); mouse(target, 'mousemove', init);
        } else {
          if (point.kind === 'dragstart') transfer = new DataTransfer();
          target.dispatchEvent(new DragEvent(point.kind, { ...init, dataTransfer: transfer || new DataTransfer() }));
          if (point.kind === 'dragend') release();
        }
        dispatchCost = performance.now() - started;
      }
    }
    return { flush, reset, replay, release,
      clearClick: () => { lastRelease = null; },
      consumeClick(button, target, token) { const match = lastRelease && lastRelease.button === button && lastRelease.token === token && (target === lastRelease.target || target.contains(lastRelease.target)); const result = match ? { allowed: lastRelease.allowed } : null; lastRelease = null; return result; },
      move: event => capture(event, 'move'), down: event => capture(event, 'down'), up: event => capture(event, 'up'), drag: event => capture(event, event.type) };
  };
})();
