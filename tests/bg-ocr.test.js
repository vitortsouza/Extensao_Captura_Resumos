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
const injected = [];
const messages = [];
const captures = [];
const geminiCalls = [];
const drawn = [];

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
  tabs: {
    query: async () => [],
    sendMessage: async (tabId, msg, opts) => { messages.push({ tabId, msg, opts }); return { ok: true }; },
    captureVisibleTab: async (windowId, opts) => { captures.push({ windowId, opts }); return 'data:image/jpeg;base64,AAAA'; }
  },
  scripting: { executeScript: async (opts) => { injected.push(opts); return [{ result: '' }]; } },
  downloads: { download: (_o, cb) => cb && cb(1) },
  contextMenus: { removeAll: (cb) => cb && cb(), create: (_i, cb) => cb && cb(), onClicked: { addListener: () => {} } }
};

global.fetch = async () => ({ blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) });
global.createImageBitmap = async () => ({ width: 1280, height: 720, close() {} });
global.OffscreenCanvas = class {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() { return { drawImage: (...args) => drawn.push(args) }; }
  async convertToBlob() { return new Blob([new Uint8Array([9, 8, 7])], { type: 'image/jpeg' }); }
};

global.importScripts = (...files) => {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
};
vm.runInThisContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), { filename: 'background.js' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(80);

  // sem chave: erro no painel, sem captura
  await events.message(
    { action: 'regionCapturedForOcr', rect: { left: 10, top: 20, width: 100, height: 50 }, dpr: 2 },
    { tab: { id: 7, windowId: 3 } },
    () => {}
  );
  await sleep(20);
  assert.strictEqual(captures.length, 0, 'sem chave não captura a tela');
  assert.ok(messages.some((m) => m.msg.action === 'ocrResult' && /chave/i.test(m.msg.error)), 'erro de chave enviado ao painel');
  console.log('✓ OCR sem chave avisa o painel');

  // com chave: captura, recorta e chama o Gemini
  mem.apiKey = 'chave-teste';
  mem.modelName = 'models/gemini-3.5-flash-lite';
  mem.ocrModelName = 'models/ocr-vision';
  messages.length = 0;
  captures.length = 0;
  drawn.length = 0;
  geminiCalls.length = 0;

  GeminiClient.describeImage = async (opts) => {
    geminiCalls.push(opts);
    return { success: true, text: 'Tagging', model: 'models/teste' };
  };

  await events.message(
    { action: 'regionCapturedForOcr', rect: { left: 10, top: 20, width: 100, height: 50 }, dpr: 2 },
    { tab: { id: 7, windowId: 3 } },
    () => {}
  );
  await sleep(20);

  assert.strictEqual(captures.length, 1);
  assert.strictEqual(captures[0].windowId, 3);
  assert.deepStrictEqual(captures[0].opts, { format: 'jpeg', quality: 85 });
  assert.strictEqual(drawn.length, 1, 'recorte desenhado no canvas');
  assert.deepStrictEqual(drawn[0].slice(1), [20, 40, 200, 100, 0, 0, 200, 100], 'recorte usa o dpr');
  assert.strictEqual(geminiCalls.length, 1);
  assert.strictEqual(geminiCalls[0].model, 'models/ocr-vision', 'OCR usa o modelo de OCR configurado');
  assert.ok(/Transcreva/.test(geminiCalls[0].prompt));
  assert.ok(geminiCalls[0].dataUrl.startsWith('data:image/jpeg;base64,'));
  assert.ok(messages.some((m) => m.msg.action === 'ocrPending'), 'painel avisado do processamento');
  const result = messages.find((m) => m.msg.action === 'ocrResult');
  assert.strictEqual(result.msg.text, 'Tagging');
  assert.strictEqual(result.msg.model, 'models/teste');
  assert.deepStrictEqual(result.opts, { frameId: 0 });
  console.log('✓ OCR captura a região, recorta pelo dpr e devolve o texto ao painel');

  // imagem colada usa o mesmo modelo de OCR
  messages.length = 0;
  geminiCalls.length = 0;
  await events.message(
    { action: 'ocrImage', dataUrl: 'data:image/png;base64,AAAA' },
    { tab: { id: 7 } },
    () => {}
  );
  await sleep(20);
  assert.strictEqual(geminiCalls.length, 1);
  assert.strictEqual(geminiCalls[0].model, 'models/ocr-vision', 'imagem colada usa o modelo de OCR');
  assert.ok(messages.some((m) => m.msg.action === 'ocrResult' && m.msg.text === 'Tagging'));
  console.log('✓ OCR de imagem colada usa o modelo de OCR configurado');

  // cancelamento
  messages.length = 0;
  await events.message({ action: 'regionCaptureCancelled' }, { tab: { id: 7 } }, () => {});
  await sleep(10);
  assert.ok(messages.some((m) => m.msg.action === 'ocrCancelled'), 'painel avisado do cancelamento');
  console.log('✓ cancelamento do OCR avisa o painel');

  // startOcrRegion injeta e inicia em modo ocr
  injected.length = 0; messages.length = 0;
  const startRes = await new Promise((resolve) => events.message({ action: 'startOcrRegion' }, { tab: { id: 7 } }, resolve));
  await sleep(20);
  assert.deepStrictEqual(injected[0].files, ['region-capture.js']);
  assert.strictEqual(messages[0].msg.action, 'startRegionCapture');
  assert.strictEqual(messages[0].msg.mode, 'ocr');
  assert.strictEqual(startRes.success, true);
  console.log('✓ startOcrRegion injeta o seletor em modo OCR');

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
