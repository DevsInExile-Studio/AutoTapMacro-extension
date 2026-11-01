import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankMacro, blankScript, sanitizeMacro, sanitizeStep, sanitizeScript, parseImport, validatePattern, matchesUrl, originOf, wrapUserCode, permissionPattern, parseUserScript, exportUserScript, scriptMatches, validateValues, assertAttachments } from '../chrome/core.js';

test('mouse buttons, coordinates and wheel observations survive validation and backup import', () => {
  const steps = [0, 1, 2, 3, 4].map(button => ({ type: 'click', selector: '#target', button, clickCount: 2, pointX: .2, pointY: .8, shiftKey: true }));
  steps.push({ type: 'wheel', selector: '#target', deltaX: -80, deltaY: 120, deltaMode: 0, scrolls: [{ selector: '#rtl', x: -300, y: 40 }, { selector: '', x: 0, y: 230 }] });
  const macro = sanitizeMacro({ ...blankMacro(), steps });
  assert.deepEqual(macro.steps.slice(0, 5).map(s => s.button), [0, 1, 2, 3, 4]);
  assert.equal(macro.steps[2].pointY, .8); assert.equal(macro.steps[2].shiftKey, true);
  assert.equal(macro.steps.at(-1).scrolls[0].x, -300);
  const backup = parseImport(JSON.stringify({ format: 'autotap-browser', version: 2, macros: [macro], scripts: [] }));
  assert.deepEqual(backup.macros[0].steps, macro.steps);
  assert.equal(sanitizeStep({ type: 'click', selector: '#legacy' }).button, 0);
  assert.equal(sanitizeStep({ type: 'wheel', selector: '#canvas' }).scrolls, undefined);
  assert.deepEqual(sanitizeStep({ type: 'wheel', selector: '#canvas', scrolls: [] }).scrolls, []);
  assert.throws(() => sanitizeStep({ type: 'click', selector: '#target', button: 99 }), /Mouse button/);
  assert.throws(() => sanitizeStep({ type: 'wheel', selector: '#target', deltaMode: 8 }), /delta mode/);
  assert.throws(() => sanitizeStep({ type: 'wheel', selector: '#target', scrolls: new Array(9).fill({}) }), /8 scroll/);
});

test('pointer event packing preserves order, timing, button masks and modifier flags', () => {
  const raw = { type: 'pointer', targets: ['#source', '#destination'], events: [
    { kind: 'down', target: 0, x: .125, y: .25, t: 0, button: 2, buttons: 2, ctrlKey: true },
    { kind: 'move', target: 1, x: .375, y: .5, t: 150, buttons: 2, ctrlKey: true },
    { kind: 'up', target: 1, x: .375, y: .5, t: 200, button: 2 }
  ] };
  const step = sanitizeStep(raw);
  assert.deepEqual(step.events, [[0, 0, 12500, 25000, 0, 2, 2, 2], [1, 1, 37500, 50000, 150, 0, 2, 2], [2, 1, 37500, 50000, 200, 2]]);
  assert.deepEqual(sanitizeStep(step), step);
  assert.throws(() => sanitizeStep({ ...raw, events: new Array(129).fill(raw.events[0]) }), /128 events/);
  assert.throws(() => sanitizeStep({ ...raw, events: [{ ...raw.events[0], target: 5 }] }), /target index/);
  assert.throws(() => sanitizeStep({ ...raw, events: [[99, 0, 0, 0, 0]] }), /Unsupported pointer/);
});

