const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const html = fs.readFileSync(path.join(root, 'options.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const data = {
  courses: {
    c1: { id: 'c1', name: 'Curso com aulas', lessons: [{ title: 'Aula 1', transcript: 'conteudo' }] }
  },
  savedQuestions: [
    {
      id: 'q1', question: 'Questão do Practice Exam', lesson: 'Aula 1',
      courseId: 'kpractice', courseName: 'Practice-Exam-1122-26-OCI-AI-Foundations-Associate',
      options: [{ label: 'A', text: 'x', correct: true }], correctLabel: 'A'
    },
    {
      id: 'q2', question: 'Questão do Udemy', lesson: 'Aula 2',
      courseId: 'kudemy', courseName: 'Course: 1Z0-1122-26: OCI AI Foundations 2026 Associate [FREE] | Udemy',
      options: [{ label: 'A', text: 'y', correct: true }], correctLabel: 'A'
    }
  ],
  aiSummaries: [],
  rawContent: '',
  subfolder: 'Transcricoes',
  filename: 'transcricoes_acumuladas.txt',
  antiDuplicate: true,
  autoCaptureOnNextVideo: false,
  questionAutoCapture: false,
  autoBackupEvery: 0,
  apiKey: '',
  availableModels: ['models/gemini-3.5-flash-lite'],
  modelName: 'models/gemini-3.5-flash-lite',
  promptCustom: 'resuma',
  __aluraLargeKeys: {}
};

const dom = new JSDOM(html, {
  url: 'https://example.com/options.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const w = dom.window;

w.chrome = {
  runtime: {
    lastError: undefined,
    sendMessage: (msg, cb) => setTimeout(() => cb({ success: true }), 0),
    openOptionsPage: () => {}
  },
  storage: {
    local: {
      get: async (keys) => {
        if (keys == null) return { ...data };
        const out = {};
        for (const k of (Array.isArray(keys) ? keys : [keys])) if (k in data) out[k] = data[k];
        return out;
      },
      set: async () => {},
      remove: async () => {},
      getBytesInUse: async () => 100
    }
  },
  downloads: { download: () => {} }
};

for (const file of ['lz-string.min.js', 'storage-utils.js', 'gemini-client.js', 'options.js']) {
  w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
}
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

(async () => {
  await sleep(200);

  const filter = w.document.getElementById('questionCourseFilter');
  const values = Array.from(filter.options).map((o) => o.value);
  assert.ok(values.includes('kpractice'), 'curso só com questão aparece no filtro');
  assert.ok(values.includes('kudemy'), 'segundo curso só com questão aparece no filtro');
  assert.ok(values.includes('c1'), 'curso com aulas continua no filtro');
  console.log('✓ filtro inclui cursos que existem apenas em questões');

  const list = w.document.getElementById('questionsList');
  filter.value = 'kpractice';
  filter.dispatchEvent(new w.Event('change'));
  await sleep(30);
  assert.ok(list.textContent.includes('Practice Exam'), 'mostra a questão do curso filtrado');
  assert.ok(!list.textContent.includes('Udemy'), 'esconde questões de outros cursos');
  console.log('✓ filtro por curso só de questões funciona');

  filter.value = 'kudemy';
  filter.dispatchEvent(new w.Event('change'));
  await sleep(30);
  assert.ok(list.textContent.includes('Udemy'));
  assert.ok(!list.textContent.includes('Practice Exam'));
  console.log('✓ troca de filtro entre cursos só de questões');

  filter.value = '';
  filter.dispatchEvent(new w.Event('change'));
  await sleep(30);
  assert.ok(list.textContent.includes('Practice Exam') && list.textContent.includes('Udemy'));
  console.log('✓ “Todos os cursos” volta a mostrar tudo');

  const panels = Array.from(w.document.querySelectorAll('[data-tab-panel]'));
  assert.strictEqual(panels.filter((panel) => !panel.hidden).length, 1, 'só uma aba visível');
  assert.strictEqual(panels.find((panel) => !panel.hidden).dataset.tabPanel, 'content');

  w.document.querySelector('[data-tab="settings"]').click();
  await sleep(20);
  assert.strictEqual(w.document.querySelector('[data-tab-panel="settings"]').hidden, false, 'aba Configurações visível');
  assert.strictEqual(w.document.querySelector('[data-tab-panel="content"]').hidden, true, 'aba Conteúdo oculta');
  assert.strictEqual(w.localStorage.getItem('options-active-tab'), 'settings', 'aba lembrada');
  console.log('✓ abas trocam e persistem a seleção');

  w.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
