// background.js - Service Worker da Extensão Captura e Resumos Pro v2.15.1
importScripts("lz-string.min.js", "storage-utils.js", "gemini-client.js");

const DEFAULT_PROMPT =
  "Você é um assistente pedagógico especializado. Faça um resumo estruturado, didático e completo da seguinte aula, utilizando parágrafos coesos e texto corrido estruturado (evitando listas excessivamente fragmentadas).\n" +
  "IMPORTANTE: Comece DIRETAMENTE pelo conteúdo do resumo. NÃO inclua saudações, introduções ou frases de abertura como 'Aqui está o resumo...', 'Com certeza...', ou 'Segue o resumo solicitado'. Vá direto aos tópicos.\n" +
  "O resumo deve abranger com profundidade:\n" +
  "1) Os conceitos centrais e pilares teóricos da aula.\n" +
  "2) As ferramentas práticas, metodologias (como métodos e estruturas) e exemplos citados.\n" +
  "3) As recomendações de implementação, dicas essenciais e conclusões práticas para fixação do conteúdo.\n\n" +
  "Aqui está a transcrição da aula:\n";

const DEFAULT_MODELS = [
  "models/gemini-3.5-flash-lite",
  "models/gemini-flash-lite-latest",
  "models/gemini-3.1-flash-lite",
  "models/gemini-3.1-flash-lite-preview",
  "models/gemini-2.5-flash-lite",
  "models/gemini-3.1-flash-lite-image",
  "models/gemini-3.8-flash-lite-tts"
];

const CURRENT_STORAGE_VERSION = 3;
const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024; // estimativa conservadora do storage.local

// ---------- utilidades ----------
function byteLength(str) {
  try {
    return new TextEncoder().encode(String(str)).byteLength;
  } catch (_) {
    return String(str).length * 2;
  }
}

function hashString(value) {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return "k" + Math.abs(hash).toString(36);
}

function courseIdFor(name, preserveName = false) {
  const base = preserveName
    ? String(name || "").replace(/\s+/g, " ").trim()
    : normalizeCourseName(name);
  return hashString(base.toLowerCase());
}

// Sites cujo nome no fim do título não faz parte do nome do curso.
const SITE_SUFFIX_RE = /^(udemy|youtube|alura|coursera|hotmart|github|medium|dev\.to|notion|stackoverflow)$/i;