test('macro validation keeps data bounded and rejects unsupported actions', () => {
  const macro = sanitizeMacro({ ...blankMacro(), cycles: 999999, speed: -20, steps: [{ type: 'click', selector: '#save', delay: -1 }] });
  assert.equal(macro.cycles, 9999); assert.equal(macro.speed, .25); assert.equal(macro.steps[0].delay, 0);
  assert.throws(() => sanitizeMacro({ ...macro, steps: [{ type: 'shell' }] }), /Unsupported/);
  assert.throws(() => sanitizeMacro({ ...macro, steps: [{ type: 'click', selector: '' }] }), /selector/);
  assert.throws(() => sanitizeMacro({ ...macro, steps: new Array(5001).fill(macro.steps[0]) }), /5000/);
});
test('metadata import and export preserve grants and exclusions without enabling scripts', () => {
  const script = parseUserScript(`// ==UserScript==\n// @name Reading helper\n// @namespace test.helpers\n// @version 2.1\n// @description A helper\n// @match https://example.com/*\n// @exclude-match https://example.com/private/*\n// @exclude https://example.com/*preview*\n// @grant GM.getValue\n// @grant GM_addStyle\n// @run-at document-end\n// ==/UserScript==\nGM_addStyle('body{color:green}');`);
  assert.equal(script.name, 'Reading helper'); assert.equal(script.namespace, 'test.helpers'); assert.equal(script.scriptVersion, '2.1'); assert.equal(script.runAt, 'document_end'); assert.equal(script.enabled, false);
  assert.deepEqual(script.grants, ['GM_getValue', 'GM_addStyle']);
  assert.equal(scriptMatches(script, 'https://example.com/read'), true);
  assert.equal(scriptMatches(script, 'https://example.com/private/read'), false);
  assert.equal(scriptMatches(script, 'https://example.com/read?preview=1'), false);
  const roundTrip = parseUserScript(exportUserScript(script)); assert.deepEqual(roundTrip.grants, script.grants); assert.deepEqual(roundTrip.excludeMatches, script.excludeMatches); assert.equal((exportUserScript(roundTrip).match(/==UserScript==/g) || []).length, 1);
  assert.throws(() => parseUserScript('// ==UserScript==\n// @grant unsafeWindow\n// ==/UserScript==\n'), /Unsupported/);
  assert.throws(() => assertAttachments(parseUserScript('// ==UserScript==\n// @require https://remote.test/lib.js\n// ==/UserScript==\n')), /Attach local/);
  assert.throws(() => sanitizeScript({ ...script, world: 'MAIN' }), /isolated/);
});
test('v2 backups preserve script values under fresh IDs and enforce quotas', () => {
  const script = { ...blankScript(), enabled: true, grants: ['GM_getValue'] };
  const imported = parseImport(JSON.stringify({ format: 'autotap-browser', version: 2, macros: [], scripts: [script], values: { [script.id]: { count: 42, nested: [1, true, null] } } }));
  assert.equal(imported.scripts[0].enabled, false); assert.deepEqual(imported.values[imported.scripts[0].id], { count: 42, nested: [1, true, null] });
  assert.throws(() => validateValues({ large: 'x'.repeat(131073) }), /128 KB/);
  assert.throws(() => validateValues([]), /JSON object/);
});
test('advanced macro steps validate checks and preserve reliability settings', () => {
  const macro = sanitizeMacro({ ...blankMacro(), retries: 100, elementTimeout: 5, onError: 'skip', favorite: true, tags: ['work', 'work'], steps: [{ type: 'waitFor', selector: '#ready', condition: 'hidden', timeout: 500 }, { type: 'assertText', selector: '#result', value: 'Done', enabled: false }, { type: 'checked', selector: '#check', checked: false }] });
  assert.equal(macro.retries, 3); assert.equal(macro.elementTimeout, 100); assert.equal(macro.onError, 'skip'); assert.equal(macro.favorite, true); assert.deepEqual(macro.tags, ['work']); assert.equal(macro.steps[0].condition, 'hidden'); assert.equal(macro.steps[1].enabled, false); assert.equal(macro.steps[2].checked, false);
  assert.throws(() => sanitizeMacro({ ...macro, steps: [{ type: 'assertText', selector: '#result', value: '' }] }), /expected text/);
});
test('imports are atomic, regenerate identifiers and disable scripts', () => {
  const macro = blankMacro('Shopping'); const script = { ...blankScript(), enabled: true, matches: ['https://example.com/*'] };
  const parsed = parseImport(JSON.stringify({ format: 'autotap-browser', version: 1, macros: [macro], scripts: [script] }));
  assert.notEqual(parsed.macros[0].id, macro.id); assert.notEqual(parsed.scripts[0].id, script.id); assert.equal(parsed.scripts[0].enabled, false);
  assert.throws(() => parseImport('{broken'), /valid JSON/);
  assert.throws(() => parseImport(JSON.stringify({ format: 'autotap-browser', version: 1, macros: [macro, { steps: [{ type: 'bad' }] }], scripts: [] })), /Unsupported/);
  assert.throws(() => parseImport(JSON.stringify({ format: 'android', version: 1, macros: [], scripts: [] })), /browser backup/);
});
test('patterns match scheme, host boundaries, paths and queries', () => {
  assert.equal(matchesUrl('https://*.example.com/app/*', 'https://example.com/app/a?b=1'), true);
  assert.equal(matchesUrl('https://*.example.com/*', 'https://sub.example.com/x'), true);
  assert.equal(matchesUrl('https://*.example.com/*', 'https://badexample.com/x'), false);
  assert.equal(matchesUrl('https://example.com/*', 'http://example.com/x'), false);
  assert.equal(matchesUrl('*://example.com/*', 'https://example.com/x'), true);
  assert.equal(matchesUrl('https://example.com/path?x=*', 'https://example.com/path?x=1'), true);
  assert.equal(permissionPattern('https://example.com/app/*'), 'https://example.com/*');
  assert.equal(permissionPattern('HTTPS://EXAMPLE.COM/app/*'), 'https://example.com/*');
  assert.equal(matchesUrl('HTTPS://EXAMPLE.COM/*', 'https://example.com/x'), true);
  assert.equal(matchesUrl('https://*/*', 'https://example.com/x'), true);
  for (const pattern of ['<all_urls>', 'javascript://x/*', 'https://example.com']) assert.throws(() => validatePattern(pattern));
  assert.equal(originOf('chrome://settings'), ''); assert.equal(originOf('https://example.com/a'), 'https://example.com');
});
test('user scripts preserve user code and report thrown errors', async () => {
  const script = sanitizeScript({ ...blankScript(), world: 'bad', runAt: 'bad', matches: ['https://example.com/*'] });
  assert.equal(script.world, 'USER_SCRIPT'); assert.equal(script.runAt, 'document_idle');
  assert.throws(() => sanitizeScript({ ...script, code: 'x'.repeat(200001) }), /200 KB/);
  // Only the test process evaluates text; extension code exclusively uses chrome.userScripts.
  assert.deepEqual(await (0, eval)(wrapUserCode('await Promise.resolve();')), { ok: true });
  assert.deepEqual(await (0, eval)(wrapUserCode('throw new Error("test failure")')), { ok: false, error: 'test failure' });
});
