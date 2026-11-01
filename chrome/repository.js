// Individual records keep an active recording from rewriting unrelated macros or scripts.
// The first write migrates 1.0 arrays atomically; read-only access also supports old data.
export function createRepository(storage) {
  let cache, modern = false, epoch = 0;
  async function read() {
    if (!cache) {
      const revision = epoch;
      const base = await storage.get(['libraryV2', 'macros', 'scripts']);
      const isModern = base.libraryV2 === true;
      let data;
      if (isModern) {
        const ids = { macros: base.macros || [], scripts: base.scripts || [] };
        const records = await storage.get([...ids.macros.map(id => `macro:${id}`), ...ids.scripts.map(id => `script:${id}`)]);
        data = { macros: ids.macros.map(id => records[`macro:${id}`]).filter(Boolean), scripts: ids.scripts.map(id => records[`script:${id}`]).filter(Boolean) };
      } else data = { macros: base.macros || [], scripts: base.scripts || [] };
      if (revision !== epoch) return read();
      modern = isModern; cache = data;
    }
    return { macros: [...cache.macros], scripts: [...cache.scripts] };
  }
  async function write(change) {
    await read();
    const next = { macros: change.macros || cache.macros, scripts: change.scripts || cache.scripts };
    const update = Object.fromEntries(Object.entries(change).filter(([key]) => !['macros', 'scripts'].includes(key)));
    const removed = [];
    for (const [kind, prefix] of [['macros', 'macro'], ['scripts', 'script']]) {
      const before = new Map(cache[kind].map(item => [item.id, item]));
      const ids = next[kind].map(item => item.id);
      if (!modern || JSON.stringify(ids) !== JSON.stringify(cache[kind].map(item => item.id))) update[kind] = ids;
      for (const item of next[kind]) if (!modern || before.get(item.id) !== item) update[`${prefix}:${item.id}`] = item;
      const remaining = new Set(ids);
      for (const id of before.keys()) if (!remaining.has(id)) removed.push(`${prefix}:${id}`);
    }
    if (!modern) update.libraryV2 = true;
    // If quota/write fails, the previous complete library remains available.
    await storage.set(update);
    epoch++; cache = next; modern = true;
    if (removed.length) await storage.remove(removed);
  }
  function changed(changes) {
    if (!Object.keys(changes).some(key => ['macros', 'scripts', 'libraryV2'].includes(key) || /^(macro|script):/.test(key))) return;
    epoch++;
    if (!cache) return;
    const isModern = changes.libraryV2 ? changes.libraryV2.newValue === true : modern;
    const next = {};
    for (const [kind, prefix] of [['macros', 'macro'], ['scripts', 'script']]) {
      if (!isModern) { next[kind] = changes[kind]?.newValue || cache[kind]; continue; }
      const before = new Map(cache[kind].map(item => [item.id, item]));
      const ids = changes[kind]?.newValue || cache[kind].map(item => item.id);
      next[kind] = ids.map(id => changes[`${prefix}:${id}`]?.newValue || before.get(id)).filter(Boolean);
    }
    cache = next; modern = isModern;
  }
  return { read, write, changed };
}
