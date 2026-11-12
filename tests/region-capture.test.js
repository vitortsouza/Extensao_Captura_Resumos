const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup(bodyHtml) {
  const dom = new JSDOM(
    `<!doctype html><html><head><title>Região</title></head><body>${bodyHtml}</body></html>`,
    { url: 'https://example.com/artigo', runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const w = dom.window;
  const sent = [];
  let listener = null;
  w.chrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener: (fn) => { listener = fn; } },
      sendMessage: (msg, cb) => { sent.push(msg); cb && cb({ success: true }); }
    }
  };
  w.eval(fs.readFileSync(path.join(root, 'region-capture.js'), 'utf8'));
  return { dom, w, sent, send: (msg) => listener(msg, {}, () => {}) };
}

const host = (w) => w.document.getElementById('alura-pro-region-capture-host');

function drag(w, from, to) {
  const rail = host(w).shadowRoot.querySelector('[data-el="rail"]');
  const fire = (type, x, y) => rail.dispatchEvent(
    new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
  );
  fire('pointerdown', from.x, from.y);
  fire('pointermove', to.x, to.y);
  fire('pointerup', to.x, to.y);
}

function stubRects(w, rect) {
  w.Range.prototype.getClientRects = function () { return rect ? [rect] : []; };
}

(async () => {
  {
    const { dom, w, sent, send } = setup(
      '<p style="display:block">Masking Normalization</p><p style="display:block">Removing Tagging</p>'
    );
    stubRects(w, { left: 20, top: 20, right: 120, bottom: 30, width: 100, height: 10 });
    send({ action: 'startRegionCapture', mode: 'text' });
    drag(w, { x: 10, y: 10 }, { x: 200, y: 120 });
    await sleep(10);
    assert.strictEqual(host(w), null);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].action, 'regionCaptured');
    assert.ok(/Masking/.test(sent[0].text) && /Tagging/.test(sent[0].text));
    assert.ok(sent[0].text.includes('\n'));
    console.log('✓ região extrai o texto dos blocos e envia ao background');
    dom.window.close();
  }

  {
    const { dom, w, sent, send } = setup('<p style="display:block">Fora</p>');
    stubRects(w, { left: 900, top: 900, right: 1000, bottom: 950, width: 100, height: 50 });
    send({ action: 'startRegionCapture', mode: 'text' });
    drag(w, { x: 10, y: 10 }, { x: 200, y: 120 });
    await sleep(10);
    assert.strictEqual(sent[0].text, '');
    assert.ok(/OCR/.test(sent[0].notice));
    console.log('✓ região sem texto envia aviso para o painel');
    dom.window.close();
  }

  {
    const { dom, w, sent, send } = setup('<p style="display:block">Texto</p>');
    stubRects(w, { left: 20, top: 20, right: 120, bottom: 30, width: 100, height: 10 });
    send({ action: 'startRegionCapture', mode: 'ocr' });
    drag(w, { x: 10, y: 10 }, { x: 200, y: 120 });
    await sleep(10);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].action, 'regionCapturedForOcr');
    assert.strictEqual(sent[0].rect.left, 10);
    assert.strictEqual(sent[0].rect.top, 10);
    assert.strictEqual(sent[0].rect.width, 190);
    assert.strictEqual(sent[0].rect.height, 110);
    assert.strictEqual(sent[0].dpr, 1);
    assert.strictEqual(sent[0].text, undefined);
    console.log('✓ modo OCR envia a região e o dpr');
    dom.window.close();
  }

  {
    const { dom, w, sent, send } = setup('<p style="display:block">Texto</p>');
    send({ action: 'startRegionCapture', mode: 'ocr' });
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(10);
    assert.strictEqual(host(w), null);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].action, 'regionCaptureCancelled');
    console.log('✓ Esc no modo OCR avisa o cancelamento');
    dom.window.close();
  }

  {
    const { dom, w, sent, send } = setup('<p style="display:block">Texto</p>');
    send({ action: 'startRegionCapture', mode: 'text' });
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(10);
    assert.strictEqual(host(w), null);
    assert.strictEqual(sent.length, 0);
    console.log('✓ Esc no modo texto cancela em silêncio');
    dom.window.close();
  }

  {
    const { dom, w, sent, send } = setup('<p style="display:block">Texto</p>');
    stubRects(w, { left: 20, top: 20, right: 120, bottom: 30, width: 100, height: 10 });
    send({ action: 'startRegionCapture', mode: 'text' });
    drag(w, { x: 10, y: 10 }, { x: 12, y: 12 });
    await sleep(10);
    assert.strictEqual(host(w), null);
    assert.strictEqual(sent.length, 0);
    console.log('✓ clique sem arraste é ignorado');
    dom.window.close();
  }

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