// Normaliza títulos de página usados como nome de curso:
// - remove prefixos "Course:"/"Curso:"
// - remove sufixos de GitHub ("... at main · usuario/repo")
// - remove "README.md"
// - remove sufixos de sites conhecidos ("... | Udemy")
function normalizePageTitle(input) {
  let name = String(input || "").replace(/\s+/g, " ").trim();
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

// Capturas manuais usam o título da página como curso, sem cortar em "|" ou ">".
function manualCourseName(input) {
  const name = normalizePageTitle(input).slice(0, 140);
  return name || "Capturas manuais";
}

function mergeCourseInto(courses, questions, summaries, sourceId, targetId) {
  const source = courses[sourceId];
  const target = courses[targetId];
  if (!source || !target || sourceId === targetId) return;

  const lessons = target.lessons || [];
  const titles = new Set(lessons.map((lesson) => String(lesson.title || "").trim().toLowerCase()));

  for (const lesson of source.lessons || []) {
    const key = String(lesson.title || "").trim().toLowerCase();
    if (key && titles.has(key)) continue;
    if (key) titles.add(key);
    lessons.push(lesson);
  }

  target.lessons = lessons;
  target.updatedAt = new Date().toISOString();

  questions.forEach((question) => {
    if (question.courseId === sourceId) {
      question.courseId = targetId;
      question.courseName = target.name;
    }
  });

  summaries.forEach((summary) => {
    if (summary.courseId === sourceId) {
      summary.courseId = targetId;
      summary.courseName = target.name;
    }
  });

  delete courses[sourceId];
}

function applyCourseName(courses, questions, summaries, courseId, name) {
  const course = courses[courseId];
  if (!course) return null;

  const newId = courseIdFor(name, true);

  if (newId !== courseId && courses[newId]) {
    mergeCourseInto(courses, questions, summaries, courseId, newId);
    return courses[newId];
  }

  if (newId !== courseId) {
    delete courses[courseId];
    course.id = newId;
    courses[newId] = course;
    questions.forEach((question) => {
      if (question.courseId === courseId) question.courseId = newId;
    });
    summaries.forEach((summary) => {
      if (summary.courseId === courseId) summary.courseId = newId;
    });
  }

  course.name = name;
  course.updatedAt = new Date().toISOString();
  questions.forEach((question) => {
    if (question.courseId === course.id) question.courseName = name;
  });
  summaries.forEach((summary) => {
    if (summary.courseId === course.id) summary.courseName = name;
  });

  return course;
}

function lessonIdFor(courseId, title) {
  return hashString(courseId + "|" + String(title || "").toLowerCase());
}

// Extrai o nome do curso de títulos como "Curso > Aula".
function normalizeCourseName(input) {
  const raw = String(input || "").trim();
  const withoutSite = raw.split("|")[0].trim();
  const parts = withoutSite.split(">").map((p) => p.trim()).filter(Boolean);
  const name = parts.length > 1 ? parts[0] : withoutSite;
  return name || "Curso";
}

function sanitizeFilename(value) {
  if (!value) return "";
  return value
    .replace(/\\/g, "/")
    .replace(/\.\./g, "")
    .replace(/[:*?<>|]/g, "")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .slice(0, 160);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "curso";
}

function parseRawContent(rawContent) {
  const blocks = [];
  const re = /\[Titulo\]\s*([\s\S]*?)\n\n\[Texto\]\s*([\s\S]*?)(?=\n\n\n\[Titulo\]|$)/g;
  let match;
  while ((match = re.exec(rawContent || "")) !== null) {
    const title = (match[1] || "").trim();
    const text = (match[2] || "").trim();
    if (title || text) blocks.push({ title, text });
  }
  return blocks;
}

function addLessonToCourses(courses, courseName, lesson, options = {}) {
  const preserveName = !!options.preserveName;
  const courseId = courseIdFor(courseName, preserveName);
  const name = preserveName ? manualCourseName(courseName) : normalizeCourseName(courseName);
  const now = new Date().toISOString();

  if (!courses[courseId]) {
    courses[courseId] = {
      id: courseId,
      name,
      createdAt: now,
      updatedAt: now,
      lessons: []
    };
  }

  const course = courses[courseId];
  course.name = course.name || name;
  course.updatedAt = now;

  const normalized = String(lesson.title || "").trim().toLowerCase();
  const existing = course.lessons.find(
    (l) => String(l.title || "").trim().toLowerCase() === normalized
  );

  const entry = {
    id: lesson.id || lessonIdFor(courseId, lesson.title),
    title: lesson.title || "Aula sem título",
    transcript: lesson.transcript || "",
    sourceUrl: lesson.sourceUrl || "",
    sourceType: lesson.sourceType || "alura",
    pageTitle: lesson.pageTitle || "",
    capturedAt: lesson.capturedAt || now
  };

  if (existing) {
    Object.assign(existing, entry);
  } else {
    course.lessons.push(entry);
  }

  return { courseId, course };
}

// ---------- inicialização / migração ----------
async function ensureDefaults() {
  const data = await AluraStore.get([
    "subfolder",
    "filename",
    "rawContent",
    "savedTitles",
    "apiKey",
    "modelName",
    "availableModels",
    "promptCustom",
    "aiSummaries",
    "antiDuplicate",
    "autoCaptureOnNextVideo",
    "savedQuestions",
    "questionAutoCapture",
    "storageVersion",
    "courses",
    "summaryCache",
    "captureCount",
    "autoBackupEvery"
  ]);

  const isOldPrompt =
    !data.promptCustom ||
    data.promptCustom.includes("Abaixo está a transcrição") ||
    !data.promptCustom.includes("NÃO inclua saudações");

  await AluraStore.set({
    subfolder: data.subfolder !== undefined ? data.subfolder : "Transcricoes",
    filename: data.filename || "transcricoes_acumuladas.txt",
    rawContent: data.rawContent || "",
    savedTitles: data.savedTitles || [],
    apiKey: data.apiKey || "",
    modelName: data.modelName || DEFAULT_MODELS[0],
    availableModels:
      data.availableModels && data.availableModels.length > 0
        ? data.availableModels
        : DEFAULT_MODELS,
    promptCustom: isOldPrompt ? DEFAULT_PROMPT : data.promptCustom,
    aiSummaries: data.aiSummaries || [],
    antiDuplicate: data.antiDuplicate !== undefined ? data.antiDuplicate : true,
    autoCaptureOnNextVideo:
      data.autoCaptureOnNextVideo !== undefined ? data.autoCaptureOnNextVideo : false,
    savedQuestions: data.savedQuestions || [],
    questionAutoCapture:
      data.questionAutoCapture !== undefined ? data.questionAutoCapture : false,
    summaryCache: data.summaryCache || {},
    captureCount: data.captureCount || 0,
    autoBackupEvery: data.autoBackupEvery || 0
  });
}

async function ensureStorageVersion() {
  const data = await AluraStore.get([
    "storageVersion",
    "courses",
    "rawContent",
    "savedTitles",
    "savedQuestions",
    "summaryCache",
    "captureCount"
  ]);

  const version = data.storageVersion || 1;
  const hasCourses = data.courses && typeof data.courses === "object" && Object.keys(data.courses).length > 0;

  if (version >= CURRENT_STORAGE_VERSION && hasCourses) return data.courses;

  const courses = hasCourses ? data.courses : {};

  // Migra o acumulado antigo (um único rawContent) para courses[courseId].lessons[].
  if (!hasCourses && data.rawContent) {
    const legacyName = "Curso importado (legado)";
    const blocks = parseRawContent(data.rawContent);
    for (const block of blocks) {
      addLessonToCourses(courses, legacyName, {
        title: block.title,
        transcript: block.text,
        sourceUrl: "",
        capturedAt: new Date().toISOString()
      });
    }
  }

  // Garante courseId em questões antigas.
  const questions = (data.savedQuestions || []).map((q) => {
    if (q.courseId) return q;
    return { ...q, courseId: courseIdFor(q.course || q.lesson || "Curso") };
  });

  // v3: desativa capturas automáticas uma única vez para eliminar interferência
  // com os cliques da própria página. O usuário pode reativar nas opções.
  const disableAutoCapture = version < 3;

  await AluraStore.set({
    courses,
    savedQuestions: questions,
    summaryCache: data.summaryCache || {},
    captureCount: data.captureCount || 0,
    ...(disableAutoCapture
      ? { autoCaptureOnNextVideo: false, questionAutoCapture: false }
      : {}),
    storageVersion: CURRENT_STORAGE_VERSION
  });

  return courses;
}

let readyPromise = null;
function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await ensureDefaults();
      await ensureStorageVersion();
    })().catch((err) => {
      console.error("[Captura Pro] Falha na inicialização:", err);
    });
  }
  return readyPromise;
}

