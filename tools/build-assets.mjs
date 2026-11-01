import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from './browser.mjs';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(tmpdir(), 'autotap-macro-previews');
await mkdir(artifacts, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Invalid path');
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' }[path.extname(file)] || 'application/octet-stream';
    response.setHeader('Content-Type', mime); response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await playwright();
const profile = await mkdtemp(path.join(tmpdir(), 'autotap-artwork-'));
const testExtension = path.join(profile, 'extension');
await cp(path.join(root, 'chrome'), testExtension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(testExtension, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['https://example.com/*', 'http://127.0.0.1/*']; await writeFile(path.join(testExtension, 'manifest.json'), JSON.stringify(manifest));
let context;
try {
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1400, height: 560 }, deviceScaleFactor: 1, args: [`--disable-extensions-except=${testExtension}`, `--load-extension=${testExtension}`] });
  const page = await context.newPage();
  await page.goto(`${address}/store/promo.html`); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(root, 'store/promo-1400x560.png') });
  await page.setViewportSize({ width: 440, height: 280 }); await page.goto(`${address}/store/promo.html?small`); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(root, 'store/promo-440x280.png') });
  await page.setViewportSize({ width: 1600, height: 640 }); await page.goto(`${address}/docs/banner.html`); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(root, 'docs/assets/github-banner.png') });
  const detailCapture = async (element, file, title, description, number) => {
    const source = await element.screenshot({ animations: 'disabled' });
    await page.setViewportSize({ width: 1280, height: 800 }); await page.goto(`${address}/store/screenshot-frame.html`);
    await page.evaluate(async ({ source, title, description, number }) => {
      document.querySelector('#title').textContent = title; document.querySelector('#description').textContent = description; document.querySelector('#number').textContent = `${number} / 05`;
      const img = document.querySelector('#capture'); img.src = `data:image/png;base64,${source}`; await img.decode(); await document.fonts.ready;
    }, { source: source.toString('base64'), title, description, number });
    await page.screenshot({ path: path.join(root, 'store', file) });
  };
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 }); const extensionId = new URL(worker.url()).host;
  const example = await context.newPage(); await example.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>My daily dashboard</title><h1>Daily dashboard</h1><main id="demo-cards"><article><h2>Weekly report</h2><a href="/reports/weekly">Open report</a></article><article><h2>Project notes</h2><a href="/notes/project">Open notes</a></article><article><h2>Reading list</h2><a href="/reading">Open list</a></article></main>' })); await example.goto('https://example.com/');
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({})).find(t => t.url?.startsWith('https://example.com/')).id);
  const macros = [
    { id: 'morning-routine', name: 'My morning routine', site: 'https://example.com', url: 'https://example.com/', cycles: 2, speed: 1, startDelay: 500, cycleDelay: 800, steps: [ { type: 'click', selector: '#dashboard-button', label: 'Open dashboard', delay: 200 }, { type: 'input', selector: '#report-title', label: 'Report title', value: 'Weekly report', delay: 300 }, { type: 'wait', delay: 500 }, { type: 'click', selector: '#save-report', label: 'Save report', delay: 250 } ] },
    { id: 'weekly-report', name: 'Weekly report', site: 'https://example.com', url: 'https://example.com/reports', cycles: 1, speed: 1.5, startDelay: 500, cycleDelay: 500, steps: [{ type: 'click', selector: '#export', label: 'Export report', delay: 200 }] },
    { id: 'a-little-scroll', name: 'A little scroll', site: 'https://example.com', url: 'https://example.com/', cycles: 3, speed: .5, startDelay: 500, cycleDelay: 1000, steps: [{ type: 'scroll', selector: '', x: 0, y: 500, delay: 1000 }] }
  ];
  const scripts = [{ id: 'reading-mode', name: 'A calmer reading mode', matches: ['https://example.com/*'], enabled: false, world: 'USER_SCRIPT', runAt: 'document_idle', code: `// A little less noise. A little more focus.\nconst article = document.querySelector('article');\n\nif (article) {\n  article.style.maxWidth = '720px';\n  article.style.margin = '40px auto';\n  article.style.lineHeight = '1.8';\n}\n\nconsole.log('Make yourself at home.');` }];
  await worker.evaluate(async ({ macros, scripts }) => chrome.storage.local.set({ macros, scripts }), { macros, scripts });
  const workspace = await context.newPage(); await workspace.setViewportSize({ width: 1280, height: 800 }); await workspace.goto(`chrome-extension://${extensionId}/workspace.html?tab=${tabId}`); await workspace.locator('#item-name').waitFor(); await workspace.evaluate(() => document.fonts.ready);
  await workspace.screenshot({ path: path.join(root, 'store/screenshot-macros-1280x800.png'), animations: 'disabled' });
  await workspace.locator('[data-view="scripts"]').click(); await workspace.locator('#script-code').waitFor();
  // Show the real editor after the per-extension script switch has been enabled.
  const settings = await context.newPage(); await settings.goto(`chrome://extensions/?id=${extensionId}`); await settings.evaluate(async extensionId => chrome.developerPrivate.updateExtensionConfiguration({ extensionId, userScriptsAccess: true }), extensionId);
  await workspace.locator('#recheck-scripts').click(); await workspace.locator('#recheck-scripts').waitFor({ state: 'detached' });
  await workspace.screenshot({ path: path.join(root, 'store/screenshot-javascript-1280x800.png'), animations: 'disabled' });
  await workspace.locator('#universal-script-options > summary').click(); await workspace.locator('#universal-script-options').scrollIntoViewIfNeeded();
  await detailCapture(workspace.locator('#universal-script-options'), 'screenshot-compatibility-1280x800.png', 'Choose what your scripts can do.', 'Site rules, network access and attached files — all in one place.', '04');
  await workspace.locator('[data-view="tools"]').click(); await workspace.locator('[data-template="reading"]').waitFor();
  await workspace.locator('#extract-row').fill('#demo-cards article'); await workspace.locator('#extract-columns').fill(JSON.stringify({ title: 'h2', url: { selector: 'a', attribute: 'href' } }, null, 2)); await workspace.locator('#extract-page').click(); await workspace.locator('#extract-preview tbody tr').nth(2).waitFor(); await workspace.locator('#extract-preview').scrollIntoViewIfNeeded();
  await detailCapture(workspace.locator('.page-extractor'), 'screenshot-toolbox-1280x800.png', 'Turn page data into something useful.', 'Choose a CSS selector, preview a table, and export CSV or JSON.', '05');
  // A real session on a bundled example website: the recorder and feedback are unmodified.
  const recordingPage = await context.newPage(); await recordingPage.setViewportSize({ width: 1280, height: 800 });
  await recordingPage.goto(`${address}/store/recording-demo.html`); await recordingPage.evaluate(() => document.fonts.ready);
  const recordingTabId = await worker.evaluate(async address => (await chrome.tabs.query({})).find(t => t.url?.startsWith(`${address}/store/recording-demo.html`)).id, address);
  const recordingCall = type => workspace.evaluate(async ({ type, tabId }) => { const result = await chrome.runtime.sendMessage({ type, tabId, name: 'A live recording demo' }); if (!result.ok) throw new Error(result.error); return result.data; }, { type, tabId: recordingTabId });
  await recordingCall('RECORD'); await recordingPage.bringToFront(); await recordingPage.waitForTimeout(1200);
  await recordingPage.locator('#open-dashboard').click(); await recordingPage.locator('#report-title').fill('Weekly report'); await recordingPage.locator('#ready').check();
  await recordingPage.locator('#reading-list').hover(); await recordingPage.mouse.wheel(0, 105); await recordingPage.waitForTimeout(400);
  await recordingPage.screenshot({ path: path.join(root, 'store/screenshot-recording-1280x800.png') });
  await recordingCall('STOP');
  assert.equal((await workspace.evaluate(async tabId => (await chrome.runtime.sendMessage({ type: 'GET_SESSION', tabId })).data, recordingTabId)).mode, 'idle');
  const popup = await context.newPage(); await popup.setViewportSize({ width: 390, height: 650 });
  // A standalone popup preview needs the same active-tab context as a toolbar invocation.
  await popup.addInitScript(tabId => { const original = chrome.tabs.query.bind(chrome.tabs); chrome.tabs.query = async query => query.active ? [await chrome.tabs.get(tabId)] : original(query); }, tabId);
  await popup.goto(`chrome-extension://${extensionId}/popup.html`); await popup.locator('.recent-row').first().waitFor(); await popup.evaluate(() => document.fonts.ready);
  await popup.locator('.popup').screenshot({ path: path.join(artifacts, 'preview-popup.png') });
  const popupHeight = await popup.locator('.popup').evaluate(el => el.getBoundingClientRect().height);
  if (popupHeight > 600) throw new Error(`Popup exceeds Chrome's limit: ${popupHeight}px`);
  await popup.getByRole('tab', { name: 'Scripts', exact: true }).click(); await popup.locator('[data-script]').waitFor();
  await popup.locator('.popup').screenshot({ path: path.join(artifacts, 'preview-popup-scripts.png') });
  await popup.getByRole('tab', { name: 'Commands', exact: true }).click(); await popup.getByText('No commands on this page.', { exact: false }).waitFor();
  await popup.locator('.popup').screenshot({ path: path.join(artifacts, 'preview-popup-commands.png') });
  const protectedPopup = await context.newPage(); await protectedPopup.setViewportSize({ width: 390, height: 650 });
  await protectedPopup.addInitScript(id => { chrome.tabs.query = async () => [{ id, url: 'chrome://extensions/' }]; }, tabId);
  await protectedPopup.goto(`chrome-extension://${extensionId}/popup.html`); await protectedPopup.getByText('Browser page', { exact: true }).waitFor(); await protectedPopup.evaluate(() => document.fonts.ready);
  await protectedPopup.locator('.popup').screenshot({ path: path.join(artifacts, 'preview-popup-protected.png') });
  const screenshots = JSON.parse(await readFile(path.join(root, 'store/screenshots.json'), 'utf8'));
  assert.equal(screenshots.length, 5, 'Exactly five store screenshots');
  const dimensions = await page.evaluate(async ({ base, files }) => {
    const result = []; for (const file of files) { const img = new Image(); img.src = `${base}/${file}`; await img.decode(); result.push({ file, width: img.naturalWidth, height: img.naturalHeight }); } return result;
  }, { base: address, files: ['store/promo-440x280.png', 'store/promo-1400x560.png', ...screenshots.map(s => `store/${s.file}`), 'docs/assets/github-banner.png'] });
  for (const item of dimensions) {
    const expected = item.file.includes('screenshot-') ? [1280, 800] : item.file.includes('440x280') ? [440, 280] : item.file.includes('github-banner') ? [1600, 640] : [1400, 560];
    assert.deepEqual([item.width, item.height], expected, item.file);
  }
  console.log(JSON.stringify({ dimensions, popupHeight }, null, 2));
} finally { await context?.close(); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); }
