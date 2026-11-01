// Keep the popup's explanation and the recorder's target validation in sync.
export function pageAvailability(tab) {
  let url;
  try { url = new URL(tab?.url); } catch {}
  if (!url) return { supported: false, label: 'Page unavailable', status: 'Unavailable', reason: 'Switch to a website and reopen AutoTap so Chrome can share its address.' };
  if (['http:', 'https:'].includes(url.protocol)) {
    const webStore = url.hostname === 'chromewebstore.google.com' || (url.hostname === 'chrome.google.com' && /^\/webstore(?:\/|$)/.test(url.pathname));
    if (webStore) return { supported: false, label: 'Chrome Web Store', status: 'Protected', reason: 'This is the Chrome Web Store. Chrome prevents extensions from recording here. Open another website, then click AutoTap.' };
    return { supported: true, label: url.hostname, status: 'Ready', reason: 'Clicks, typing & scrolling. Saved as you go.' };
  }
  const label = url.protocol === 'chrome-extension:' ? 'Extension page' : url.protocol === 'file:' ? 'Local file' : 'Browser page';
  return { supported: false, label, status: 'Unavailable', reason: `${label === 'Local file' ? 'Recording supports http and https websites.' : 'Chrome blocks recording on this page.'} Switch to a website, then click AutoTap.` };
}
