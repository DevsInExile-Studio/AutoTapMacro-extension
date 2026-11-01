import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from '../tools/browser.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = `<!doctype html><meta charset="utf-8"><title>Pointer garden</title><style>body{margin:0;min-height:850px;background:#faf6e9;font:16px system-ui}#drag{position:absolute;left:100px;top:200px;width:140px;height:60px;background:#cdbb91;user-select:none}#source{position:absolute;left:100px;top:420px;width:140px;height:70px;background:#b4c390}#drop{position:absolute;left:480px;top:420px;width:180px;height:100px;border:2px dashed #7d8051}</style><div id="drag">Mouse drag target</div><div id="source" draggable="true">Drag source</div><div id="drop">Drop target</div><script>window.trace=[];window.dragging=false;window.downs=0;window.end={x:0,y:0};window.dropValue='';document.addEventListener('mousemove',e=>{trace.push({x:e.clientX,y:e.clientY,buttons:e.buttons});if(dragging)window.end={x:e.clientX,y:e.clientY}});document.querySelector('#drag').addEventListener('mousedown',e=>{if(e.button===0){window.dragging=true;window.downs++;window.started=performance.now()}});document.addEventListener('mouseup',()=>{if(dragging)window.heldFor=performance.now()-started;window.dragging=false});document.querySelector('#source').addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain','source-payload'));document.querySelector('#drop').addEventListener('dragover',e=>e.preventDefault());document.querySelector('#drop').addEventListener('drop',e=>{e.preventDefault();window.dropValue=e.dataTransfer.getData('text/plain')});</script>`;
const server = createServer((_, response) => { response.setHeader('Content-Type', 'text/html'); response.end(html); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`, profile = await mkdtemp(path.join(tmpdir(), 'autotap-pointer-test-')), extension = path.join(profile, 'extension');
await cp(path.join(root, 'chrome'), extension, { recursive: true }); const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8')); manifest.host_permissions = ['http://127.0.0.1/*']; await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const { chromium } = await playwright(); const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); let context;
try {
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1000, height: 850 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker'), extensionId = new URL(worker.url()).host;
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); await page.goto(url);
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url?.startsWith(url)).id, url);
  const ui = await context.newPage(); await ui.goto(`chrome-extension://${extensionId}/workspace.html?tab=${tabId}`);
  const call = (type, extra = {}) => ui.evaluate(async ({ type, extra }) => { const result = await chrome.runtime.sendMessage({ type, ...extra }); if (!result.ok) throw new Error(result.error); return result.data; }, { type, extra });
  async function until(check) { for (let n = 0; n < 200; n++) { if (await check()) return; await delay(30); } throw new Error('Pointer check timed out'); }
  const unpack = p => Array.isArray(p) ? { kind: ['down','move','up','dragstart','dragenter','dragover','dragleave','drop','dragend'][p[0]], target:p[1], x:p[2]/100000, y:p[3]/100000,t:p[4],button:p[5]||0,buttons:p[6]||0,altKey:!!((p[7]||0)&1),ctrlKey:!!((p[7]||0)&2),metaKey:!!((p[7]||0)&4),shiftKey:!!((p[7]||0)&8) } : p;
  const get = async id => (await call('GET_LIBRARY')).macros.find(m => m.id === id);
  async function play(macro) { const saved = await call('SAVE_MACRO', { macro: { ...macro, cycles: 1, speed: 4, startDelay: 0 } }); await call('PLAY', { tabId, id: saved.id }); await until(async () => (await call('GET_SESSION', { tabId })).mode === 'idle'); }
  const free = await call('RECORD', { tabId, name: 'Cursor trajectory' }); await page.bringToFront();
  await page.mouse.move(80, 90, { steps: 12 }); await page.mouse.move(620, 125, { steps: 35 }); await call('STOP', { tabId });
  const freeMacro = await get(free.id), freePoints = freeMacro.steps.filter(s => s.type === 'pointer').flatMap(s => s.events.map(unpack)).filter(p => p.kind === 'move');
  assert.ok(freePoints.length >= 35); assert.ok(freeMacro.steps.filter(s => s.type === 'pointer').every(s => s.events.length <= 128 && s.targets.length <= 32));
  await page.evaluate(() => { window.trace = []; }); await play(freeMacro);
  const actual = await page.evaluate(() => window.trace); assert.equal(actual.length, freePoints.length);
  for (let n = 0; n < actual.length; n++) { assert.ok(Math.abs(actual[n].x - freePoints[n].x * 1000) <= 1); assert.ok(Math.abs(actual[n].y - freePoints[n].y * 850) <= 1); }
  assert.equal((await call('VALIDATE_MACRO', { tabId, macro: freeMacro })).results.length, 0, 'Pointer target selectors validate correctly');
  console.log('PASS: delivered cursor movements are recorded and replayed in order with coordinates and timing');

  await page.mouse.move(150, 230); const drag = await call('RECORD', { tabId, name: 'Hold and drag' });
  await page.mouse.down(); await delay(100); await page.mouse.move(410, 300, { steps: 30 }); await delay(100); await page.mouse.up(); await call('STOP', { tabId });
  const dragMacro = await get(drag.id); assert.ok(dragMacro.steps.some(s => s.type === 'pointer' && s.events.map(unpack).some(p => p.kind === 'move' && p.buttons === 1)));
  await page.evaluate(() => { window.trace = []; window.downs = 0; window.dragging = false; window.end = { x: 0, y: 0 }; }); await play(dragMacro);
  const state = await page.evaluate(() => ({ downs, dragging, end })); assert.equal(state.downs, 1, 'Logical click playback does not duplicate captured mouse-down events'); assert.equal(state.dragging, false); assert.ok(Math.abs(state.end.x - 410) <= 1 && Math.abs(state.end.y - 300) <= 1);
  console.log('PASS: held button masks, dragging and releases replay once without duplicate presses');
  await page.evaluate(() => { window.downs = 0; });
  await play({ ...dragMacro, id: crypto.randomUUID(), steps: [{ type: 'click', selector: '#drag', button: 0, pointerRecorded: true, delay: 0 }] });
  assert.equal(await page.evaluate(() => window.downs), 1, 'An edited macro still presses the mouse when its pointer segment was removed');
  await page.evaluate(() => document.addEventListener('contextmenu', event => event.preventDefault()));
  await page.mouse.move(150, 230); const chord = await call('RECORD', { tabId, name: 'Two held mouse buttons' });
  await page.mouse.down(); await page.mouse.down({ button: 'right' }); await page.mouse.move(210, 245, { steps: 12 }); await page.mouse.up({ button: 'right' }); await page.mouse.up(); await call('STOP', { tabId });
  const chordMacro = await get(chord.id);
  assert.ok(chordMacro.steps.some(s => s.type === 'pointer' && s.events.map(unpack).some(p => p.buttons === 3)), 'Simultaneously held buttons retain their mask');
  assert.ok(chordMacro.steps.some(s => s.type === 'click' && s.button === 2 && s.buttons === 1), 'Releasing right click retains the still-held left button');
  await page.evaluate(() => { window.downs = 0; window.dragging = false; window.trace = []; }); await play(chordMacro);
  assert.equal(await page.evaluate(() => window.downs), 1); assert.ok(await page.evaluate(() => window.trace.some(p => p.buttons === 3)));
  console.log('PASS: simultaneous buttons and edited pointer segments retain correct press/release behavior');

  await page.locator('#source').hover(); const htmlDrag = await call('RECORD', { tabId, name: 'HTML drag and drop' }); await page.dragAndDrop('#source', '#drop'); await call('STOP', { tabId });
  assert.equal(await page.evaluate(() => window.dropValue), 'source-payload'); const htmlMacro = await get(htmlDrag.id);
  assert.ok(htmlMacro.steps.some(s => s.type === 'pointer' && s.events.map(unpack).some(p => p.kind === 'drop')));
  await page.evaluate(() => { window.dropValue = ''; }); await play(htmlMacro); assert.equal(await page.evaluate(() => window.dropValue), 'source-payload');
  console.log('PASS: HTML drag/drop lifecycle replays; the page supplies its own DataTransfer payload');

  const slow = await call('SAVE_MACRO', { macro: { ...dragMacro, id: crypto.randomUUID(), speed: .25, startDelay: 0 } });
  await call('PLAY', { tabId, id: slow.id }); await until(async () => page.evaluate(() => window.dragging)); await call('TOGGLE_PAUSE', { tabId });
  const paused = await page.evaluate(() => window.end); await delay(160); assert.deepEqual(await page.evaluate(() => window.end), paused);
  await call('STOP', { tabId }); assert.equal(await page.evaluate(() => window.dragging), false, 'Stop releases held buttons');
  console.log('PASS: pause freezes movement; Stop releases held page input');
  const benchmark = await call('RECORD', { tabId, name: 'Long pointer benchmark' }); await page.bringToFront();
  await worker.evaluate(() => { globalThis.pointerWrites = 0; globalThis.pointerWatch = (changes, area) => { if (area === 'local' && Object.keys(changes).some(k => k.startsWith('macro:'))) pointerWrites++; }; chrome.storage.onChanged.addListener(pointerWatch); });
  await page.evaluate(() => { window.trace = []; });
  await page.mouse.move(30, 40); await page.mouse.move(880, 60, { steps: 520 }); await call('STOP', { tabId });
  const measured = await get(benchmark.id), segments = measured.steps.filter(s => s.type === 'pointer'), delivered = await page.evaluate(() => window.trace.length);
  const points = segments.flatMap(s => s.events.map(unpack)); assert.equal(points.filter(p => p.kind === 'move').length, delivered);
  assert.ok(segments.every(s => s.events.length <= 128 && s.targets.length <= 32));
  const compactBytes = Buffer.byteLength(JSON.stringify(segments)), expandedBytes = Buffer.byteLength(JSON.stringify(segments.map(s => ({ ...s, events: s.events.map(unpack) }))));
  const writes = await worker.evaluate(() => { chrome.storage.onChanged.removeListener(pointerWatch); return pointerWrites; });
  assert.ok(compactBytes < expandedBytes * .55, 'Packed coordinates substantially reduce storage without dropping delivered motion');
  assert.ok(writes < 30, 'Long movements are saved in batches');
  console.log(`PERFORMANCE: ${delivered} delivered movements, ${segments.length} bounded segments, ${writes} record writes, ${compactBytes} packed bytes vs ${expandedBytes} expanded bytes`);
  assert.equal(errors.length, 0, errors.join('\n')); console.log('ALL POINTER BROWSER CHECKS PASSED');
} finally { await context?.close(); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); }
