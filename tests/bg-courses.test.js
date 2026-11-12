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

async function storeTranscript(courseName, title) {
  await send({
    action: 'storeTranscript',
    title,
    transcript: `texto ${title}`,
    formattedText: `[Titulo] ${title}\n\n[Texto] texto ${title}`,
    courseName,
    sourceType: 'selection'
  });
}

async function storeQuestion(courseName, id) {
  await send({
    action: 'storeQuestion',
    question: {
      id,
      question: `Pergunta ${id}`,
      lesson: 'Aula',
      courseName,
      options: [{ label: 'A', text: 'x', correct: true }],
      correctLabel: 'A',
      sourceType: 'selection'
    }
  });
}

(async () => {
  await sleep(80);

  // normalização aplicada já na captura
  await storeTranscript('Course: 1Z0-1122-26: OCI AI Foundations 2026 Associate [FREE] | Udemy', 'Aula Udemy');
  await storeTranscript('Practice-Exam-1122-26-OCI-AI-Foundations-Associate/README.md at main · vitortsouza/Practice-Exam-1122-26-OCI-AI-Foundations-Associate', 'Aula GitHub');

  let courses = Object.values((await AluraStore.get(['courses'])).courses || {});
  const udemy = courses.find((c) => c.lessons.some((l) => l.title === 'Aula Udemy'));
  const github = courses.find((c) => c.lessons.some((l) => l.title === 'Aula GitHub'));
  assert.strictEqual(udemy.name, '1Z0-1122-26: OCI AI Foundations 2026 Associate [FREE]');
  assert.strictEqual(github.name, 'Practice-Exam-1122-26-OCI-AI-Foundations-Associate');
  console.log('✓ nomes de curso normalizados na captura (Course: e GitHub)');

  // mesmo título em cursos diferentes deve ser salvo nos dois
  await storeTranscript('Curso X', 'Aula Compartilhada');
  await storeTranscript('Curso Y', 'Aula Compartilhada');

  courses = Object.values((await AluraStore.get(['courses'])).courses || {});
  const cursoX = courses.find((c) => c.name === 'Curso X');
  const cursoY = courses.find((c) => c.name === 'Curso Y');
  assert.ok(cursoX && cursoX.lessons.some((l) => l.title === 'Aula Compartilhada'), 'aula salva no curso X');
  assert.ok(cursoY && cursoY.lessons.some((l) => l.title === 'Aula Compartilhada'), 'aula salva no curso Y');
  console.log('✓ mesmo título em cursos diferentes não é bloqueado');

  // duplicata dentro do mesmo curso continua bloqueada
  const duplicate = await send({
    action: 'storeTranscript',
    title: 'Aula Compartilhada',
    transcript: 'texto repetido',
    formattedText: '[Titulo] Aula Compartilhada\n\n[Texto] texto repetido',
    courseName: 'Curso X',
    sourceType: 'selection'
  });
  assert.strictEqual(duplicate.isDuplicate, true, 'duplicata no mesmo curso é bloqueada');
  console.log('✓ duplicata no mesmo curso continua bloqueada');

  // normalizeCourses une duplicados antigos
  await AluraStore.set({
    courses: {
      old1: { id: 'old1', name: 'Course: Curso Antigo | Udemy', lessons: [{ title: 'L1', transcript: 'a' }] },
      old2: { id: 'old2', name: 'Curso Antigo', lessons: [{ title: 'L2', transcript: 'b' }] },
      old3: { id: 'old3', name: 'Repo/README.md at main · user/Repo', lessons: [] }
    },
    savedQuestions: [
      { id: 'q1', question: 'Q1', courseId: 'old1', courseName: 'Course: Curso Antigo | Udemy' },
      { id: 'q2', question: 'Q2', courseId: 'old2', courseName: 'Curso Antigo' },
      { id: 'q3', question: 'Q3', courseId: 'old3', courseName: 'Repo/README.md at main · user/Repo' }
    ],
    aiSummaries: [
      { id: 's1', content: 'resumo', courseId: 'old1', courseName: 'Course: Curso Antigo | Udemy' }
    ]
  });

  const normalized = await send({ action: 'normalizeCourses' });
  assert.strictEqual(normalized.success, true);

  const after = await AluraStore.get(['courses', 'savedQuestions', 'aiSummaries']);
  const names = Object.values(after.courses).map((c) => c.name);
  assert.ok(!names.some((n) => /Course:|README\.md|\| Udemy/.test(n)), 'nomes normalizados');
  assert.strictEqual(Object.keys(after.courses).length, 2, 'duplicados unidos');
  assert.ok(after.courses[after.savedQuestions[0].courseId], 'questão aponta para curso existente');
  assert.ok(after.courses[after.savedQuestions[1].courseId], 'segunda questão aponta para curso existente');
  assert.ok(after.courses[after.aiSummaries[0].courseId], 'resumo aponta para curso existente');
  assert.strictEqual(after.savedQuestions[0].courseId, after.savedQuestions[1].courseId, 'questões do curso unificado');
  console.log('✓ normalizeCourses normaliza nomes e une cursos duplicados');

  // renameCourse com colisão une os cursos
  await storeTranscript('Curso Alfa', 'Aula Alfa');
  await storeTranscript('Curso Beta', 'Aula Beta');
  courses = (await AluraStore.get(['courses'])).courses;
  const alfa = Object.values(courses).find((c) => c.name === 'Curso Alfa');
  const beta = Object.values(courses).find((c) => c.name === 'Curso Beta');

  const renamed = await send({ action: 'renameCourse', courseId: alfa.id, newName: 'Curso Beta' });
  assert.strictEqual(renamed.success, true);
  assert.strictEqual(renamed.courseId, beta.id, 'renomear para nome existente reaproveita o curso');

  courses = (await AluraStore.get(['courses'])).courses;
  assert.ok(!courses[alfa.id], 'curso de origem removido');
  assert.ok(courses[beta.id].lessons.some((l) => l.title === 'Aula Alfa'), 'aulas movidas');
  console.log('✓ renameCourse com nome existente une os cursos');

  // mergeCourses explícito
  await storeTranscript('Curso Gama', 'Aula Gama');
  await storeTranscript('Curso Delta', 'Aula Delta');
  await storeQuestion('Curso Gama', 'qg');
  courses = (await AluraStore.get(['courses'])).courses;
  const gama = Object.values(courses).find((c) => c.name === 'Curso Gama');
  const delta = Object.values(courses).find((c) => c.name === 'Curso Delta');

  const merged = await send({ action: 'mergeCourses', sourceId: gama.id, targetId: delta.id });
  assert.strictEqual(merged.success, true);

  const mergedStore = await AluraStore.get(['courses', 'savedQuestions']);
  assert.ok(!mergedStore.courses[gama.id], 'origem removida');
  assert.ok(mergedStore.courses[delta.id].lessons.some((l) => l.title === 'Aula Gama'), 'aula movida');
  const qg = mergedStore.savedQuestions.find((q) => q.id === 'qg');
  assert.strictEqual(qg.courseId, delta.id, 'questão movida');
  assert.strictEqual(qg.courseName, 'Curso Delta');
  console.log('✓ mergeCourses move aulas e questões');

  // clearAllContent apaga conteúdo e preserva preferências
  await AluraStore.set({
    apiKey: 'chave-mantida',
    subfolder: 'Notas',
    courses: { x: { id: 'x', name: 'Curso X', lessons: [] } },
    rawContent: 'texto',
    savedTitles: ['Aula X'],
    savedQuestions: [{ id: 'qx' }],
    aiSummaries: [{ id: 'sx' }],
    summaryCache: { hash: 'resumo' },
    captureCount: 9
  });

  const cleared = await send({ action: 'clearAllContent' });
  assert.strictEqual(cleared.success, true);

  const afterClear = await AluraStore.get(null);
  for (const key of ['courses', 'rawContent', 'savedTitles', 'savedQuestions', 'aiSummaries', 'summaryCache', 'captureCount']) {
    assert.strictEqual(afterClear[key], undefined, `${key} removido`);
  }
  assert.strictEqual(afterClear.apiKey, 'chave-mantida', 'chave preservada');
  assert.strictEqual(afterClear.subfolder, 'Notas', 'preferências preservadas');
  console.log('✓ clearAllContent apaga conteúdo e mantém preferências');

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