chrome.runtime.onInstalled.addListener(() => {
  readyPromise = null;
  ready();
  createManualContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  readyPromise = null;
  ready();
  createManualContextMenus();
});

// Executa também no primeiro despertar do service worker.
ready();

// ---------- captura manual em qualquer página ----------
const MANUAL_MENU_TRANSCRIPT = "alura-pro-manual-transcript";
const MANUAL_MENU_QUESTION = "alura-pro-manual-question";
const REGION_MENU_CAPTURE = "alura-pro-region-capture";

function createManualContextMenus() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    chrome.contextMenus.create(
      {
        id: MANUAL_MENU_TRANSCRIPT,
        title: "Salvar seleção como transcrição",
        contexts: ["selection"]
      },
      () => void chrome.runtime.lastError
    );
    chrome.contextMenus.create(
      {
        id: MANUAL_MENU_QUESTION,
        title: "Salvar seleção como questão",
        contexts: ["selection"]
      },
      () => void chrome.runtime.lastError
    );
    chrome.contextMenus.create(
      {
        id: REGION_MENU_CAPTURE,
        title: "Capturar região da página",
        contexts: ["page", "image"]
      },
      () => void chrome.runtime.lastError
    );
  });
}

async function readSelection(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => String(window.getSelection()?.toString() || "")
    });
    const found = (results || [])
      .map((entry) => String(entry?.result || "").trim())
      .find((text) => text.length > 0);
    return found || "";
  } catch (_) {
    return "";
  }
}

