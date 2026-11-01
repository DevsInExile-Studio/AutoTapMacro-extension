import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, cp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(tmpdir(), 'autotap-macro-previews');
await mkdir(artifacts, { recursive: true });
const demo = `<!doctype html><html><meta charset="utf-8"><title>A little recording demo</title><style>*{box-sizing:border-box}body{font:14px/1.5 system-ui;margin:0;padding:26px 34px;background:#faf6e9;color:#2b1d14}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d9ccb0;padding-bottom:14px;margin-bottom:18px}h1{font-size:20px;margin:0}small,p{color:#67563e}p{margin:4px 0 16px}button,input{font:inherit;padding:9px 12px;border:1px solid #baa47b;border-radius:5px;background:#fffaf0;color:#2b1d14}button{background:#e9d9b3;cursor:pointer}label{display:inline-flex;gap:7px;align-items:center;margin-left:14px}input[type=checkbox]{accent-color:#4b6f2b;width:17px;height:17px}input[type=text]{width:230px;margin:12px 0}#items{width:100%;height:110px;overflow:auto;border-top:1px solid #ded2b8;border-bottom:1px solid #ded2b8;margin-top:15px;overscroll-behavior:contain}article{padding:11px 4px;border-bottom:1px solid #e4d9c3;display:flex;justify-content:space-between}article span{color:#67563e}</style><header><h1>My daily dashboard</h1><small>AutoTap · A live recording demo</small></header><p>Small interactions. Clear feedback.</p><button id="open">Open dashboard</button><label><input id="ready" type="checkbox">Ready to publish</label><br><input id="title" type="text" placeholder="Report title"><div id="items">${['Weekly report', 'Project notes', 'Reading list', 'Next week', 'Saved links', 'Team checklist', 'Quick reminders'].map((v,i)=>`<article>${v}<span>0${i+1}</span></article>`).join('')}</div></html>`;
const server = createServer((_, response) => { response.setHeader('Content-Type', 'text/html'); response.end(demo); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), 'autotap-recording-preview-')), extension = path.join(profile, 'extension'), frames = path.join(profile, 'frames');
await cp(path.join(root, 'chrome'), extension, { recursive: true }); await mkdir(frames);
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8')); manifest.host_permissions = ['http://127.0.0.1/*']; await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const { chromium } = await playwright(); let context;
try {
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 760, height: 640 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker'); const extensionId = new URL(worker.url()).host;
  const page = await context.newPage(); await page.goto(url);
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url?.startsWith(url)).id, url);
  const ui = await context.newPage(); await ui.goto(`chrome-extension://${extensionId}/workspace.html?tab=${tabId}`);
  const call = type => ui.evaluate(async ({ type, tabId }) => { const r = await chrome.runtime.sendMessage({ type, tabId, name: 'My daily routine' }); if (!r.ok) throw new Error(r.error); }, { type, tabId });
  await call('RECORD'); await page.bringToFront();
  let frame = 0;
  async function capture(total) { for (let n = 0; n < total; n++) { await page.screenshot({ path: path.join(frames, `${String(frame++).padStart(3, '0')}.png`) }); await new Promise(resolve => setTimeout(resolve, 65)); } }
  await capture(4); await page.locator('#open').click(); await capture(7);
  await page.locator('#title').fill('Weekly report'); await capture(7);
  await page.locator('#ready').check(); await capture(7);
  await page.locator('#items').hover(); await page.mouse.wheel(0, 200); await capture(8);
  const bar = await page.locator('#autotap-floating-controls').boundingBox();
  await page.screenshot({ path: path.join(artifacts, 'preview-recording.png'), clip: { x: bar.x, y: Math.max(0, bar.y - 44), width: bar.width, height: bar.height + 44 } });
  await page.screenshot({ path: path.join(artifacts, 'preview-recording-page.png') });
  await capture(18); await call('STOP'); await capture(5);
  const bundledPython = path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  const pythonBin = process.env.PYTHON_PATH || (existsSync(bundledPython) ? bundledPython : 'python');
  const python = `from PIL import Image\nfrom pathlib import Path\nimport sys\np=Path(sys.argv[1])\nframes=[Image.open(f).convert('RGB') for f in sorted(p.glob('*.png'))]\nframes[0].save(sys.argv[2], save_all=True, append_images=frames[1:], duration=100, loop=0, optimize=True)`;
  await promisify(execFile)(pythonBin, ['-c', python, frames, path.join(artifacts, 'preview-recording.gif')]);
  console.log(`Recording preview: ${frame} frames saved to ${artifacts}`);
} finally { await context?.close(); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); }
