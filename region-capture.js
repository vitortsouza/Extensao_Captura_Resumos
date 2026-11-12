// region-capture.js - Captura de região com extração de texto via DOM.
// Injetado sob demanda: não observa a página nem intercepta eventos fora do modo de captura.
(function () {
  "use strict";

  if (window.__aluraProRegionCapture) return;

  const HOST_ID = "alura-pro-region-capture-host";
  const MAX_TEXT = 20000;
  let host = null;
  let shadow = null;
  let rail = null;
  let rectEl = null;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let captureMode = "text";
  let keyHandler = null;

  function sendMessage(message) {
    try {
      chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
    } catch (_) { /* extensão recarregada */ }
  }

  function intersects(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function isHiddenElement(el) {
    if (!el || !el.tagName) return true;

    const tag = el.tagName;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION|TEMPLATE)$/.test(tag)) return true;

    const style = window.getComputedStyle(el);
    if (!style) return false;
    const opacity = String(style.opacity || "").trim();
    return (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      (opacity !== "" && Number(opacity) === 0)
    );
  }

  function blockAncestor(el) {
    let node = el;
    while (node && node !== document.body && node.nodeType === 1) {
      const display = window.getComputedStyle(node).display;
      if (display && display !== "inline" && display !== "contents") return node;
      node = node.parentElement;
    }
    return document.body;
  }

  function extractText(rect) {
    if (!document.body) return "";

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (isHiddenElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const pieces = [];
    let node;

    while ((node = walker.nextNode())) {
      const range = document.createRange();
      range.selectNodeContents(node);

      const hit = Array.from(range.getClientRects()).some(
        (r) => r.width > 0 && r.height > 0 && intersects(r, rect)
      );
      if (!hit) continue;

      const text = node.nodeValue.replace(/\s+/g, " ").trim();
      if (!text) continue;

      pieces.push({ text, block: blockAncestor(node.parentElement) });
    }

    const lines = [];
    let buffer = "";
    let lastBlock = null;

    for (const piece of pieces) {
      if (piece.block === lastBlock) {
        buffer += buffer ? " " + piece.text : piece.text;
      } else {
        if (buffer) lines.push(buffer);
        buffer = piece.text;
        lastBlock = piece.block;
      }
    }
    if (buffer) lines.push(buffer);

    return lines.join("\n").trim().slice(0, MAX_TEXT);
  }

  function updateRect(x1, y1, x2, y2) {
    if (!rectEl) return;
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    rectEl.style.left = `${left}px`;
    rectEl.style.top = `${top}px`;
    rectEl.style.width = `${width}px`;
    rectEl.style.height = `${height}px`;
  }

  function cleanup() {
    dragging = false;
    if (keyHandler) {
      document.removeEventListener("keydown", keyHandler, true);
      keyHandler = null;
    }
    if (host) host.remove();
    host = null;
    shadow = null;
    rail = null;
    rectEl = null;
  }

  function cancel() {
    const notify = captureMode === "ocr";
    cleanup();
    if (notify) sendMessage({ action: "regionCaptureCancelled" });
  }

  function finish(x1, y1, x2, y2) {
    const rect = {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      right: Math.max(x1, x2),
      bottom: Math.max(y1, y2)
    };
    const width = rect.right - rect.left;
    const height = rect.bottom - rect.top;
    const mode = captureMode;

    cleanup();

    if (width < 10 || height < 10) {
      if (mode === "ocr") sendMessage({ action: "regionCaptureCancelled" });
      return;
    }

    if (mode === "ocr") {
      sendMessage({
        action: "regionCapturedForOcr",
        rect: { left: rect.left, top: rect.top, width, height },
        dpr: window.devicePixelRatio || 1
      });
      return;
    }

    let text = "";
    try {
      text = extractText(rect);
    } catch (_) {
      text = "";
    }
    sendMessage({
      action: "regionCaptured",
      text,
      mode: "transcript",
      notice: text ? "" : "Nenhum texto selecionável encontrado na região. Cole o conteúdo ou use o OCR."
    });
  }

  function start(mode) {
    if (host) return;

    captureMode = mode === "ocr" ? "ocr" : "text";
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "2147483646";
    host.style.pointerEvents = "auto";

    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }
        .rail {
          position: fixed; inset: 0; cursor: crosshair;
          user-select: none; -webkit-user-select: none; touch-action: none;
        }
        .rect {
          position: fixed; display: none; pointer-events: none;
          border: 2px solid #10b981;
          background: rgba(16, 185, 129, 0.12);
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.28);
        }
        .hint {
          position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
          padding: 8px 14px; border-radius: 999px;
          background: #111827; color: #f9fafb;
          font: 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
          pointer-events: none; white-space: nowrap;
        }
        .hint b { color: #6ee7b7; }
      </style>
      <div class="rail" data-el="rail"></div>
      <div class="rect" data-el="rect"></div>
      <div class="hint">Arraste para capturar a região · <b>Esc</b> cancela</div>
    `;

    rail = shadow.querySelector('[data-el="rail"]');
    rectEl = shadow.querySelector('[data-el="rect"]');

    rail.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      updateRect(startX, startY, startX, startY);
      rectEl.style.display = "block";

      try { rail.setPointerCapture(event.pointerId); } catch (_) { /* opcional */ }
    });

    rail.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      event.preventDefault();
      updateRect(startX, startY, event.clientX, event.clientY);
    });

    rail.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = false;
      finish(startX, startY, event.clientX, event.clientY);
    });

    rail.addEventListener("pointercancel", () => {
      if (dragging) cancel();
    });

    rail.addEventListener("contextmenu", (event) => event.preventDefault());

    keyHandler = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    document.addEventListener("keydown", keyHandler, true);

    document.documentElement.appendChild(host);
  }

  window.__aluraProRegionCapture = { start };

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.action !== "startRegionCapture") return;
    start(request.mode);
    sendResponse({ ok: true });
  });
})();