async function startRegionCapture(tabId, mode = "text") {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ["region-capture.js"]
    });
  } catch (err) {
    badgeTab(tabId, "X", "#dc2626");
    console.warn("[Captura Pro] Página não permite captura de região:", err);
    return false;
  }

  try {
    await chrome.tabs.sendMessage(
      tabId,
      { action: "startRegionCapture", mode },
      { frameId: 0 }
    );
    return true;
  } catch (err) {
    badgeTab(tabId, "X", "#dc2626");
    console.warn("[Captura Pro] Não foi possível iniciar a captura de região:", err);
    return false;
  }
}

async function openManualPanel(tabId, text, mode, notice) {
  // O painel é sempre aberto no frame principal para não ficar preso/recortado em iframes.
  const target = { tabId, frameIds: [0] };
  try {
    await chrome.scripting.executeScript({
      target,
      files: ["lz-string.min.js", "storage-utils.js", "manual-capture.js"]
    });
  } catch (err) {
    badgeTab(tabId, "X", "#dc2626");
    console.warn("[Captura Pro] Página não permite captura manual:", err);
    return;
  }

  try {
    await chrome.tabs.sendMessage(
      tabId,
      { action: "openManualPanel", text: text || "", mode: mode || "transcript", notice: notice || "" },
      { frameId: 0 }
    );
  } catch (err) {
    badgeTab(tabId, "X", "#dc2626");
    console.warn("[Captura Pro] Não foi possível abrir o painel de captura:", err);
  }
}

// ---------- OCR da região com Gemini Vision ----------
const OCR_PROMPT =
  "Transcreva fielmente todo o texto visível na imagem, preservando a ordem de leitura, as quebras de linha e a acentuação original. " +
  "Não resuma, não traduza, não comente e não invente conteúdo. " +
  "Se houver alternativas de múltipla escolha, mantenha cada alternativa em sua própria linha. " +
  "Se houver marcação de resposta correta, preserve a marca. Responda apenas com o texto transcrito.";

async function notifyPanel(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
  } catch (_) { /* painel fechado */ }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function cropDataUrl(dataUrl, rect, dpr) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = dpr > 0 ? dpr : 1;

  const sx = Math.max(0, Math.round(rect.left * scale));
  const sy = Math.max(0, Math.round(rect.top * scale));
  const sw = Math.max(1, Math.min(bitmap.width - sx, Math.round(rect.width * scale)));
  const sh = Math.max(1, Math.min(bitmap.height - sy, Math.round(rect.height * scale)));

  const canvas = new OffscreenCanvas(sw, sh);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  if (bitmap.close) bitmap.close();

  const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  return `data:image/jpeg;base64,${arrayBufferToBase64(await out.arrayBuffer())}`;
}

async function handleOcrImage(request, sender) {
  const tabId = sender?.tab?.id;
  const dataUrl = String(request?.dataUrl || "");

  if (!tabId) return { success: false, error: "Aba inválida." };
  if (!/^data:image\//i.test(dataUrl)) {
    await notifyPanel(tabId, { action: "ocrResult", error: "Imagem colada inválida." });
    return { success: false, error: "Imagem colada inválida." };
  }

  const settings = await AluraStore.get(["apiKey", "modelName", "ocrModelName"]);
  const apiKey = String(settings.apiKey || "").trim();

  if (!apiKey) {
    const error = "Configure a chave de API do Gemini nas opções para usar o OCR.";
    await notifyPanel(tabId, { action: "ocrResult", error });
    return { success: false, error };
  }

  await notifyPanel(tabId, { action: "ocrPending" });

  try {
    const result = await GeminiClient.describeImage({
      apiKey,
      model: settings.ocrModelName || settings.modelName,
      prompt: OCR_PROMPT,
      dataUrl,
      maxOutputTokens: 4096,
      temperature: 0,
      timeoutMs: 90000
    });

    await notifyPanel(tabId, {
      action: "ocrResult",
      text: result.text,
      model: result.model
    });
    return { success: true };
  } catch (err) {
    await notifyPanel(tabId, { action: "ocrResult", error: err.message });
    return { success: false, error: err.message };
  }
}

