import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from '../tools/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = createServer(async (_, response) => { response.setHeader('Content-Type', 'text/html'); response.end(await readFile(path.join(root, 'tests/fixture.html'))); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), 'autotap-feedback-test-'));
const extension = path.join(profile, 'extension'); await cp(path.join(root, 'chrome'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*']; await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const { chromium } = await playwright();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let context;
try {
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1000, height: 800 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const fixture = await context.newPage(); const errors = []; fixture.on('pageerror', error => errors.push(error.message)); await fixture.goto(url);
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url?.startsWith(url)).id, url);
  const workspace = await context.newPage(); await workspace.goto(`chrome-extension://${extensionId}/workspace.html?tab=${tabId}`);
  const call = (type, extra = {}) => workspace.evaluate(async ({ type, extra }) => { const result = await chrome.runtime.sendMessage({ type, ...extra }); if (!result.ok) throw new Error(result.error); return result.data; }, { type, extra });
  const client = await context.newCDPSession(fixture); await client.send('DOM.enable');
  // CDP can inspect the extension's closed shadow roots without exposing them to the site.
  async function inRoot(id, fn, args = []) {
    const { root: tree } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
    function find(node) { const index = node.attributes?.indexOf('id'); if (index >= 0 && node.attributes[index + 1] === id) return node; for (const child of [...node.children || [], ...node.shadowRoots || []]) { const match = find(child); if (match) return match; } }
    const node = find(tree); assert.ok(node?.shadowRoots?.length, `${id} exists`);
    const { object } = await client.send('DOM.resolveNode', { backendNodeId: node.shadowRoots[0].backendNodeId });
    try { const result = await client.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: fn.toString(), arguments: args.map(value => ({ value })), returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
    finally { await client.send('Runtime.releaseObject', { objectId: object.objectId }); }
  }
  const snapshot = () => inRoot('autotap-floating-controls', function () {
    const box = selector => { const r = this.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const notice = this.querySelector('.action-carousel');
    const cards = [...notice.querySelectorAll('.action-toast:not(.leaving)')];
    const latest = cards.at(-1);
    return {
      text: this.textContent, status: this.querySelector('.status').textContent,
      title: latest?.querySelector('.action-title').textContent || '', saved: latest?.dataset.saved,
      visible: notice.classList.contains('visible'), notificationCount: cards.length, leavingCount: notice.querySelectorAll('.leaving').length,
      cards: cards.map(node => { const r = node.getBoundingClientRect(); return { sequence: node.dataset.sequence, title: node.querySelector('.action-title').textContent, x: r.x, y: r.y, width: r.width, height: r.height }; }),
      notification: box('.action-carousel'), bar: box('.bar'), pause: box('.pause'), stop: box('.stop'),
      effects: this.querySelector('.effects-toggle').getAttribute('aria-pressed'),
      animated: [...this.querySelectorAll('*')].some(n => n.getAnimations().some(a => a.playState === 'running'))
    };
  });
  const effects = () => inRoot('autotap-visual-feedback', function () { return { count: this.querySelector('.effects').childElementCount, ripple: !!this.querySelector('.ripple'), gesture: !!this.querySelector('.gesture'), target: !!this.querySelector('.target') }; });
  async function press(selector) { const point = await inRoot('autotap-floating-controls', function (selector) { const r = this.querySelector(selector).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [selector]); await fixture.mouse.click(point.x, point.y); }
  async function until(check) { for (let n = 0; n < 100; n++) { if (await check()) return; await delay(30); } throw new Error('Feedback did not reach the expected state'); }

  const recording = await call('RECORD', { tabId, name: 'A little visible routine' }); await fixture.bringToFront();
  await delay(220); const initial = await snapshot();
  await fixture.locator('#counter').click(); assert.equal(await fixture.locator('#clicks').textContent(), '1'); assert.equal((await effects()).ripple, true);
  await delay(300); const firstCard = (await snapshot()).cards[0];
  await fixture.locator('#counter').click(); assert.equal(await fixture.locator('#clicks').textContent(), '2', 'Ripple does not intercept the next click');
  await until(async () => (await snapshot()).saved === 'true');
  await delay(300);
  let view = await snapshot(); assert.equal(view.notificationCount, 3); assert.ok(view.cards[0].x < firstCard.x, 'The first action slides left when the second arrives'); assert.match(view.title, /Click · Add one/);
  assert.ok(view.status.includes(`${(await call('GET_SESSION', { tabId })).count} saved`));
  await fixture.locator('#password').fill('private-password'); await fixture.locator('#card').fill('4111111111111111');
  assert.match((await snapshot()).title, /Click · Add one/, 'Private fields do not replace the action notification');
  await fixture.locator('#name').fill('visible text must stay out of the overlay');
  await fixture.locator('#name').pressSequentially('x'.repeat(45), { delay: 3 });
  view = await snapshot(); assert.equal(view.title, 'Type · Name'); assert.equal(view.notificationCount, 3); assert.equal(view.cards.filter(c => c.title === 'Type · Name').length, 1, 'Typing updates one card without adding carousel entries');
  assert.ok(!view.text.includes('visible text must stay out of the overlay'));
  assert.equal((await effects()).target, true);
  await fixture.locator('#scroller').evaluate(el => { el.scrollTop = 230; });
  await until(async () => (await effects()).gesture);
  await until(async () => (await snapshot()).title === 'Scroll container');
  await until(async () => (await snapshot()).saved === 'true');
  view = await snapshot(); assert.equal(view.notificationCount, 3); assert.ok(view.leavingCount <= 1); assert.deepEqual(view.cards.map(c => c.title), ['Click · Add one', 'Type · Name', 'Scroll container'], 'The oldest card leaves, keeping the three most recent visible actions'); assert.ok(view.notification.height <= 34);
  await delay(300); view = await snapshot(); assert.equal(view.leavingCount, 0); assert.ok(view.cards.every((c, i) => c.height <= 34 && (!i || c.x > view.cards[i - 1].x)), 'The carousel stays in one horizontal row');
  assert.ok(view.notification.y + view.notification.height <= view.bar.y, 'The notice appears above the bar');
  assert.deepEqual(view.pause, initial.pause, 'Pause stays in exactly the same place');
  assert.deepEqual(view.stop, initial.stop, 'Stop stays in exactly the same place');
  const steps = (await call('GET_LIBRARY')).macros.find(m => m.id === recording.id).steps; assert.equal(steps.filter(s => s.type === 'input').length, 1, 'Typing stays one action despite caret scrolling');
  // Put a real page button under the notice: the notice must let the click through.
  await fixture.locator('#counter').evaluate((el, r) => { Object.assign(el.style, { position: 'fixed', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', zIndex: '1' }); }, view.notification);
  await fixture.mouse.click(view.notification.x + view.notification.width / 2, view.notification.y + view.notification.height / 2);
  assert.equal(await fixture.locator('#clicks').textContent(), '3', 'The action notification does not block page controls');
  await fixture.locator('#counter').evaluate(el => el.removeAttribute('style'));
  await until(async () => !(await snapshot()).visible);
  view = await snapshot(); assert.deepEqual(view.pause, initial.pause); assert.deepEqual(view.stop, initial.stop);
  console.log('PASS: new actions enter from the right; older actions move left; only three cards remain in one row; idle fade and click-through work without shifting Pause/Stop');

  const grip = await inRoot('autotap-floating-controls', function () { const r = this.querySelector('.grip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await fixture.mouse.move(grip.x, grip.y); await fixture.mouse.down(); await fixture.mouse.move(grip.x + 150, grip.y - 80, { steps: 8 }); await fixture.mouse.up();
  const dragged = await snapshot(); assert.ok(dragged.bar.x > initial.bar.x && dragged.bar.y < initial.bar.y, 'Manual dragging remains available');
  const beforeControls = (await call('GET_SESSION', { tabId })).count;
  await press('.effects-toggle'); assert.equal((await snapshot()).effects, 'false'); assert.equal((await effects()).count, 0);
  await press('.pause'); await until(async () => (await call('GET_SESSION', { tabId })).paused);
  const frozen = (await snapshot()).status;
  await fixture.locator('#counter').click(); await delay(1100);
  assert.equal((await snapshot()).status, frozen, 'Pause freezes the active timer');
  assert.equal((await snapshot()).visible, false); assert.equal((await effects()).count, 0); assert.equal((await call('GET_SESSION', { tabId })).count, beforeControls);
  await press('.pause'); await fixture.locator('#counter').click();
  await until(async () => (await call('GET_SESSION', { tabId })).count > beforeControls);
  assert.equal((await effects()).count, 0, 'Disabling highlights still records and shows action notifications');
  view = await snapshot(); assert.equal(view.visible, true); assert.deepEqual(view.pause, dragged.pause); assert.deepEqual(view.stop, dragged.stop);
  await press('.stop'); await until(async () => (await call('GET_SESSION', { tabId })).mode === 'idle');
  await until(async () => await fixture.locator('#autotap-visual-feedback').count() === 0);
  assert.equal((await snapshot()).visible, false, 'Stopping hides the notice');
  await press('.stop'); assert.equal(await fixture.locator('#autotap-floating-controls').count(), 0);
  const macro = (await call('GET_LIBRARY')).macros.find(m => m.id === recording.id);
  assert.ok(macro.steps.length > beforeControls); assert.equal(macro.steps.filter(s => s.type === 'click' && s.selector === '#counter').length, 4); assert.ok(!macro.steps.some(s => s.selector?.includes('autotap')));
  console.log('PASS: panel controls are excluded from recording; timer pauses; dragging is explicit; Stop/Close clean up the UI');

  await call('RECORD', { tabId, name: 'Bounded feedback' }); await fixture.bringToFront();
  assert.equal((await snapshot()).effects, 'false', 'Effects preference persists across sessions');
  await press('.effects-toggle');
  for (let n = 0; n < 12; n++) await fixture.locator('#counter').click();
  assert.equal((await snapshot()).notificationCount, 3); assert.ok((await snapshot()).leavingCount <= 1); assert.ok((await effects()).count <= 8);
  await fixture.locator('#counter').evaluate(el => { el.textContent = 'A very long button label that should always remain on a single notification line '.repeat(4); });
  await fixture.locator('#counter').click(); view = await snapshot(); assert.ok(view.notification.height <= 34); assert.ok(view.notification.width <= view.bar.width);
  await fixture.emulateMedia({ reducedMotion: 'reduce' }); await delay(700);
  await fixture.locator('#counter').click();
  assert.equal((await effects()).count, 0); assert.equal((await snapshot()).animated, false, 'System reduced motion disables animations');
  await fixture.setViewportSize({ width: 390, height: 650 });
  const rect = await fixture.locator('#autotap-floating-controls').boundingBox(); assert.ok(rect.x >= 0 && rect.x + rect.width <= 390 && rect.y >= 0 && rect.y + rect.height <= 650);
  view = await snapshot(); assert.ok(view.notification.x >= 0 && view.notification.x + view.notification.width <= 390 && view.notification.y >= 0);
  await call('STOP', { tabId });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: rapid actions keep at most three cards and one departing card; labels stay one line; effects preferences, reduced motion and narrow viewports work');
  console.log('ALL FEEDBACK BROWSER CHECKS PASSED');
} finally { await context?.close(); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); }
