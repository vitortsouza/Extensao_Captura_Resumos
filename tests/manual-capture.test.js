const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM('<!doctype html><html><head><title>Página de Teste</title></head><body><p>texto</p></body></html>', {
  url: 'https://example.com/artigo', runScripts: 'outside-only', pretendToBeVisual: true
});
const w = dom.window;

let messageListener = null;
let lastMessage = null;
const storageData = { courses: { c1: { id: 'c1', name: 'Curso Existente', lessons: [] } } };

w.chrome = {
  runtime: {
    lastError: undefined,
    onMessage: { addListener: (fn) => { messageListener = fn; } },
    sendMessage: (msg, cb) => { lastMessage = msg; setTimeout(() => cb({ success: true, totalCount: 1 }), 0); }
  },
  storage: {
    local: {
      get: async (keys) => {
        if (keys == null) return { ...storageData };
        const out = {};
        for (const k of (Array.isArray(keys) ? keys : [keys])) if (k in storageData) out[k] = storageData[k];
        return out;
      },
      set: async () => {}, remove: async () => {}
    }
  }
};

for (const file of ['lz-string.min.js', 'storage-utils.js', 'manual-capture.js']) {
  w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
}

function open(mode, text) {
  messageListener({ action: 'openManualPanel', mode, text }, {}, () => {});
  return sleep(120);
}
function hostEl() { return w.document.getElementById('alura-pro-manual-capture-host'); }
function panel() {
  const host = hostEl();
  assert.ok(host, 'host do painel existe');
  assert.ok(host.shadowRoot, 'shadow root existe');
  return host.shadowRoot;
}
const q = (el, name) => el.querySelector(`[data-el="${name}"]`);

