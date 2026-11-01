import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, cp, rm, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from '../tools/browser.mjs';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureHTML = await readFile(path.join(root, 'tests/fixture.html'), 'utf8');
let redirectedRequests = 0;
const dependency = 'var depHelper = () => 42; document.documentElement.dataset.dependencyExecuted = "yes";';
const api = createServer(async (request, response) => {
  const endpoint = new URL(request.url, 'http://localhost').pathname;
  if (endpoint === '/dep.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(dependency); return; }
  if (endpoint === '/theme.css') { response.setHeader('Content-Type', 'text/css'); response.end('body{--resolved:1}'); return; }
  if (endpoint === '/slow') { setTimeout(() => { if (!response.destroyed) response.end('late'); }, 900); return; }
  if (endpoint === '/redirect') { response.writeHead(302, { Location: '/secret' }); response.end(); return; }
  if (endpoint === '/secret') { redirectedRequests++; response.end('should not follow'); return; }
  if (endpoint === '/binary') { response.setHeader('Content-Type', 'application/octet-stream'); response.end(Buffer.from([0, 255, 128, 42])); return; }
  if (endpoint === '/html') { response.setHeader('Content-Type', 'text/html'); response.end('<h1>Network document</h1>'); return; }
  const chunks = []; for await (const part of request) chunks.push(part);
  response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ ok: true, method: request.method, body: Buffer.concat(chunks).toString(), custom: request.headers['x-autotap'] || '', cookie: request.headers.cookie || '' }));
});
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
const apiURL = `http://127.0.0.1:${api.address().port}`;
const pages = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  if (request.url === '/with-frame') return response.end('<title>Frame host</title><h1>Top page</h1><iframe src="/frame"></iframe>');
  if (request.url === '/frame') return response.end('<title>Child</title><body><h1>Inside frame</h1></body>');
  response.end(fixtureHTML + '<section id="cards"><article><h2>First item</h2><a href="/first">Open</a></article><article><h2>Second item</h2><a href="/second">Open</a></article></section>');
});
await new Promise(resolve => pages.listen(0, '127.0.0.1', resolve));
const pageURL = `http://127.0.0.1:${pages.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), 'autotap-compat-'));
const downloadPath = path.join(profile, 'downloads'); await mkdir(downloadPath); await mkdir(path.join(profile, 'Default'));
await writeFile(path.join(profile, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: downloadPath, prompt_for_download: false, directory_upgrade: true }, savefile: { default_directory: downloadPath } }));
const extension = path.join(profile, 'extension'); await cp(path.join(root, 'chrome'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*', 'https://127.0.0.1/*'];
manifest.permissions.push('notifications', 'downloads', 'clipboardWrite');
manifest.optional_permissions = []; // Permissions granted only to this temporary test copy.
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const { chromium } = await playwright(); let browser;
try {
  browser = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, acceptDownloads: true, viewport: { width: 1440, height: 1050 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker', { timeout: 15000 }); const id = new URL(worker.url()).host;
  const fixture = await browser.newPage(); await fixture.goto(pageURL);
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(url)).id, pageURL);
  const settings = await browser.newPage(); await settings.goto(`chrome://extensions/?id=${id}`); await settings.evaluate(async id => chrome.developerPrivate.updateExtensionConfiguration({ extensionId: id, userScriptsAccess: true }), id);
  const workspace = await browser.newPage(); const errors = []; workspace.on('pageerror', error => errors.push(error.message));
  await workspace.goto(`chrome-extension://${id}/workspace.html?tab=${tabId}`); await workspace.locator('#empty-create').waitFor();
  const call = (type, extra = {}) => workspace.evaluate(async ({ type, extra }) => { const result = await chrome.runtime.sendMessage({ type, ...extra }); if (!result.ok) throw new Error(result.error); return result.data; }, { type, extra });
  const script = (code, grants = [], extra = {}) => ({ id: crypto.randomUUID(), name: 'Compatibility check', code, matches: [`${pageURL}/*`], world: 'USER_SCRIPT', enabled: false, grants, ...extra });
  const run = (code, grants, extra) => call('RUN_SCRIPT', { tabId, script: script(code, grants, extra) });
  const connect = [new URL(apiURL).host];
  await run(`const r = await GM.xmlHttpRequest({ url: '${apiURL}/json', responseType: 'json' }); document.querySelector('#result').textContent = String(r.response.ok);`, ['GM_xmlhttpRequest'], { connect });
  assert.equal(await fixture.locator('#result').textContent(), 'true');
  await run(`const r = await GM.xmlHttpRequest({ url: '${apiURL}/echo', method: 'POST', headers: { 'X-AutoTap': 'yes' }, data: new URLSearchParams({ answer: '42' }), responseType: 'json' }); document.querySelector('#result').textContent = JSON.stringify(r.response);`, ['GM_xmlhttpRequest'], { connect });
  const posted = JSON.parse(await fixture.locator('#result').textContent()); assert.equal(posted.body, 'answer=42'); assert.equal(posted.custom, 'yes'); assert.equal(posted.cookie, '');
  await run(`GM_xmlhttpRequest({ url: '${apiURL}/json', responseType: 'json', onload: r => document.querySelector('#result').textContent = 'legacy ' + r.status });`, ['GM_xmlhttpRequest'], { connect });
  assert.equal(await fixture.locator('#result').textContent(), 'legacy 200');
  await run(`try { await GM.xmlHttpRequest({ url: '${apiURL}/slow', timeout: 100 }); } catch(error) { document.querySelector('#result').textContent = error.kind; }`, ['GM_xmlhttpRequest'], { connect });
  assert.equal(await fixture.locator('#result').textContent(), 'timeout');
  await run(`const request = GM.xmlHttpRequest({ url: '${apiURL}/slow' }); setTimeout(() => request.abort(), 20); try { await request; } catch(error) { document.querySelector('#result').textContent = error.kind; }`, ['GM_xmlhttpRequest'], { connect });
  assert.equal(await fixture.locator('#result').textContent(), 'abort');
  await run(`const r = await GM.xmlHttpRequest({ url: '${apiURL}/binary', responseType: 'arraybuffer' }); document.querySelector('#result').textContent = Array.from(new Uint8Array(r.response)).join(',');`, ['GM_xmlhttpRequest'], { connect });
  assert.equal(await fixture.locator('#result').textContent(), '0,255,128,42');
  await run(`const r = await GM.xmlHttpRequest({ url: '${apiURL}/html', responseType: 'document' }); document.querySelector('#result').textContent = r.response.querySelector('h1').textContent;`, ['GM_xmlhttpRequest'], { connect });
  assert.equal(await fixture.locator('#result').textContent(), 'Network document');
  await assert.rejects(run(`await GM.xmlHttpRequest({url:'${apiURL}/json'});`, ['GM_xmlhttpRequest']), /@connect/);
  await assert.rejects(run(`await GM.xmlHttpRequest({url:'${apiURL}/redirect'});`, ['GM_xmlhttpRequest'], { connect }), /fetch|redirect|Failed/i); assert.equal(redirectedRequests, 0);
  console.log('PASS: cross-origin GM requests, form POST, callbacks, binary/document responses, timeout, abort, connect denial and redirect guard');
  const localScript = script(`GM_addStyle(GM_getResourceText('theme')); const text = await (await fetch(GM_getResourceURL('theme'))).text(); document.querySelector('#result').textContent = helper(21) + ':' + text;`, ['GM_addStyle', 'GM_getResourceText', 'GM_getResourceURL'], { requires: [{ url: 'local:helper.js', code: 'var helper = value => value * 2;' }], resources: [{ name: 'theme', url: 'local:theme.css', mime: 'text/css', data: Buffer.from('body{--autotap:1}').toString('base64') }] });
  await call('RUN_SCRIPT', { tabId, script: localScript }); assert.equal(await fixture.locator('#result').textContent(), '42:body{--autotap:1}');
  await assert.rejects(call('RUN_SCRIPT', { tabId, script: { ...localScript, requires: [{ url: 'missing.js', code: '' }] } }), /Attach local/);
  console.log('PASS: bundled @require executes in order; text/blob resources work; unresolved dependencies cannot execute');
  // Chrome caps named worlds per document; production reports this without running a body in the fallback world.
  await assert.rejects(run(`document.querySelector('#result').textContent = 'must not run';`, []), /isolated-script limit/);
  assert.ok((await call('GET_ACTIVITY')).some(entry => entry.status === 'error' && entry.message.includes('isolated-script limit')));
  assert.notEqual(await fixture.locator('#result').textContent(), 'must not run'); await fixture.reload();
  console.log('PASS: Chrome world-limit fallback refuses user code and exposes an actionable error');
  const shared = script(`GM_addValueChangeListener('shared', (key, before, after, remote) => { document.querySelector('#result').textContent = String(after) + ':' + remote; });`, ['GM_addValueChangeListener', 'GM_removeValueChangeListener', 'GM_setValue']);
  await call('SAVE_SCRIPT', { script: shared }); await call('RUN_SCRIPT', { tabId, script: shared });
  await call('SAVE_SCRIPT_VALUES', { id: shared.id, values: { shared: 7 } }); await fixture.getByText('7:true', { exact: true }).waitFor();
  await call('RUN_SCRIPT', { tabId, script: { ...shared, code: shared.code + `\nawait GM.setValue('shared', 8);` } }); await fixture.getByText('8:false', { exact: true }).waitFor();
  const other = await browser.newPage(); await other.goto(pageURL);
  const otherId = await worker.evaluate(async () => (await chrome.tabs.query({})).filter(tab => tab.url?.startsWith('http://127.0.0.1:')).at(-1).id);
  await call('RUN_SCRIPT', { tabId: otherId, script: shared }); await call('SAVE_SCRIPT_VALUES', { id: shared.id, values: { shared: 9 } }); await fixture.getByText('9:true', { exact: true }).waitFor(); await other.getByText('9:true', { exact: true }).waitFor();
  console.log('PASS: GM value listeners synchronize tabs, identify local/remote changes and receive editor changes');
  const frameScript = script(`await GM.setValue('frameSeen', true); GM_registerMenuCommand('Frame action', () => document.body.dataset.command = 'done');`, ['GM_setValue', 'GM_registerMenuCommand'], { matches: [`${pageURL}/frame`], enabled: true, allFrames: true });
  await call('SAVE_SCRIPT', { script: frameScript }); await fixture.goto(`${pageURL}/with-frame`);
  await workspace.waitForFunction(async id => (await chrome.runtime.sendMessage({ type: 'GET_SCRIPT_VALUES', id })).data.frameSeen === true, frameScript.id);
  const menus = await call('GET_TAB_TOOLS', { tabId }); const frameMenu = menus.menus.find(m => m.scriptId === frameScript.id); assert.ok(frameMenu);
  await call('SCRIPT_COMMAND', { tabId, scriptId: frameScript.id, id: frameMenu.id }); assert.equal(await fixture.frameLocator('iframe').locator('body').getAttribute('data-command'), 'done');
  await call('SAVE_SCRIPT', { script: { ...frameScript, enabled: false } }); await fixture.goto(pageURL);
  const includeScript = script(`document.querySelector('#result').textContent = 'include-only';`, [], { matches: [], includes: [`${pageURL}/report?`], enabled: true });
  await call('SAVE_SCRIPT', { script: includeScript }); await fixture.goto(`${pageURL}/report1`); await fixture.getByText('include-only', { exact: true }).waitFor(); await fixture.goto(`${pageURL}/other`); assert.equal(await fixture.locator('#result').textContent(), 'Ready'); await call('SAVE_SCRIPT', { script: { ...includeScript, enabled: false } });
  console.log('PASS: authorized iframe auto-run and commands; include-only URL globs filter broad candidates correctly');
  const extraction = await call('EXTRACT_PAGE', { tabId, rowSelector: '#cards article', columns: { title: 'h2', url: { selector: 'a', attribute: 'href' } } }); assert.equal(extraction.rows.length, 2); assert.equal(extraction.rows[1].title, 'Second item'); assert.equal(extraction.rows[0].url, `${pageURL}/first`);
  const privateData = await call('EXTRACT_PAGE', { tabId, rowSelector: 'body', columns: { secret: { selector: '#password', attribute: 'value' } } }); assert.equal(privateData.rows[0].secret, ''); assert.equal(privateData.skippedFields, 1);
  await workspace.locator('[data-view="tools"]').click(); await workspace.locator('#extract-row').fill('#cards article'); await workspace.locator('#extract-columns').fill('{"title":"h2","url":{"selector":"a","attribute":"href"}}'); await workspace.locator('#extract-page').click(); await workspace.locator('#extract-preview tbody tr').nth(1).waitFor(); assert.equal(await workspace.locator('#extract-preview tbody tr').count(), 2);
  console.log('PASS: page extraction, private-field exclusion and actual Toolbox CSV/JSON preview');
  const sourceDraft = script(`document.querySelector('#result').textContent = depHelper() + ':' + GM_getResourceText('theme');`, ['GM_getResourceText'], { requires: [{ url: `${apiURL}/dep.js#sha256=${createHash('sha256').update(dependency).digest('hex')}`, code: '' }], resources: [{ name: 'theme', url: `${apiURL}/theme.css`, data: '', mime: 'text/css' }] });
  const resolved = await call('FETCH_ATTACHMENTS', { script: sourceDraft }); assert.equal(resolved.requires[0].code, dependency); assert.equal(await fixture.locator('html').getAttribute('data-dependency-executed'), null);
  await assert.rejects(call('FETCH_ATTACHMENTS', { script: { ...sourceDraft, requires: [{ url: `${apiURL}/dep.js#sha256=bad`, code: '' }] } }), /Integrity hash/);
  await call('SAVE_SCRIPT', { script: sourceDraft }); await workspace.reload(); await workspace.locator('[data-view="scripts"]').click(); await workspace.locator('#universal-script-options > summary').click(); await workspace.locator('#fetch-attachments').click(); await workspace.getByText('Files attached to this draft. Review the code before saving or running.', { exact: true }).waitFor();
  assert.equal(await fixture.locator('html').getAttribute('data-dependency-executed'), null); assert.equal((await call('GET_LIBRARY')).scripts.find(item => item.id === sourceDraft.id).requires[0].code, '');
  await workspace.locator('#run-script').click(); await fixture.getByText('42:body{--resolved:1}', { exact: true }).waitFor();
  console.log('PASS: explicit dependency fetching verifies integrity, stays in an unsaved draft, exposes source review and executes only after Run');
  await run(`await GM.setClipboard('AutoTap isolated test'); document.querySelector('#result').textContent = 'clipboard done';`, ['GM_setClipboard']); assert.equal(await fixture.locator('#result').textContent(), 'clipboard done');
  await run(`const notification = GM_notification({text:'Temporary test',title:'AutoTap check', ondone: () => document.querySelector('#result').textContent = 'notification done'}); await notification.ready; await notification.remove();`, ['GM_notification']); assert.equal(await fixture.locator('#result').textContent(), 'notification done');
  const cdp = await browser.newCDPSession(workspace); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath, eventsEnabled: true });
  await run(`await GM.download({ url:'data:text/plain;charset=utf-8,AutoTap%20download%20test', name:'autotap-test.txt' }); document.querySelector('#result').textContent = 'download done';`, ['GM_download']); assert.equal(await fixture.locator('#result').textContent(), 'download done');
  const downloads = await worker.evaluate(async () => chrome.downloads.search({ state: 'complete' }));
  assert.ok(downloads.some(item => item.url.includes('AutoTap%20download%20test') && item.bytesReceived > 0));
  console.log('PASS: optional clipboard write bridge, notification create/remove, and completed download callbacks in a temporary profile');
  assert.deepEqual(errors, []); console.log('ALL COMPATIBILITY BROWSER CHECKS PASSED');
} finally { await browser?.close(); pages.close(); api.close(); await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); }