async function handleOcrRegion(request, sender) {
  const tabId = sender?.tab?.id;
  const rect = request?.rect;

  if (!tabId) return { success: false, error: "Aba inválida." };
  if (!rect || rect.width < 4 || rect.height < 4) {
    await notifyPanel(tabId, { action: "ocrResult", error: "Região inválida." });
    return { success: false, error: "Região inválida." };
  }

  const settings = await AluraStore.get(["apiKey", "modelName", "ocrModelName"]);
  const apiKey = String(settings.apiKey || "").trim();

  if (!apiKey) {
    const error = "Configure a chave de API do Gemini nas opções para usar o OCR.";
    await notifyPanel(tabId, { action: "ocrResult", error });
    return { success: false, error };
  }

  let cropped;

  try {
    const shot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format: "jpeg",
      quality: 85
    });
    cropped = await cropDataUrl(shot, rect, Number(request.dpr) || 1);
  } catch (err) {
    const error = `Não foi possível capturar a região: ${err.message}`;
    await notifyPanel(tabId, { action: "ocrResult", error });
    return { success: false, error };
  }

  await notifyPanel(tabId, { action: "ocrPending" });

  try {
    const result = await GeminiClient.describeImage({
      apiKey,
      model: settings.ocrModelName || settings.modelName,
      prompt: OCR_PROMPT,
      dataUrl: cropped,
      maxOutputTokens: 4096,
      temperature: 0,
      timeoutMs: 90000
    });

    await notifyPanel(tabId, {
      action: "ocrResult",
      text: result.text,
      model: result.model
    });
    return { success: true };
  } catch (err) {
    await notifyPanel(tabId, { action: "ocrResult", error: err.message });
    return { success: false, error: err.message };
  }
}

function badgeTab(tabId, text, color) {
  if (!tabId) return;
  try {
    chrome.action.setBadgeBackgroundColor({ tabId, color });
    chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => {
      try { chrome.action.setBadgeText({ tabId, text: "" }); } catch (_) {}
    }, 3000);
  } catch (_) { /* aba pode ter fechado */ }
}

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;

    if (info.menuItemId === REGION_MENU_CAPTURE) {
      startRegionCapture(tab.id);
      return;
    }

    if (
      info.menuItemId !== MANUAL_MENU_TRANSCRIPT &&
      info.menuItemId !== MANUAL_MENU_QUESTION
    ) return;

    const mode = info.menuItemId === MANUAL_MENU_QUESTION ? "question" : "transcript";
    openManualPanel(tab.id, info.selectionText || "", mode);
  });
}

// ---------- atalhos e clique no ícone ----------
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  const tabUrl = tab.url || tab.pendingUrl || "";
  const isLessonPage = /^https:\/\/cursos\.alura\.com\.br\//.test(tabUrl);
  if (isLessonPage) {
    chrome.tabs.sendMessage(tab.id, { action: "manualCapture" }, () => {
      if (chrome.runtime.lastError) {
        chrome.scripting
          .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
          .then(() => chrome.tabs.sendMessage(tab.id, { action: "manualCapture" }))
          .catch(() => {});
      }
    });
    return;
  }

  const text = await readSelection(tab.id);
  await openManualPanel(tab.id, text, "transcript");
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "save-selection") {
    const text = await readSelection(tab.id);
    await openManualPanel(tab.id, text, "transcript");
    return;
  }

  if (command === "capture-region") {
    await startRegionCapture(tab.id, "text");
    return;
  }

  chrome.tabs.sendMessage(tab.id, {
    action: command === "copy-question" ? "captureQuestion" : "manualCapture"
  }, () => void chrome.runtime.lastError);
});

// Serializa gravações para evitar que duas abas sobrescrevam uma à outra.
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => {});
  return next;
}

