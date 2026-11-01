import test from 'node:test';
import assert from 'node:assert/strict';
import { pageAvailability } from '../chrome/page-target.js';

test('recording is available on websites, including names resembling protected domains', () => {
  for (const url of ['https://example.com/path', 'http://localhost:8080/', 'https://chrome.google.com/other', 'https://chromewebstore.google.com.example.org/']) {
    assert.equal(pageAvailability({ url }).supported, true, url);
  }
});

test('protected tabs and missing activeTab access explain how to enable recording', () => {
  for (const url of ['chrome://extensions/', 'chrome-extension://abc/workspace.html', 'https://chromewebstore.google.com/detail/example', 'https://chrome.google.com/webstore/detail/example', 'file:///C:/example.html', 'about:blank', undefined]) {
    const state = pageAvailability({ url });
    assert.equal(state.supported, false, url);
    assert.match(state.reason, /website/);
  }
  assert.equal(pageAvailability({ url: 'chrome-extension://abc/popup.html' }).label, 'Extension page');
  assert.equal(pageAvailability({}).status, 'Unavailable');
  const store = pageAvailability({ url: 'https://chromewebstore.google.com/?hl=uk' });
  assert.equal(store.supported, false);
  assert.match(store.reason, /This is the Chrome Web Store/);
});
