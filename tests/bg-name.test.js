const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const mem = {};
const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const local = {
  async get(keys) {
    const out = {};
    if (keys == null) { for (const [k,v] of Object.entries(mem)) out[k]=clone(v); return out; }
    for (const k of (Array.isArray(keys)?keys:[keys])) if (k in mem) out[k]=clone(mem[k]);
    return out;
  },
  async set(values) { for (const [k,v] of Object.entries(values)) mem[k]=clone(v); },
  async remove(keys) { for (const k of (Array.isArray(keys)?keys:[keys])) delete mem[k]; },
  async getBytesInUse() { return 100; }
};
const events = {};
global.chrome = {
  storage: { local },
  runtime: {
    onInstalled: { addListener: (fn) => { events.installed = fn; } },
    onStartup: { addListener: (fn) => { events.startup = fn; } },
    onMessage: { addListener: (fn) => { events.message = fn; } },
    openOptionsPage: () => {}, lastError: undefined
  },
  action: { onClicked: { addListener: () => {} }, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
  commands: { onCommand: { addListener: () => {} } },
  tabs: { query: async () => [], sendMessage: async () => ({}) },
  scripting: { executeScript: async () => [] },
  downloads: { download: (_o, cb) => cb && cb(1) },
  contextMenus: { removeAll: (cb) => cb && cb(), create: (_i, cb) => cb && cb(), onClicked: { addListener: () => {} } }
};
global.importScripts = (...files) => {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
};
vm.runInThisContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), { filename: 'background.js' });

const send = (msg) => new Promise((resolve) => events.message(msg, {}, resolve));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(80);

  const rawTitle = 'Aula de Python | Alura > Cursos';
  await send({
    action: 'storeTranscript', title: 'Aula manual', transcript: 'conteudo',
    formattedText: '[Titulo] Aula manual\n\n[Texto] conteudo',
    courseName: rawTitle, sourceType: 'selection',
    sourceUrl: 'https://example.com/x', pageTitle: rawTitle
  });

  let courses = Object.values((await AluraStore.get(['courses'])).courses || {});
  assert.strictEqual(courses.length, 1);
  assert.strictEqual(courses[0].name, rawTitle);
  assert.strictEqual(courses[0].lessons[0].sourceType, 'selection');
  console.log('✓ curso manual preserva título da página com | e >');

  await send({
    action: 'storeTranscript', title: 'Aula Alura', transcript: 'alura',
    formattedText: '[Titulo] Aula Alura\n\n[Texto] alura',
    courseName: 'Python | Alura > Cursos', sourceType: 'alura'
  });
  courses = Object.values((await AluraStore.get(['courses'])).courses || {});
  const aluraCourse = courses.find((c) => c.lessons.some((l) => l.title === 'Aula Alura'));
  assert.ok(!/[|>]/.test(aluraCourse.name));
  console.log('✓ curso automático continua normalizado');

  await send({
    action: 'storeQuestion',
    question: {
      id: 'manual_1', question: 'Pergunta?', lesson: 'Aula manual',
      courseName: rawTitle, options: [{ label: 'A', text: 'x', correct: true }],
      correctLabel: 'A', sourceType: 'selection', sourceUrl: 'https://example.com/x'
    }
  });
  const stored = ((await AluraStore.get(['savedQuestions'])).savedQuestions || []).find((q) => q.id === 'manual_1');
  const manualCourse = courses.find((c) => c.name === rawTitle);
  assert.strictEqual(stored.courseName, rawTitle);
  assert.strictEqual(stored.courseId, manualCourse.id);
  console.log('✓ questão manual usa o mesmo curso do título da página');

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
