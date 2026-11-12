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
const menus = [];
const injected = [];
const messages = [];

global.chrome = {
  storage: { local },
  runtime: {
    onInstalled: { addListener: (fn) => { events.installed = fn; } },
    onStartup: { addListener: (fn) => { events.startup = fn; } },
    onMessage: { addListener: (fn) => { events.message = fn; } },
    openOptionsPage: () => {}, lastError: undefined
  },
  action: { onClicked: { addListener: (fn) => { events.actionClicked = fn; } }, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
  commands: { onCommand: { addListener: (fn) => { events.command = fn; } } },
  tabs: {
    query: async () => [{ id: 7, url: 'https://example.com/page' }],
    sendMessage: async (tabId, msg, opts) => { messages.push({ tabId, msg, opts }); return { ok: true }; }
  },
  scripting: { executeScript: async (opts) => { injected.push(opts); return [{ result: 'texto selecionado' }]; } },
  downloads: { download: (_o, cb) => cb && cb(1) },
  contextMenus: {
    removeAll: (cb) => { menus.length = 0; cb && cb(); },
    create: (item, cb) => { menus.push(item); cb && cb(); },
    onClicked: { addListener: (fn) => { events.menuClicked = fn; } }
  }
};

global.importScripts = (...files) => {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
};
vm.runInThisContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), { filename: 'background.js' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(80);

  events.installed();
  await sleep(20);
  assert.strictEqual(menus.length, 3);
  assert.deepStrictEqual(menus.map((m) => m.title), [
    'Salvar seleção como transcrição',
    'Salvar seleção como questão',
    'Capturar região da página'
  ]);
  assert.ok(menus.slice(0, 2).every((m) => m.contexts.includes('selection')));
  assert.ok(menus[2].contexts.includes('page'));
  console.log('✓ menus de seleção e região criados');

  injected.length = 0; messages.length = 0;
  events.menuClicked({ menuItemId: 'alura-pro-manual-question', selectionText: 'Qual é a resposta?' }, { id: 7 });
  await sleep(30);
  assert.deepStrictEqual(injected[0].target, { tabId: 7, frameIds: [0] });
  assert.deepStrictEqual(injected[0].files, ['lz-string.min.js', 'storage-utils.js', 'manual-capture.js']);
  assert.strictEqual(messages[0].msg.action, 'openManualPanel');
  assert.strictEqual(messages[0].msg.text, 'Qual é a resposta?');
  assert.strictEqual(messages[0].msg.mode, 'question');
  console.log('✓ menu de seleção abre o painel com texto e modo');

  injected.length = 0; messages.length = 0;
  events.menuClicked({ menuItemId: 'alura-pro-region-capture' }, { id: 7 });
  await sleep(30);
  assert.deepStrictEqual(injected[0].files, ['region-capture.js']);
  assert.deepStrictEqual(messages[0].msg, { action: 'startRegionCapture', mode: 'text' });
  console.log('✓ menu de região inicia a captura de texto');

  injected.length = 0; messages.length = 0;
  await events.message(
    { action: 'regionCaptured', text: 'Texto da região', mode: 'transcript', notice: '' },
    { tab: { id: 7 } }, () => {}
  );
  await sleep(30);
  assert.deepStrictEqual(injected[injected.length - 1].files, ['lz-string.min.js', 'storage-utils.js', 'manual-capture.js']);
  assert.strictEqual(messages[0].msg.action, 'openManualPanel');
  assert.strictEqual(messages[0].msg.text, 'Texto da região');
  console.log('✓ texto da região abre o painel manual');

  injected.length = 0; messages.length = 0;
  await events.command('save-selection');
  await sleep(30);
  assert.strictEqual(typeof injected[0].func, 'function');
  assert.strictEqual(messages[0].msg.text, 'texto selecionado');
  console.log('✓ Alt+S lê a seleção e abre o painel');

  injected.length = 0; messages.length = 0;
  await events.command('capture-region');
  await sleep(30);
  assert.deepStrictEqual(injected[0].files, ['region-capture.js']);
  assert.strictEqual(messages[0].msg.action, 'startRegionCapture');
  assert.strictEqual(messages[0].msg.mode, 'text');
  console.log('✓ Alt+R inicia a captura de região');

  injected.length = 0; messages.length = 0;
  await events.actionClicked({ id: 7, url: 'https://example.com/page' });
  await sleep(30);
  assert.strictEqual(messages[0].msg.action, 'openManualPanel');
  console.log('✓ clique no ícone fora de página de aula abre captura manual');

  injected.length = 0; messages.length = 0;
  await events.actionClicked({ id: 7, url: 'https://cursos.alura.com.br/course/x' });
  await sleep(30);
  assert.strictEqual(messages[0].msg.action, 'manualCapture');
  console.log('✓ clique no ícone em página de aula mantém o fluxo antigo');

  messages.length = 0;
  await events.command('copy-question');
  await sleep(20);
  assert.strictEqual(messages[0].msg.action, 'captureQuestion');
  console.log('✓ Alt+Q preservado');

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
