// manual-capture.js - Painel de captura manual injetado sob demanda em qualquer página.
// Não observa a página, não intercepta cliques e não usa clipboard automaticamente.
(function () {
  "use strict";

  if (window.__aluraProManualCapture) return;
  window.__aluraProManualCapture = true;

  const HOST_ID = "alura-pro-manual-capture-host";
  let host = null;
  let shadow = null;
  let els = null;
  let escHandler = null;
  let closeTimer = null;

  // ---------- utilidades ----------
  function cleanLine(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  const SITE_SUFFIX_RE = /^(udemy|youtube|alura|coursera|hotmart|github|medium|dev\.to|notion|stackoverflow)$/i;

  // Mesmas regras do background: títulos de página viram nomes de curso mais limpos.
  function normalizeCourseTitle(input) {
    let name = cleanLine(input);
    if (!name) return "";

    name = name.replace(/^(course|curso)\s*:\s*/i, "");
    name = name.replace(/\s+at\s+[^·|]+·\s*[\w.-]+\/[\w.-]+\s*$/i, "");
    name = name.replace(/\/?\bREADME\.md\b/gi, "");

    const parts = name.split(/\s*[|·]\s*/).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1 && SITE_SUFFIX_RE.test(parts[parts.length - 1])) {
      parts.pop();
      name = parts.join(" | ");
    }

    return name.replace(/\s+/g, " ").replace(/[\/\s]+$/g, "").trim();
  }

  function pageTitle() {
    const raw = cleanLine(document.title) || location.hostname || "Captura manual";
    return (normalizeCourseTitle(raw) || raw).slice(0, 140);
  }

  function defaultLessonTitle() {
    const time = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    return `${pageTitle()} — ${time}`.slice(0, 180);
  }

  function currentSelection() {
    try {
      return String(window.getSelection()?.toString() || "").trim();
    } catch (_) {
      return "";
    }
  }

  function letterLabel(index) {
    let label = "";
    let n = Math.max(0, index);
    do {
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return label;
  }

  const OPTION_MARK = String.raw`\*|\[[xX]\]|\([xX]\)`;
  const LEADING_MARK_RE = new RegExp(`^\\s*(?:${OPTION_MARK})\\s*`);
  const TRAILING_MARK_RE = new RegExp(`\\s*(?:${OPTION_MARK})\\s*$`);
  // Rótulos aceitos: A)  A.  A:  (A)  [A]  A - ...  |  1)  1.  (1)  |  I)  II.  (III)
  const OPTION_LABEL_RE = new RegExp(
    `^\\s*[\\(\\[]?\\s*(?:[A-Za-z]|[IVXLCDM]{2,}|\\d{1,3})\\s*(?:[\\).\\]:]|[-–—]\\s+)\\s*`
  );

  function parseAlternatives(raw) {
    const options = [];

    for (const rawLine of String(raw || "").split(/\r?\n/)) {
      let line = rawLine.replace(/\u00a0/g, " ").trim();
      if (!line) continue;

      let correct = false;

      if (LEADING_MARK_RE.test(line)) {
        correct = true;
        line = line.replace(LEADING_MARK_RE, "").trim();
      }
      if (TRAILING_MARK_RE.test(line)) {
        correct = true;
        line = line.replace(TRAILING_MARK_RE, "").trim();
      }

      // Qualquer linha vira uma alternativa; o rótulo é sempre sequencial (A, B, C...).
      line = line.replace(OPTION_LABEL_RE, "").trim();
      if (!line) continue;

      options.push({ label: letterLabel(options.length), text: line, correct });
    }

    return options;
  }

  function splitQuestionAndOptions(raw) {
    const lines = String(raw || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/\u00a0/g, " ").trim())
      .filter(Boolean);

    if (lines.length < 3) return null;

    let firstLabeled = -1;
    let labeledCount = 0;

    for (let i = 0; i < lines.length; i++) {
      if (OPTION_LABEL_RE.test(lines[i])) {
        if (firstLabeled === -1) firstLabeled = i;
        labeledCount++;
      }
    }

    if (firstLabeled > 0 && labeledCount >= 2) {
      return {
        question: lines.slice(0, firstLabeled).join("\n"),
        options: lines.slice(firstLabeled).join("\n")
      };
    }

    // Sem rótulos: só divide se houver uma alternativa marcada no bloco final.
    let markedIndex = -1;
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 12); i--) {
      if (LEADING_MARK_RE.test(lines[i]) || TRAILING_MARK_RE.test(lines[i])) {
        markedIndex = i;
        break;
      }
    }
    if (markedIndex === -1) return null;

    let start = markedIndex;
    while (start > 0) {
      const previous = lines[start - 1];
      if (previous.length > 120 || /\?$/.test(previous)) break;
      start--;
      if (markedIndex - start >= 8) break;
    }

    if (markedIndex === start) return null;

    return {
      question: lines.slice(0, start).join("\n"),
      options: lines.slice(start).join("\n")
    };
  }

  function applyCorrectLetter(options, letter) {
    const target = String(letter || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1);

    if (target) {
      if (!options.some((option) => option.label === target)) return null;
      options.forEach((option) => { option.correct = option.label === target; });
      return target;
    }

    const marked = options.filter((option) => option.correct);
    if (marked.length > 1) {
      marked.slice(1).forEach((option) => { option.correct = false; });
    }
    return marked.length ? marked[0].label : "";
  }

  function setStatus(message, type = "") {
    if (!els?.status) return;
    els.status.textContent = message || "";
    els.status.className = `status${type ? ` ${type}` : ""}`;
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(response || {});
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // ---------- painel ----------
  function ensurePanel() {
    if (host && host.isConnected) return;

    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.top = "16px";
    host.style.right = "16px";
    host.style.zIndex = "2147483647";
    host.style.pointerEvents = "auto";

    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }
        [hidden] { display: none !important; }
        .card {
          width: min(460px, calc(100vw - 32px));
          max-height: calc(100vh - 32px);
          overflow: auto;
          background: #ffffff;
          color: #111827;
          border: 1px solid #d1d5db;
          border-radius: 12px;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
          font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          text-align: left;
        }
        .head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
        }
        .head strong { font-size: 14px; font-weight: 700; }
        .close {
          border: none; background: transparent; color: #6b7280;
          font-size: 22px; line-height: 1; cursor: pointer; padding: 0 4px;
        }
        .body { padding: 12px 16px; display: grid; gap: 10px; }
        .row2 { display: grid; grid-template-columns: 130px 1fr; gap: 10px; }
        .field { display: grid; gap: 4px; }
        .field > span { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; }
        input, select, textarea {
          width: 100%; padding: 7px 9px; border: 1px solid #d1d5db; border-radius: 7px;
          background: #f9fafb; color: #111827; font: inherit;
        }
        textarea { resize: vertical; min-height: 70px; }
        input:focus, select:focus, textarea:focus { outline: 2px solid #059669; outline-offset: 1px; }
        .question-fields { display: grid; gap: 10px; }
        .ocr-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .ocr-hint { font-size: 11px; color: #6b7280; }
        .status { min-height: 16px; font-size: 12px; color: #4b5563; }
        .status.success { color: #047857; font-weight: 600; }
        .status.danger { color: #b91c1c; font-weight: 600; }
        .foot {
          display: flex; justify-content: flex-end; gap: 8px;
          padding: 12px 16px; border-top: 1px solid #e5e7eb;
        }
        .btn {
          border: 1px solid transparent; border-radius: 8px; padding: 8px 14px;
          font: inherit; font-weight: 600; cursor: pointer;
        }
        .btn.ghost { background: #ffffff; border-color: #d1d5db; color: #374151; }
        .btn.primary { background: #047857; color: #ffffff; }
        .btn.primary:disabled { opacity: 0.6; cursor: wait; }
      </style>
      <div class="card" role="dialog" aria-label="Salvar captura manual">
        <div class="head">
          <strong>Salvar captura</strong>
          <button class="close" type="button" data-el="close" title="Fechar">×</button>
        </div>
        <div class="body">
          <div class="row2">
            <label class="field">
              <span>Tipo</span>
              <select data-el="type">
                <option value="transcript">Transcrição</option>
                <option value="question">Questão</option>
              </select>
            </label>
            <label class="field">
              <span>Curso</span>
              <input data-el="course" list="alura-pro-course-options" placeholder="Título da página">
              <datalist id="alura-pro-course-options" data-el="courseList"></datalist>
            </label>
          </div>
          <label class="field">
            <span>Título</span>
            <input data-el="title" placeholder="Título da captura">
          </label>
          <label class="field">
            <span>Texto</span>
            <textarea data-el="text" rows="9" placeholder="Selecione um texto na página ou cole aqui..."></textarea>
          </label>
          <div class="ocr-row">
            <button class="btn ghost" type="button" data-el="ocr">📷 OCR da região</button>
            <button class="btn ghost" type="button" data-el="split" hidden>✂️ Separar alternativas</button>
            <span class="ocr-hint" data-el="ocrStatus">Arraste a região ou cole uma imagem (Ctrl+V) para transcrever.</span>
          </div>
          <div class="question-fields" data-el="questionFields" hidden>
            <label class="field">
              <span>Alternativas (uma por linha; com ou sem A), 1) ou I); marque a correta com *)</span>
              <textarea data-el="options" rows="5" placeholder="A) Primeira alternativa&#10;B) Segunda alternativa *&#10;Terceira alternativa (sem rótulo também vale)"></textarea>
            </label>
            <label class="field">
              <span>Letra correta (opcional)</span>
              <input data-el="correct" maxlength="2" placeholder="Ex.: B">
            </label>
          </div>
          <div class="status" data-el="status"></div>
        </div>
        <div class="foot">
          <button class="btn ghost" type="button" data-el="cancel">Cancelar</button>
          <button class="btn primary" type="button" data-el="save">Salvar</button>
        </div>
      </div>
    `;

    els = {
      type: shadow.querySelector('[data-el="type"]'),
      course: shadow.querySelector('[data-el="course"]'),
      courseList: shadow.querySelector('[data-el="courseList"]'),
      title: shadow.querySelector('[data-el="title"]'),
      text: shadow.querySelector('[data-el="text"]'),
      questionFields: shadow.querySelector('[data-el="questionFields"]'),
      options: shadow.querySelector('[data-el="options"]'),
      correct: shadow.querySelector('[data-el="correct"]'),
      status: shadow.querySelector('[data-el="status"]'),
      ocr: shadow.querySelector('[data-el="ocr"]'),
      split: shadow.querySelector('[data-el="split"]'),
      ocrStatus: shadow.querySelector('[data-el="ocrStatus"]'),
      save: shadow.querySelector('[data-el="save"]'),
      cancel: shadow.querySelector('[data-el="cancel"]'),
      close: shadow.querySelector('[data-el="close"]')
    };

    els.type.addEventListener("change", updateTypeVisibility);
    els.close.addEventListener("click", closePanel);
    els.cancel.addEventListener("click", closePanel);
    els.save.addEventListener("click", saveCapture);
    els.ocr.addEventListener("click", startOcr);
    els.split.addEventListener("click", splitCurrent);
    els.text.addEventListener("paste", handlePaste);

    // Evita que atalhos e handlers da página reajam ao que é digitado no painel.
    for (const type of ["mousedown", "mouseup", "click", "dblclick", "keydown", "keypress", "keyup", "paste"]) {
      host.addEventListener(type, (event) => event.stopPropagation());
    }

    document.documentElement.appendChild(host);
  }

  async function startOcr() {
    if (!els) return;

    host.style.display = "none";
    const response = await sendMessage({ action: "startOcrRegion" });
    if (!response.success) {
      host.style.display = "";
      setStatus(`✗ ${response.error || "Não foi possível iniciar o OCR."}`, "danger");
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Falha ao ler a imagem."));
      reader.readAsDataURL(file);
    });
  }

  function downscaleDataUrl(dataUrl, maxDim = 1600) {
    return new Promise((resolve) => {
      try {
        const image = new Image();
        image.onload = () => {
          try {
            const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
            if (!image.width || !image.height || scale >= 1) {
              resolve(dataUrl);
              return;
            }

            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));

            const context = canvas.getContext("2d");
            if (!context) {
              resolve(dataUrl);
              return;
            }

            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.9));
          } catch (_) {
            resolve(dataUrl);
          }
        };
        image.onerror = () => resolve(dataUrl);
        image.src = dataUrl;
      } catch (_) {
        resolve(dataUrl);
      }
    });
  }

  async function startOcrFromFile(file) {
    if (!els) return;

    host.style.display = "none";
    setStatus("Preparando imagem...");

    try {
      const raw = await readFileAsDataUrl(file);
      const dataUrl = await downscaleDataUrl(raw);
      const response = await sendMessage({ action: "ocrImage", dataUrl });
      if (!response.success) {
        host.style.display = "";
        setStatus(`✗ ${response.error || "Falha no OCR da imagem."}`, "danger");
      }
    } catch (err) {
      host.style.display = "";
      setStatus(`✗ ${err.message}`, "danger");
    }
  }

  function handlePaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type && item.type.startsWith("image/"));
    if (!imageItem) return;

    const file = imageItem.getAsFile?.();
    if (!file) return;

    event.preventDefault();
    event.stopPropagation();
    startOcrFromFile(file);
  }

  function splitCurrent() {
    if (!els) return;

    const result = splitQuestionAndOptions(els.text.value);
    if (!result) {
      setStatus("Não encontrei alternativas rotuladas ou marcadas no texto.", "danger");
      return;
    }

    els.text.value = result.question;
    els.options.value = result.options;
    setStatus("✓ Alternativas separadas. Revise e marque a correta com *.", "success");
  }

  function handleOcrResult(request) {
    if (!host || !els) return;
    host.style.display = "";

    if (request.error) {
      setStatus(`✗ ${request.error}`, "danger");
      return;
    }

    const text = String(request.text || "").trim();
    if (!text) {
      setStatus("O OCR não retornou texto. Tente uma região maior ou com mais contraste.", "danger");
      return;
    }

    const current = els.text.value.trim();

    if (!current && els.type.value === "question" && !els.options.value.trim()) {
      const split = splitQuestionAndOptions(text);
      if (split) {
        els.text.value = split.question;
        els.options.value = split.options;
        els.text.focus();
        setStatus(
          `✓ OCR concluído${request.model ? ` (${request.model})` : ""} e alternativas separadas. Revise.`,
          "success"
        );
        return;
      }
    }

    els.text.value = current ? `${current}\n\n${text}` : text;
    els.text.focus();
    els.text.setSelectionRange(els.text.value.length, els.text.value.length);
    setStatus(`✓ OCR concluído${request.model ? ` (${request.model})` : ""}. Revise o texto.`, "success");
  }

  function updateTypeVisibility() {
    if (!els) return;
    const isQuestion = els.type.value === "question";
    els.questionFields.hidden = !isQuestion;
    els.split.hidden = !isQuestion;
  }

  async function loadCourseOptions() {
    if (!els?.courseList) return;
    try {
      if (!window.AluraStore?.get) return;
      const data = await window.AluraStore.get(["courses"]);
      const names = Object.values(data.courses || {})
        .map((course) => String(course?.name || "").trim())
        .filter(Boolean)
        .slice(0, 150);

      els.courseList.textContent = "";
      for (const name of names) {
        const option = document.createElement("option");
        option.value = name;
        els.courseList.appendChild(option);
      }
    } catch (_) { /* datalist é opcional */ }
  }

  function openPanel(options = {}) {
    ensurePanel();

    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    const mode = options.mode === "question" ? "question" : "transcript";
    const providedText = String(options.text || "").trim();
    const text = providedText || currentSelection();

    host.style.display = "";
    els.type.value = mode;
    els.course.value = pageTitle();
    els.title.value = defaultLessonTitle();
    els.text.value = text;
    els.options.value = "";
    els.correct.value = "";
    els.save.disabled = false;
    setStatus(options.notice || "");
    updateTypeVisibility();
    loadCourseOptions();

    if (escHandler) document.removeEventListener("keydown", escHandler, true);
    escHandler = (event) => {
      if (event.key !== "Escape") return;
      // Durante o OCR o painel fica oculto e o Esc pertence ao seletor de região.
      if (!host || host.style.display === "none") return;
      event.stopPropagation();
      closePanel();
    };
    document.addEventListener("keydown", escHandler, true);

    els.text.focus();
    if (text) els.text.setSelectionRange(text.length, text.length);
  }

  function closePanel() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    if (escHandler) {
      document.removeEventListener("keydown", escHandler, true);
      escHandler = null;
    }
    if (host) host.remove();
    host = null;
    shadow = null;
    els = null;
  }

  async function saveCapture() {
    if (!els) return;

    const type = els.type.value === "question" ? "question" : "transcript";
    const text = els.text.value.trim();
    const course = cleanLine(els.course.value) || pageTitle();
    const title = cleanLine(els.title.value) || defaultLessonTitle();

    if (!text) {
      setStatus("Selecione ou cole um texto antes de salvar.", "danger");
      els.text.focus();
      return;
    }

    let payload;

    if (type === "question") {
      const options = parseAlternatives(els.options.value);
      const correctLabel = applyCorrectLetter(options, els.correct.value);

      if (correctLabel === null) {
        setStatus("A letra correta não corresponde a nenhuma alternativa.", "danger");
        els.correct.focus();
        return;
      }

      const correct = options.find((option) => option.correct) || null;
      payload = {
        action: "storeQuestion",
        question: {
          id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          question: text,
          lesson: title,
          course,
          courseName: course,
          options,
          correctLabel: correctLabel || "",
          correctText: correct?.text || "",
          correctExplanation: "",
          sourceUrl: location.href,
          pageTitle: document.title,
          sourceType: "selection",
          capturedAt: new Date().toISOString()
        }
      };
    } else {
      payload = {
        action: "storeTranscript",
        title,
        transcript: text,
        formattedText: `[Titulo] ${title}\n\n[Texto] ${text}`,
        courseName: course,
        sourceUrl: location.href,
        pageTitle: document.title,
        sourceType: "selection"
      };
    }

    els.save.disabled = true;
    setStatus("Salvando...");

    try {
      const response = await sendMessage(payload);
      if (!response.success) throw new Error(response.error || "Falha ao salvar.");

      if (response.isDuplicate) {
        setStatus("Esse conteúdo já estava salvo (anti-duplicação).", "success");
      } else {
        setStatus("✓ Captura salva.", "success");
      }
      closeTimer = setTimeout(closePanel, 900);
    } catch (err) {
      setStatus(`✗ ${err.message}`, "danger");
      els.save.disabled = false;
    }
  }

  // ---------- mensagens ----------
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.action === "openManualPanel") {
      openPanel({ text: request.text, mode: request.mode, notice: request.notice });
      sendResponse({ ok: true });
      return;
    }

    if (request?.action === "ocrPending") {
      if (host) {
        host.style.display = "";
        setStatus("Lendo a imagem com Gemini...");
      }
      sendResponse({ ok: true });
      return;
    }

    if (request?.action === "ocrResult") {
      handleOcrResult(request);
      sendResponse({ ok: true });
      return;
    }

    if (request?.action === "ocrCancelled") {
      if (host) {
        host.style.display = "";
        setStatus("OCR cancelado.", "");
      }
      sendResponse({ ok: true });
    }
  });
})();
