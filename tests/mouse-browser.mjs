import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, cp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from '../tools/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = `<!doctype html><meta charset="utf-8"><title>Mouse recording garden</title><style>body{font:16px system-ui;padding:20px;min-height:2200px;background:#faf6e9}button,a{display:inline-block;padding:20px;margin:10px}#grid{display:flex;gap:20px}#scroller,#horizontal{width:230px;height:110px;overflow:auto;overscroll-behavior:contain;border:1px solid #aaa}#scroller div{height:1000px}#horizontal div{width:1500px}textarea{width:210px;height:90px;overscroll-behavior:contain}#virtual,#history-target,#root-zone{padding:15px;margin:10px;background:#e9d9b3}</style><button id="buttons">Mouse target</button><a id="new-link" href="/linked">Open linked page</a><div id="history-target">Browser history target</div><div id="root-zone">Page wheel area</div><div id="grid"><div id="scroller"><div>Vertical area</div></div><div id="horizontal"><div>Horizontal area</div></div></div><textarea id="editor" aria-label="Notes">${'A line of text\n'.repeat(50)}</textarea><div id="virtual">Custom wheel area</div><script>window.mouseLog=[];window.virtual=0;const el=document.querySelector('#buttons');for(const type of ['mousedown','mouseup','click','dblclick','auxclick','contextmenu'])el.addEventListener(type,e=>{mouseLog.push({type,button:e.button,buttons:e.buttons,detail:e.detail,shiftKey:e.shiftKey,x:e.offsetX,y:e.offsetY});if(e.button!==0)e.preventDefault()});document.querySelector('#virtual').addEventListener('wheel',e=>{e.preventDefault();window.virtual+=e.deltaY},{passive:false});</script>`;
const server = createServer((_, response) => { response.setHeader('Content-Type', 'text/html'); response.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`, profile = await mkdtemp(path.join(tmpdir(), 'autotap-mouse-test-')), extension = path.join(profile, 'extension');
await cp(path.join(root, 'chrome'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8')); manifest.host_permissions = ['http://127.0.0.1/*']; await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const { chromium } = await playwright(); const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); let context;
try {
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1180, height: 950 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker'); const extensionId = new URL(worker.url()).host;
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); await page.goto(url);
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url?.startsWith(url)).id, url);
  const ui = await context.newPage(); ui.on('pageerror', error => errors.push(error.message)); await ui.goto(`chrome-extension://${extensionId}/workspace.html?tab=${tabId}`);
  const call = (type, extra = {}) => ui.evaluate(async ({ type, extra }) => { const result = await chrome.runtime.sendMessage({ type, ...extra }); if (!result.ok) throw new Error(result.error); return result.data; }, { type, extra });
  async function until(check) { for (let n = 0; n < 100; n++) { if (await check()) return; await delay(40); } throw new Error('Mouse recording check timed out'); }
  const idle = () => until(async () => (await call('GET_SESSION', { tabId })).mode === 'idle');
  const recorded = async id => (await call('GET_LIBRARY')).macros.find(m => m.id === id);
  async function play(macro) { const saved = await call('SAVE_MACRO', { macro: { ...macro, cycles: 1, startDelay: 0, steps: macro.steps.map(s => ({ ...s, delay: 20 })) } }); await call('PLAY', { tabId, id: saved.id }); await idle(); return saved; }

  const mouse = await call('RECORD', { tabId, name: 'All five mouse buttons' }); await page.bringToFront();
  await page.locator('#buttons').click({ position: { x: 23, y: 12 } });
  await page.keyboard.down('Shift'); await page.locator('#buttons').click({ button: 'right' }); await page.keyboard.up('Shift');
  await page.locator('#buttons').click({ button: 'middle' });
  const client = await context.newCDPSession(page), rect = await page.locator('#buttons').boundingBox();
  for (const [button, buttons] of [['back', 8], ['forward', 16]]) {
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', button, buttons, x: rect.x + 30, y: rect.y + 20, clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button, buttons: 0, x: rect.x + 30, y: rect.y + 20, clickCount: 1 });
  }
  await page.locator('#buttons').dblclick(); await call('STOP', { tabId });
  const all = await recorded(mouse.id), clicks = all.steps.filter(s => s.type === 'click');
  assert.deepEqual(clicks.map(s => s.button), [0, 2, 1, 3, 4, 0, 0]); assert.equal(clicks[1].shiftKey, true); assert.equal(clicks.at(-1).clickCount, 2);
  assert.ok(clicks[0].pointX > 0 && clicks[0].pointX < .5);
  await page.evaluate(() => { window.mouseLog = []; }); await play(all);
  const log = await page.evaluate(() => window.mouseLog);
  assert.deepEqual(log.filter(e => e.type === 'mousedown').map(e => e.button), [0, 2, 1, 3, 4, 0, 0]);
  assert.deepEqual(log.filter(e => e.type === 'auxclick').map(e => e.button), [2, 1, 3, 4]);
  assert.equal(log.filter(e => e.type === 'contextmenu').length, 1); assert.equal(log.filter(e => e.type === 'dblclick').length, 1);
  assert.equal(log.find(e => e.type === 'contextmenu').shiftKey, true); assert.ok(Math.abs(log[0].x - 23) <= 1);
  console.log('PASS: trusted recording of left/right/middle/Back/Forward; replay uses correct event types, button masks, modifiers, click counts and coordinates');

  async function wheelCase({ target, dx = 0, dy = 180, state, reset, boundary = false }) {
    await page.goto(url); await page.bringToFront(); if (reset) await page.evaluate(reset); await page.locator(target).hover();
    const recording = await call('RECORD', { tabId, name: `Wheel ${target}` });
    await page.mouse.wheel(dx, dy); await delay(80); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const expected = await page.evaluate(state); await call('STOP', { tabId });
    const macro = await recorded(recording.id), wheels = macro.steps.filter(s => s.type === 'wheel');
    assert.equal(wheels.length, 1, target); assert.equal(wheels[0].deltaX, dx); assert.equal(wheels[0].deltaY, dy);
    if (target === '#virtual' || boundary) assert.deepEqual(wheels[0].scrolls, []); else assert.ok(wheels[0].scrolls.length, `${target} captures its observed scroll position`);
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('#scroller').scrollTop = 0; document.querySelector('#horizontal').scrollLeft = 0; document.querySelector('#editor').scrollTop = 0; window.virtual = 0; });
    if (boundary && reset) await page.evaluate(reset);
    await play(macro); assert.equal(await page.evaluate(state), expected, `${target} replays exactly`);
  }
  await wheelCase({ target: '#root-zone', state: () => scrollY });
  await wheelCase({ target: '#scroller', state: () => document.querySelector('#scroller').scrollTop });
  await wheelCase({ target: '#horizontal', dx: 180, dy: 0, state: () => document.querySelector('#horizontal').scrollLeft });
  await wheelCase({ target: '#editor', state: () => document.querySelector('#editor').scrollTop });
  await wheelCase({ target: '#virtual', state: () => window.virtual });
  await wheelCase({ target: '#scroller', boundary: true, reset: () => { document.querySelector('#scroller').scrollTop = 99999; }, state: () => document.querySelector('#scroller').scrollTop });
  console.log('PASS: real wheel input on page, nested containers, horizontal areas, textareas and custom canvas-style handlers; no-scroll wheel gestures and Stop flush are retained');

  await page.goto(url); const middle = await call('RECORD', { tabId, name: 'Middle-click link' }); await page.bringToFront();
  const opened = context.waitForEvent('page'); await page.locator('#new-link').click({ button: 'middle' }); const firstTab = await opened; await firstTab.waitForLoadState(); await call('STOP', { tabId }); await firstTab.close();
  const middleMacro = await recorded(middle.id); const replayOpened = context.waitForEvent('page'); await play(middleMacro); const replayTab = await replayOpened; await replayTab.waitForLoadState(); await delay(100);
  assert.equal(context.pages().filter(p => p.url().endsWith('/linked')).length, 1, 'Middle-click opens exactly one background tab'); await replayTab.close();
  await page.goto(`${url}/history-a`); await page.goto(`${url}/history-b`);
  const base = { ...all, id: crypto.randomUUID(), steps: [{ type: 'click', selector: '#history-target', button: 3, delay: 0 }] };
  await play(base); await page.waitForURL('**/history-a');
  await play({ ...base, id: crypto.randomUUID(), steps: [{ ...base.steps[0], button: 4 }] }); await page.waitForURL('**/history-b');
  console.log('PASS: native middle-click link opening and browser Back/Forward playback; page cancellation is respected');

  const dialogItem = await call('SAVE_MACRO', { macro: { ...all, id: crypto.randomUUID(), name: 'Recording · www.example.com' } });
  await ui.bringToFront(); await ui.reload(); await ui.locator(`.item[data-id="${dialogItem.id}"]`).click(); await ui.locator('#delete-item').click();
  const dialog = ui.getByRole('dialog', { name: 'Delete macro?' }); await dialog.waitFor();
  assert.ok(await dialog.getByRole('button', { name: 'Delete', exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 12), 'Dialog buttons remain readable');
  assert.equal(await ui.evaluate(() => document.activeElement.textContent), 'Cancel');
  await mkdir(path.join(tmpdir(), 'autotap-macro-previews'), { recursive: true });
  await dialog.screenshot({ path: path.join(tmpdir(), 'autotap-macro-previews/preview-delete-dialog.png') });
  await ui.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }); assert.ok(await recorded(dialogItem.id));
  assert.equal(await ui.locator('#delete-item').evaluate(el => el === document.activeElement), true, 'Focus returns to the opener');
  await ui.locator('#delete-item').click(); await ui.getByRole('button', { name: 'Cancel', exact: true }).click(); assert.ok(await recorded(dialogItem.id));
  await ui.locator('#delete-item').click(); await ui.getByRole('button', { name: 'Delete', exact: true }).click(); await until(async () => !(await recorded(dialogItem.id)));
  await ui.locator('.item').first().click(); const original = await ui.locator('#item-name').inputValue();
  await ui.locator('#item-name').fill('Unsaved draft'); await ui.locator('[data-view="tools"]').click(); await ui.getByRole('dialog', { name: 'Unsaved changes' }).waitFor(); await ui.keyboard.press('Escape'); assert.equal(await ui.locator('#item-name').inputValue(), 'Unsaved draft');
  await ui.locator('[data-view="tools"]').click(); await ui.getByRole('button', { name: 'Discard changes', exact: true }).click(); await ui.locator('[data-template]').first().waitFor();
  await ui.locator('[data-view="macros"]').click(); await ui.locator(`.item[data-id="${all.id}"]`).click();
  await ui.locator('.step').filter({ has: ui.locator('[data-mouse-button]') }).first().locator('summary').click(); await ui.locator('[data-mouse-button]').first().selectOption('2'); await ui.locator('#save-item').click();
  await until(async () => (await recorded(all.id)).steps.find(s => s.type === 'click').button === 2);
  await ui.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'All changes saved');
  const wheelMacro = (await call('GET_LIBRARY')).macros.find(m => m.steps.some(s => s.type === 'wheel'));
  await ui.locator(`.item[data-id="${wheelMacro.id}"]`).click(); await ui.locator('.step').filter({ has: ui.locator('[data-wheel]') }).first().locator('summary').click();
  await ui.locator('[data-wheel="deltaY"]').first().fill('90'); await ui.locator('[data-wheel="deltaY"]').first().press('Tab');
  await ui.locator('[data-observed-scroll]').first().uncheck(); await ui.locator('#save-item').click();
  await until(async () => (await recorded(wheelMacro.id)).steps.find(s => s.type === 'wheel').deltaY === 90);
  assert.equal((await recorded(wheelMacro.id)).steps.find(s => s.type === 'wheel').scrolls, undefined);
  console.log('PASS: editor saves mouse-button choices, wheel deltas and the observed/relative scrolling mode');
  assert.ok(original); assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: styled deletion dialog, Cancel/Escape, safe default focus, focus restoration, confirmed deletion and asynchronous discard checks');
  console.log('ALL MOUSE AND DIALOG BROWSER CHECKS PASSED');
} finally { await context?.close(); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); }
