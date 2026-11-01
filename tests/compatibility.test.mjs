import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUserScript, sanitizeScript, blankScript, scriptMatches, candidatePatterns, connectionAllowed, scriptPermissions, toCSV, exportUserScript, assertAttachments } from '../chrome/core.js';
import { normalizeRequest, safeFilename, parseJSONResponse } from '../chrome/gm-extras-service.js';
import { urlRulesMatch } from '../chrome/userscript-extras.js';

test('all-host rules and include globs retain OR semantics and HTTP-only matching', () => {
  const script = parseUserScript('// ==UserScript==\n// @name Universal\n// @match https://specific.example/*\n// @include https://*.example.?om/report*\n// @exclude *://*/private/*\n// @grant GM.xmlHttpRequest\n// @connect api.example.com\n// ==/UserScript==\n');
  assert.equal(script.allFrames, true); assert.deepEqual(script.grants, ['GM_xmlhttpRequest']);
  assert.equal(parseUserScript('// ==UserScript==\n// @name:ru Не основное имя\n// @name English name\n// ==/UserScript==\n').name, 'English name');
  for (const [url, expected] of [['https://specific.example/anything', true], ['https://sub.example.com/report?a=1', true], ['https://sub.example.com/other', false], ['https://specific.example/private/x', false], ['file:///report', false]]) { assert.equal(scriptMatches(script, url), expected, url); assert.equal(urlRulesMatch(script, url), expected, url); }
  assert.ok(candidatePatterns(script).includes('*://*/*'));
  assert.deepEqual(parseUserScript('// ==UserScript==\n// @match <all_urls>\n// @noframes\n// ==/UserScript==\n').matches, ['*://*/*']);
  assert.equal(parseUserScript('// ==UserScript==\n// @noframes\n// ==/UserScript==\n').allFrames, false);
});
test('connect rules enforce domains, origins, userinfo and permission declarations', () => {
  const script = sanitizeScript({ ...blankScript(), grants: ['GM_xmlhttpRequest', 'GM_notification', 'GM_download', 'GM_setClipboard'], connect: ['self', 'api.example.com', '127.0.0.1:8080'] });
  assert.equal(connectionAllowed(script, 'https://origin.example/a', 'https://origin.example/page'), true);
  assert.equal(connectionAllowed(script, 'http://origin.example/a', 'https://origin.example/page'), false);
  assert.equal(connectionAllowed(script, 'https://sub.api.example.com/a', 'https://origin.example'), true);
  assert.equal(connectionAllowed(script, 'https://notapi.example.com/a', 'https://origin.example'), false);
  assert.equal(connectionAllowed(script, 'http://127.0.0.1:8080/x', 'https://origin.example'), true);
  assert.equal(connectionAllowed(script, 'http://127.0.0.1:8081/x', 'https://origin.example'), false);
  assert.equal(connectionAllowed(script, 'https://name:secret@api.example.com/', 'https://origin.example'), false);
  assert.deepEqual(scriptPermissions(script, 'https://origin.example').permissions, ['notifications', 'downloads', 'clipboardWrite']);
  assert.throws(() => sanitizeScript({ ...script, connect: ['https://api.example.com/'] }), /@connect/);
});
test('local dependency metadata round-trips while incomplete attachments cannot execute', () => {
  const script = parseUserScript('// ==UserScript==\n// @require https://example.com/helper.js\n// @resource theme https://example.com/theme.css\n// @grant GM_getResourceText\n// ==/UserScript==\n');
  assert.equal(script.requires[0].code, ''); assert.equal(script.resources[0].name, 'theme'); assert.throws(() => assertAttachments(script), /Attach local/);
  script.requires[0].code = 'var helper = 1;'; script.resources[0].data = Buffer.from('body{}').toString('base64'); assert.doesNotThrow(() => assertAttachments(script));
  const imported = parseUserScript(exportUserScript(script)); assert.equal(imported.resources[0].name, 'theme'); assert.equal(imported.requires[0].url, script.requires[0].url);
});
test('network and filename limits reject unsupported requests and path traversal', () => {
  assert.equal(normalizeRequest({ url: 'https://example.com', timeout: 999999 }).timeout, 30000);
  assert.equal(normalizeRequest({ url: 'https://example.com' }).anonymous, true);
  assert.throws(() => normalizeRequest({ url: 'x', method: 'CONNECT' }), /method/);
  assert.throws(() => normalizeRequest({ url: 'x', headers: { Cookie: 'secret' } }), /overridden/);
  assert.throws(() => normalizeRequest({ url: 'x', responseType: 'stream' }), /responseType/);
  assert.throws(() => normalizeRequest({ url: 'x', data: 'я'.repeat(600000) }), /1 MB/);
  assert.equal(parseJSONResponse(''), null); assert.equal(parseJSONResponse('<html>Error</html>'), null); assert.deepEqual(parseJSONResponse('{"ok":true}'), { ok: true });
  for (const name of ['../file', '/file', 'C:\\file', 'a/../b']) assert.throws(() => safeFilename(name), /relative/);
  assert.equal(safeFilename('reports/my:file.csv'), 'reports/my_file.csv');
});
test('CSV quotes strings and neutralizes formula prefixes including leading whitespace', () => {
  const csv = toCSV([{ title: 'a,"b"', value: ' =HYPERLINK("x")' }], ['title', 'value']);
  assert.equal(csv, '"title","value"\r\n"a,""b""","\' =HYPERLINK(""x"")"');
});