// ---------- mensagens ----------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handle = async () => {
    await ready();

    switch (request.action) {
      case "storeTranscript":
        return enqueueWrite(() => handleStoreTranscript(request, sender));
      case "storeQuestion":
        return enqueueWrite(() => handleStoreQuestion(request, sender));
      case "downloadFile":
        return downloadBlobFile(
          request.path,
          request.content,
          request.mimeType || "text/plain;charset=utf-8"
        ).then((downloadId) => ({ success: true, downloadId }));
      case "getStorageInfo":
        return getStorageInfo();
      case "exportAllData":
        return exportAllData(request.options || {});
      case "importAllData":
        return enqueueWrite(() => importAllData(request.payload));
      case "ensureMigration":
        return { success: true, courses: await ensureStorageVersion() };
      case "regionCaptured":
        if (sender?.tab?.id) {
          await openManualPanel(
            sender.tab.id,
            request.text || "",
            request.mode || "transcript",
            request.notice || ""
          );
        }
        return { success: true };
      case "startOcrRegion": {
        const ok = sender?.tab?.id
          ? await startRegionCapture(sender.tab.id, "ocr")
          : false;
        return {
          success: ok,
          error: ok ? "" : "A página não permite captura de região."
        };
      }
      case "regionCapturedForOcr":
        return handleOcrRegion(request, sender);
      case "ocrImage":
        return handleOcrImage(request, sender);
      case "renameCourse":
        return enqueueWrite(() => handleRenameCourse(request));
      case "mergeCourses":
        return enqueueWrite(() => handleMergeCourses(request));
      case "normalizeCourses":
        return enqueueWrite(() => handleNormalizeCourses());
      case "clearAllContent":
        return enqueueWrite(() => handleClearAllContent());
      case "regionCaptureCancelled":
        if (sender?.tab?.id) {
          await notifyPanel(sender.tab.id, { action: "ocrCancelled" });
        }
        return { success: true };
      default:
        return null;
    }
  };

  handle()
    .then((res) => {
      if (res !== null) sendResponse(res);
    })
    .catch((err) => sendResponse({ success: false, error: err.message }));

  return true;
});

// ---------- transcrições ----------
async function handleStoreTranscript(request, sender) {
  const { title, formattedText } = request;
  const store = await AluraStore.get([
    "rawContent",
    "savedTitles",
    "antiDuplicate",
    "courses",
    "captureCount",
    "autoBackupEvery"
  ]);

  const savedTitles = store.savedTitles || [];
  const normalizedTitle = String(title || "").trim().toLowerCase();
  const isManual = request.sourceType === "selection";
  const courseName = isManual
    ? manualCourseName(request.courseName || request.course || title)
    : normalizeCourseName(request.courseName || request.course || title);
  const courses = store.courses || {};
  const courseId = courseIdFor(courseName, isManual);
  const existingCourse = courses[courseId];
  const courseLessonExists = !!(
    existingCourse &&
    existingCourse.lessons &&
    existingCourse.lessons.some(
      (l) => String(l.title || "").trim().toLowerCase() === normalizedTitle
    )
  );

  // Anti-duplicação por curso: o mesmo título em cursos diferentes é permitido.
  if (store.antiDuplicate !== false && courseLessonExists) {
    badge(sender, "DUPL", "#f59e0b");
    return { success: true, isDuplicate: true, totalCount: countLessons(courses) };
  }

  let currentContent = store.rawContent || "";
  currentContent = currentContent.trim().length > 0 ? currentContent + "\n\n\n" + formattedText : formattedText;

  if (!savedTitles.some((t) => String(t).trim().toLowerCase() === normalizedTitle)) {
    savedTitles.push(title);
  }

  let transcript = request.transcript;
  if (!transcript) {
    transcript = String(formattedText || "").replace(/^\[Titulo\][\s\S]*?\n\n\[Texto\]\s*/, "");
  }

  addLessonToCourses(courses, courseName, {
    title,
    transcript,
    sourceUrl: request.sourceUrl || "",
    sourceType: request.sourceType || "alura",
    pageTitle: request.pageTitle || "",
    capturedAt: new Date().toISOString()
  }, { preserveName: isManual });

  const captureCount = (store.captureCount || 0) + 1;

  await AluraStore.set({
    rawContent: currentContent,
    savedTitles,
    courses,
    captureCount,
    lastLessonTitle: title
  });

  badge(sender, "OK", "#10b981");
  await maybeAutoBackup(captureCount, store.autoBackupEvery);

  return { success: true, isDuplicate: false, totalCount: countLessons(courses) };
}

function countLessons(courses) {
  return Object.values(courses || {}).reduce(
    (total, course) => total + (Array.isArray(course?.lessons) ? course.lessons.length : 0),
    0
  );
}

