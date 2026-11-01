import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
export async function playwright() {
  const taskBrowserCache = `${process.env.USERPROFILE || process.env.HOME}/.cache/autotap-browser-testing`;
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(`${taskBrowserCache}/chromium-1234`)) process.env.PLAYWRIGHT_BROWSERS_PATH = taskBrowserCache;
  try { return await import('playwright'); }
  catch {
    const path = `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
    try { return require(path); } catch { throw new Error('Install development dependencies first: npm install (inside extension).'); }
  }
}