(async () => {
  await open('transcript', 'Texto selecionado na página.');
  let s = panel();
  assert.strictEqual(q(s, 'course').value, 'Página de Teste');
  assert.ok(q(s, 'title').value.startsWith('Página de Teste — '));
  assert.ok(q(s, 'questionFields').hidden);

  lastMessage = null;
  q(s, 'save').click();
  await sleep(50);
  assert.strictEqual(lastMessage.action, 'storeTranscript');
  assert.strictEqual(lastMessage.courseName, 'Página de Teste');
  assert.strictEqual(lastMessage.sourceType, 'selection');
  assert.ok(q(s, 'status').textContent.includes('Captura salva'));
  console.log('✓ seleção salva como transcrição com curso pelo título da página');

  await open('question', 'Qual é a capital?');
  s = panel();
  assert.ok(!q(s, 'questionFields').hidden);
  q(s, 'text').value = 'Qual é a capital do Brasil?';
  q(s, 'options').value = 'A) Rio de Janeiro\nB) Brasília *\nC) São Paulo\nD) Salvador';
  lastMessage = null;
  q(s, 'save').click();
  await sleep(50);
  const question = lastMessage.question;
  assert.strictEqual(Array.from(question.options).length, 4);
  assert.deepStrictEqual(Array.from(question.options).map((o) => o.label), ['A', 'B', 'C', 'D']);
  assert.strictEqual(question.correctLabel, 'B');
  assert.strictEqual(question.correctText, 'Brasília');
  console.log('✓ questão com alternativas rotuladas');

  await open('question', 'Sem rótulos');
  s = panel();
  q(s, 'text').value = 'Qual opção de filtragem de profanidade ele deve usar?';
  q(s, 'options').value = 'Masking\nNormalization\nRemoving\nTagging *';
  lastMessage = null;
  q(s, 'save').click();
  await sleep(50);
  assert.deepStrictEqual(Array.from(lastMessage.question.options).map((o) => o.text), ['Masking', 'Normalization', 'Removing', 'Tagging']);
  assert.deepStrictEqual(Array.from(lastMessage.question.options).map((o) => o.label), ['A', 'B', 'C', 'D']);
  assert.strictEqual(lastMessage.question.correctLabel, 'D');
  console.log('✓ linhas sem rótulo viram A, B, C, D e a marcada é a correta');

  await open('question', 'Rótulos variados');
  s = panel();
  q(s, 'text').value = 'Escolha.';
  q(s, 'options').value = '1) Um\n2) Dois\n(III) Três *\n[IV] Quatro';
  lastMessage = null;
  q(s, 'save').click();
  await sleep(50);
  assert.deepStrictEqual(Array.from(lastMessage.question.options).map((o) => o.text), ['Um', 'Dois', 'Três', 'Quatro']);
  assert.deepStrictEqual(Array.from(lastMessage.question.options).map((o) => o.label), ['A', 'B', 'C', 'D']);
  assert.strictEqual(lastMessage.question.correctLabel, 'C');
  console.log('✓ rótulos 1), (III) e [IV] são remapeados');

  await open('question', 'Letra inválida');
  s = panel();
  q(s, 'text').value = 'Pergunta';
  q(s, 'options').value = 'A) Um\nB) Dois';
  q(s, 'correct').value = 'Z';
  lastMessage = null;
  q(s, 'save').click();
  await sleep(50);
  assert.strictEqual(lastMessage, null);
  assert.ok(q(s, 'status').textContent.includes('não corresponde'));
  console.log('✓ letra inválida é bloqueada');

  await open('transcript', 'Texto inicial.');
  s = panel();
  lastMessage = null;
  q(s, 'ocr').click();
  await sleep(30);
  assert.strictEqual(hostEl().style.display, 'none');
  assert.strictEqual(lastMessage.action, 'startOcrRegion');

  messageListener({ action: 'ocrPending' }, {}, () => {});
  await sleep(10);
  assert.notStrictEqual(hostEl().style.display, 'none');
  assert.ok(q(panel(), 'status').textContent.includes('Lendo'));

  messageListener({ action: 'ocrResult', text: 'Tagging', model: 'models/teste' }, {}, () => {});
  await sleep(10);
  s = panel();
  assert.ok(q(s, 'text').value.startsWith('Texto inicial.'));
  assert.ok(q(s, 'text').value.includes('Tagging'));
  assert.ok(q(s, 'status').textContent.includes('OCR concluído'));

  messageListener({ action: 'ocrResult', error: 'Cota excedida.' }, {}, () => {});
  await sleep(10);
  assert.ok(q(panel(), 'status').textContent.includes('Cota excedida'));

  messageListener({ action: 'ocrCancelled' }, {}, () => {});
  await sleep(10);
  assert.ok(q(panel(), 'status').textContent.includes('cancelado'));
  console.log('✓ OCR da região preenche o texto e reporta erros');

  await open('question', '');
  s = panel();
  messageListener(
    { action: 'ocrResult', text: 'Qual a melhor opção?\nA) Uma\nB) Duas *\nC) Três' },
    {},
    () => {}
  );
  await sleep(10);
  s = panel();
  assert.strictEqual(q(s, 'text').value, 'Qual a melhor opção?');
  assert.ok(q(s, 'options').value.includes('A) Uma'));
  assert.ok(q(s, 'options').value.includes('B) Duas *'));
  assert.ok(q(s, 'status').textContent.includes('alternativas separadas'));
  console.log('✓ OCR em questão separa enunciado e alternativas');

  await open('question', 'Enunciado junto.\n1) Um\n2) Dois *\n3) Três');
  s = panel();
  assert.ok(q(s, 'split'));
  assert.ok(!q(s, 'split').hidden);
  q(s, 'split').click();
  await sleep(10);
  assert.strictEqual(q(s, 'text').value, 'Enunciado junto.');
  assert.ok(q(s, 'options').value.startsWith('1) Um'));
  console.log('✓ botão separar alternativas move o bloco rotulado');

  await open('transcript', 'x');
  s = panel();
  w.FileReader = class {
    readAsDataURL() {
      setTimeout(() => {
        this.result = 'data:image/png;base64,AAAA';
        if (this.onload) this.onload();
      }, 0);
    }
  };
  w.Image = class {
    set src(_value) {
      setTimeout(() => this.onerror && this.onerror(), 0);
    }
  };

  lastMessage = null;
  const pasteEvent = new w.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: {
      items: [{ type: 'image/png', getAsFile: () => new w.File(['x'], 'print.png', { type: 'image/png' }) }]
    }
  });
  q(s, 'text').dispatchEvent(pasteEvent);
  await sleep(50);
  assert.strictEqual(lastMessage.action, 'ocrImage');
  assert.ok(lastMessage.dataUrl.startsWith('data:image/png;base64,'));
  assert.strictEqual(hostEl().style.display, 'none');
  console.log('✓ imagem colada no painel é enviada para OCR');

  await open('transcript', 'x');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(20);
  assert.strictEqual(hostEl(), null);
  console.log('✓ Esc fecha o painel');

  w.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