// ---------- questões ----------
async function handleStoreQuestion(request, sender) {
  const { question } = request;
  if (!question || !question.question) {
    return { success: false, error: "Questão inválida." };
  }

  const store = await AluraStore.get([
    "savedQuestions",
    "antiDuplicate",
    "captureCount",
    "autoBackupEvery"
  ]);

  const savedQuestions = store.savedQuestions || [];
  const existing = savedQuestions.find((q) => q.id === question.id);

  if (store.antiDuplicate !== false && existing) {
    badge(sender, "DUPL", "#f59e0b");
    return { success: true, isDuplicate: true, totalCount: savedQuestions.length };
  }

  const isManual = question.sourceType === "selection";
  const courseName = isManual
    ? manualCourseName(question.courseName || question.course || question.lesson)
    : normalizeCourseName(question.courseName || question.course || question.lesson);
  const enriched = {
    ...question,
    courseId: question.courseId || courseIdFor(courseName, isManual),
    courseName,
    capturedAt: question.capturedAt || new Date().toISOString()
  };

  if (existing) Object.assign(existing, enriched);
  else savedQuestions.push(enriched);

  const captureCount = (store.captureCount || 0) + 1;

  await AluraStore.set({
    savedQuestions,
    captureCount
  });

  badge(sender, "OK", "#10b981");
  await maybeAutoBackup(captureCount, store.autoBackupEvery);

  return { success: true, isDuplicate: false, totalCount: savedQuestions.length };
}

// ---------- gerenciamento de cursos ----------
async function handleRenameCourse(request) {
  const name = manualCourseName(request.newName);
  if (!name) return { success: false, error: "Informe um nome de curso válido." };

  const store = await AluraStore.get(["courses", "savedQuestions", "aiSummaries"]);
  const courses = store.courses || {};
  const questions = store.savedQuestions || [];
  const summaries = store.aiSummaries || [];

  if (!courses[request.courseId]) {
    return { success: false, error: "Curso não encontrado." };
  }

  const updated = applyCourseName(courses, questions, summaries, request.courseId, name);

  await AluraStore.set({
    courses,
    savedQuestions: questions,
    aiSummaries: summaries
  });

  return {
    success: true,
    courseId: updated?.id || "",
    name: updated?.name || name
  };
}

async function handleMergeCourses(request) {
  const sourceId = String(request.sourceId || "");
  const targetId = String(request.targetId || "");

  if (!sourceId || !targetId || sourceId === targetId) {
    return { success: false, error: "Escolha dois cursos diferentes." };
  }

  const store = await AluraStore.get(["courses", "savedQuestions", "aiSummaries"]);
  const courses = store.courses || {};
  const questions = store.savedQuestions || [];
  const summaries = store.aiSummaries || [];

  if (!courses[sourceId] || !courses[targetId]) {
    return { success: false, error: "Curso não encontrado." };
  }

  mergeCourseInto(courses, questions, summaries, sourceId, targetId);

  await AluraStore.set({
    courses,
    savedQuestions: questions,
    aiSummaries: summaries
  });

  return { success: true, targetId, name: courses[targetId].name };
}

async function handleNormalizeCourses() {
  const store = await AluraStore.get(["courses", "savedQuestions", "aiSummaries"]);
  const courses = store.courses || {};
  const questions = store.savedQuestions || [];
  const summaries = store.aiSummaries || [];
  const changes = [];
  const targetByName = new Map();

  for (const oldId of Object.keys(courses)) {
    const course = courses[oldId];
    if (!course) continue;

    const previousName = course.name || oldId;
    const name = manualCourseName(previousName);
    const newId = courseIdFor(name, true);

    if (targetByName.has(name)) {
      const targetId = targetByName.get(name);
      mergeCourseInto(courses, questions, summaries, oldId, targetId);
      changes.push({ from: previousName, to: courses[targetId]?.name || name, merged: true });
      continue;
    }

    if (courses[newId] && newId !== oldId) {
      mergeCourseInto(courses, questions, summaries, oldId, newId);
      targetByName.set(name, newId);
      changes.push({ from: previousName, to: courses[newId]?.name || name, merged: true });
      continue;
    }

    if (newId !== oldId) {
      delete courses[oldId];
      course.id = newId;
      course.name = name;
      course.updatedAt = new Date().toISOString();
      courses[newId] = course;
      questions.forEach((question) => {
        if (question.courseId === oldId) {
          question.courseId = newId;
          question.courseName = name;
        }
      });
      summaries.forEach((summary) => {
        if (summary.courseId === oldId) {
          summary.courseId = newId;
          summary.courseName = name;
        }
      });
    } else if (course.name !== name) {
      course.name = name;
      course.updatedAt = new Date().toISOString();
      questions.forEach((question) => {
        if (question.courseId === oldId) question.courseName = name;
      });
      summaries.forEach((summary) => {
        if (summary.courseId === oldId) summary.courseName = name;
      });
    }

    targetByName.set(name, newId);
    changes.push({ from: previousName, to: name, merged: false });
  }

  await AluraStore.set({
    courses,
    savedQuestions: questions,
    aiSummaries: summaries
  });

  return { success: true, changes, courses };
}

