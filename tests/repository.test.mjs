import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../chrome/repository.js';
function memory(initial = {}) {
  const data = structuredClone(initial), writes = []; let fail = false;
  return { data, writes, failNext: () => fail = true,
    get: async keys => Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, structuredClone(data[key])])),
    set: async change => { if (fail) { fail = false; throw new Error('Quota exceeded'); } writes.push(structuredClone(change)); Object.assign(data, structuredClone(change)); },
    remove: async keys => keys.forEach(key => delete data[key]) };
}
test('legacy arrays migrate atomically and survive a fresh service-worker instance', async () => {
  const storage = memory({ macros: [{ id: 'm1', name: 'Old macro', steps: [] }], scripts: [{ id: 's1', name: 'Old script', code: '1' }] });
  const repo = createRepository(storage); const library = await repo.read();
  assert.equal(library.macros[0].name, 'Old macro'); assert.equal(storage.writes.length, 0);
  await repo.write({ macros: [{ ...library.macros[0], name: 'New name' }] });
  assert.equal(storage.data.libraryV2, true); assert.deepEqual(storage.data.macros, ['m1']);
  const reloaded = await createRepository(storage).read(); assert.equal(reloaded.macros[0].name, 'New name'); assert.equal(reloaded.scripts[0].code, '1');
});
test('subsequent edits write exactly one record and preserve the other collection', async () => {
  const storage = memory({ macros: [{ id: 'm1', steps: [] }, { id: 'm2', steps: [] }], scripts: [{ id: 's1', code: 'unchanged' }] });
  const repo = createRepository(storage); await repo.write(await repo.read()); storage.writes.length = 0;
  const library = await repo.read(); await repo.write({ macros: [{ ...library.macros[0], steps: [{ type: 'wait', delay: 1 }] }, library.macros[1]] });
  assert.deepEqual(Object.keys(storage.writes[0]), ['macro:m1']); assert.equal(storage.writes.length, 1); assert.equal(storage.data['script:s1'].code, 'unchanged');
  await repo.write({ macros: [] }); assert.equal(storage.data['macro:m1'], undefined); assert.equal(storage.data['macro:m2'], undefined);
});
test('failed migration leaves the original data and readable cache intact', async () => {
  const original = { macros: [{ id: 'm1', name: 'Original', steps: [] }], scripts: [] }; const storage = memory(original); const repo = createRepository(storage);
  await repo.read(); storage.failNext(); await assert.rejects(repo.write({ macros: [{ id: 'm1', name: 'Changed', steps: [] }] }), /Quota/);
  assert.deepEqual(storage.data, original); assert.equal((await repo.read()).macros[0].name, 'Original');
});
