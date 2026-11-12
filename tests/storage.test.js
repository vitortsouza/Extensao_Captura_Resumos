// tests/storage.test.js - valida compressão/descompressão transparente do AluraStore.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

// Disponibiliza LZString no escopo global, como no service worker.
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "lz-string.min.js"), "utf8"));

const memory = new Map();
const local = {
  async get(keys) {
    const result = {};
    if (keys === null || keys === undefined) {
      for (const [key, value] of memory.entries()) result[key] = value;
      return result;
    }
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (memory.has(key)) result[key] = memory.get(key);
    }
    return result;
  },
  async set(values) {
    for (const [key, value] of Object.entries(values)) memory.set(key, value);
  },
  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) memory.delete(key);
  },
  async getBytesInUse() {
    return JSON.stringify([...memory.entries()]).length;
  }
};

global.chrome = { storage: { local } };
require(path.join(__dirname, "..", "storage-utils.js"));

(async () => {
  const big = "Conteúdo da aula de exemplo. ".repeat(8000); // ~200 KB
  const obj = { id: "c1", name: "Curso", lessons: [{ title: "Aula 1", transcript: big }] };

  await AluraStore.set({ big, obj, small: true, text: "ok" });

  const meta = await AluraStore.getMeta();
  assert.strictEqual(meta.big.compressed, true, "texto grande deveria ser comprimido");
  assert.strictEqual(meta.obj.compressed, true, "objeto grande deveria ser comprimido");
  assert.ok(memory.get("big").length < big.length, "valor comprimido deveria ser menor");

  const hydrated = await AluraStore.get(["big", "obj", "small", "text"]);
  assert.strictEqual(hydrated.big, big, "texto deve voltar idêntico");
  assert.deepStrictEqual(hydrated.obj, obj, "objeto deve voltar idêntico");
  assert.strictEqual(hydrated.small, true);
  assert.strictEqual(hydrated.text, "ok");

  await AluraStore.set({ big: "agora pequeno" });
  const after = await AluraStore.get(["big"]);
  assert.strictEqual(after.big, "agora pequeno");
  const metaAfter = await AluraStore.getMeta();
  assert.ok(!metaAfter.big, "metadados de compressão deveriam ser limpos");

  // Objeto grande substituído por booleano não pode sumir do storage.
  await AluraStore.set({ obj: false });
  const afterObj = await AluraStore.get(["obj"]);
  assert.strictEqual(afterObj.obj, false, "troca de objeto para booleano deve persistir");

  const all = await AluraStore.get(null);
  assert.strictEqual(all.big, "agora pequeno");
  assert.strictEqual(all.obj, false);

  await AluraStore.remove(["big"]);
  assert.strictEqual(memory.has("big"), false, "chave removida do storage");

  console.log("✓ storage.test.js: compressão e hidratação transparentes funcionando.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