async function handleClearAllContent() {
  await AluraStore.remove([
    "courses",
    "rawContent",
    "savedTitles",
    "savedQuestions",
    "aiSummaries",
    "summaryCache",
    "captureCount"
  ]);

  return { success: true };
}

function badge(sender, text, color) {
  if (!sender?.tab?.id) return;
  try {
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color });
    chrome.action.setBadgeText({ tabId: sender.tab.id, text });
    setTimeout(() => {
      try { chrome.action.setBadgeText({ tabId: sender.tab.id, text: "" }); } catch (_) {}
    }, 3000);
  } catch (_) { /* aba pode ter fechado */ }
}

// ---------- backup automático ----------
async function maybeAutoBackup(count, everyFromStore) {
  let every = Number(everyFromStore) || 0;
  if (!every) {
    const data = await AluraStore.get(["autoBackupEvery"]);
    every = Number(data.autoBackupEvery) || 0;
  }
  if (!every || every <= 0 || count % every !== 0) return;

  try {
    await exportAllData({ auto: true });
  } catch (err) {
    console.warn("[Captura Pro] Falha no backup automático:", err);
  }
}

// ---------- armazenamento ----------
async function getStorageInfo() {
  const [data, meta] = await Promise.all([AluraStore.getAll(), AluraStore.getMeta()]);

  const logicalBytes = byteLength(JSON.stringify(data));
  let actualBytes = logicalBytes;
  try {
    actualBytes = await chrome.storage.local.getBytesInUse(null);
  } catch (_) {
    const raw = await chrome.storage.local.get(null);
    actualBytes = byteLength(JSON.stringify(raw));
  }

  const compressedKeys = Object.keys(meta).filter((k) => meta[k].compressed);
  const idbKeys = Object.keys(meta).filter((k) => meta[k].idb);
  const idbBytes = idbKeys.reduce((total, k) => total + (meta[k].storedBytes || 0), 0);

  return {
    success: true,
    bytesUsed: actualBytes,
    logicalBytes,
    idbBytes,
    compressedKeys,
    idbKeys,
    quotaBytes: STORAGE_QUOTA_BYTES,
    percent: Math.min(999, Math.round((actualBytes / STORAGE_QUOTA_BYTES) * 100)),
    nearLimit: actualBytes > STORAGE_QUOTA_BYTES * 0.8
  };
}

async function exportAllData(options = {}) {
  const data = await AluraStore.getAll();
  const safeData = { ...data };
  delete safeData.apiKey;
  delete safeData["__aluraLargeKeys"];

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const prefix = options.auto ? "alura_backup_auto" : "alura_export";
  const filename = sanitizeFilename(`${prefix}_${stamp}.json`);
  const content = JSON.stringify(safeData, null, 2);

  const downloadId = await downloadBlobFile(filename, content, "application/json;charset=utf-8");
  return { success: true, downloadId, filename, bytes: byteLength(content) };
}

async function importAllData(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload de importação inválido.");
  }

  const current = await AluraStore.getAll();
  const merged = { ...current, ...payload };
  delete merged["__aluraLargeKeys"];

  // Nunca permite importar apiKey vazia sobrescrevendo uma existente.
  if (!payload.apiKey && current.apiKey) {
    merged.apiKey = current.apiKey;
  }

  await AluraStore.set(merged);
  await ensureStorageVersion();

  return { success: true, importedKeys: Object.keys(payload) };
}

// ---------- download ----------
function downloadBlobFile(filenamePath, textContent, mimeType) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([textContent], { type: mimeType });
    const reader = new FileReader();

    reader.onload = function () {
      chrome.downloads.download(
        {
          url: reader.result,
          filename: sanitizeFilename(filenamePath),
          saveAs: false
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(downloadId);
          }
        }
      );
    };

    reader.onerror = () => reject(new Error("Falha ao gerar arquivo para download"));
    reader.readAsDataURL(blob);
  });
}
