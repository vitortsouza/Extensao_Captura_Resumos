// options.js - Controlador da página de configurações v2.15.1
/* global AluraStore, LZString */

const DEFAULT_PROMPT =
  "Você é um assistente pedagógico especializado. Faça um resumo estruturado, didático e completo da seguinte aula.\n" +
  "IMPORTANTE: Comece DIRETAMENTE pelo título ou conteúdo do resumo. NÃO inclua saudações, introduções ou frases de abertura como 'Aqui está o resumo...', 'Com certeza...', ou 'Segue o resumo solicitado'. Vá direto aos tópicos.\n" +
  "Destaque:\n" +
  "1) Conceitos principais\n" +
  "2) Pontos práticos e exemplos citados\n" +
  "3) Dicas e conclusões essenciais.\n\n" +
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

const CACHE_LIMIT = 50;

document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);

  // ---------- elementos ----------
  const subfolderInput = $("subfolder");
  const filenameInput = $("filename");
  const antiDuplicateCheckbox = $("antiDuplicate");
  const autoCaptureCheckbox = $("autoCaptureOnNextVideo");
  const autoBackupEveryInput = $("autoBackupEvery");
  const btnSaveConfig = $("btnSaveConfig");
  const courseManagerList = $("courseManagerList");
  const mergeSource = $("mergeSource");
  const mergeTarget = $("mergeTarget");
  const btnMergeCourses = $("btnMergeCourses");
  const btnNormalizeCourses = $("btnNormalizeCourses");

  const countLessonsEl = $("countLessons");
  const countCoursesEl = $("countCourses");
  const sizeLessonsEl = $("sizeLessons");
  const storageUsageEl = $("storageUsage");
  const storageModeEl = $("storageMode");
  const rawPreviewEl = $("rawPreview");
  const transcriptSearchInput = $("transcriptSearch");
  const transcriptCourseFilter = $("transcriptCourseFilter");
  const btnDownloadTxt = $("btnDownloadTxt");
  const btnDownloadMd = $("btnDownloadMd");
  const editRawTextarea = $("editRaw");
  const btnSaveRawEdit = $("btnSaveRawEdit");
  const btnResetRaw = $("btnResetRaw");
  const courseSelect = $("courseSelect");
  const btnDownloadCourse = $("btnDownloadCourse");
  const btnDeleteCourse = $("btnDeleteCourse");
  const deleteCourseCascadeCheckbox = $("deleteCourseCascade");
  const btnClearRaw = $("btnClearRaw");

  const countQuestionsEl = $("countQuestions");
  const questionAutoCaptureCheckbox = $("questionAutoCapture");
  const questionSearchInput = $("questionSearch");
  const questionCourseFilter = $("questionCourseFilter");
  const questionsListEl = $("questionsList");
  const btnDownloadQuestionsTxt = $("btnDownloadQuestionsTxt");
  const btnDownloadQuestionsMd = $("btnDownloadQuestionsMd");
  const btnDownloadQuestionsAnki = $("btnDownloadQuestionsAnki");
  const btnDownloadStudyGuide = $("btnDownloadStudyGuide");
  const btnClearQuestions = $("btnClearQuestions");

  const btnStartQuiz = $("btnStartQuiz");
  const quizShuffleCheckbox = $("quizShuffle");
  const quizArea = $("quizArea");
  const quizProgressEl = $("quizProgress");
  const quizScoreEl = $("quizScore");
  const quizQuestionEl = $("quizQuestion");
  const quizOptionsEl = $("quizOptions");
  const quizFeedbackEl = $("quizFeedback");
  const quizNextBtn = $("quizNext");
  const quizRestartBtn = $("quizRestart");
  const quizFinalEl = $("quizFinal");

  const apiKeyInput = $("apiKey");
  const btnToggleApiKey = $("btnToggleApiKey");
  const modelSelect = $("modelSelect");
  const ocrModelSelect = $("ocrModelSelect");
  const newModelInput = $("newModelInput");
  const btnAddModel = $("btnAddModel");
  const btnRemoveModel = $("btnRemoveModel");
  const promptCustomInput = $("promptCustom");
  const summarizeCourseOnlyCheckbox = $("summarizeCourseOnly");
  const useSummaryCacheCheckbox = $("useSummaryCache");
  const tokenEstimateEl = $("tokenEstimate");
  const btnSaveApi = $("btnSaveApi");
  const btnResetPrompt = $("btnResetPrompt");
  const btnSummarizeWithGemini = $("btnSummarizeWithGemini");
  const aiLoading = $("aiLoading");
  const btnTestVision = $("btnTestVision");
  const btnCopyVision = $("btnCopyVision");
  const visionCopyStatus = $("visionCopyStatus");
  const visionDrop = $("visionDrop");
  const visionStatus = $("visionStatus");
  const visionResult = $("visionResult");

  const summariesCountEl = $("summariesCount");
  const summarySearchInput = $("summarySearch");
  const summaryListEl = $("summaryList");
  const btnMergeSummariesTxt = $("btnMergeSummariesTxt");
  const btnMergeSummariesMd = $("btnMergeSummariesMd");
  const btnClearSummaries = $("btnClearSummaries");
  const editSummariesTextarea = $("editSummaries");
  const btnSaveSummariesEdit = $("btnSaveSummariesEdit");
  const btnResetSummaries = $("btnResetSummaries");

  const btnExportConfig = $("btnExportConfig");
  const btnImportConfig = $("btnImportConfig");
  const fileImportConfig = $("fileImportConfig");

  const btnToggleTheme = $("btnToggleTheme");
  const btnClearAll = $("btnClearAll");
  const globalAlert = $("globalAlert");

  // ---------- estado ----------
  const state = {
    courses: {},
    questions: [],
    summaries: [],
    rawContent: "",
    settings: {}
  };

  // Nome dos cursos exibidos no filtro de questões (inclui cursos só com questões).
  const selectorCourseNames = new Map();

  const quiz = {
    active: false,
    items: [],
    index: 0,
    score: 0,
    answered: false
  };

  // ---------- helpers ----------
  function showAlert(msg, type = "success", duration = 4000) {
    globalAlert.className = `alert alert-${type}`;
    globalAlert.textContent = msg;
    globalAlert.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (duration > 0) {
      setTimeout(() => { globalAlert.style.display = "none"; }, duration);
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function truncate(text, max = 420) {
    const value = String(text || "");
    return value.length > max ? value.slice(0, max).trimEnd() + "…" : value;
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "secao";
  }

  function fmtBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  }

  function csvField(value) {
    return `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res || {});
          }
        });
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  }

  function downloadPath(filename) {
    const subfolder = (subfolderInput.value || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "");
    return subfolder ? `${subfolder}/${filename}` : filename;
  }

  async function downloadText(filename, content, mimeType = "text/plain;charset=utf-8") {
    const path = downloadPath(filename);
    const res = await sendMessage({ action: "downloadFile", path, content, mimeType });
    if (!res.success) throw new Error(res.error || "Falha ao baixar arquivo");
    return path;
  }

  function courseNameOfQuestion(q) {
    return q.courseName || state.courses[q.courseId]?.name || q.course || "Curso";
  }

  function courseTranscript(course) {
    if (!course || !Array.isArray(course.lessons) || course.lessons.length === 0) return "";
    return course.lessons
      .map((lesson) => `## ${lesson.title}\n\n${lesson.transcript || ""}`)
      .join("\n\n");
  }

  function currentCourseScopeContent() {
    if (!summarizeCourseOnlyCheckbox.checked) return state.rawContent || "";
    const course = state.courses[courseSelect.value];
    return courseTranscript(course);
  }

  // ---------- tema ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("user-theme", theme);
    btnToggleTheme.textContent = theme === "dark" ? "☀️" : "🌙";
  }

  applyTheme(localStorage.getItem("user-theme") || "dark");

  // ---------- abas ----------
  const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
  const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));

  function activateTab(name) {
    const target = tabPanels.some((panel) => panel.dataset.tabPanel === name) ? name : "content";

    tabButtons.forEach((button) => {
      const active = button.dataset.tab === target;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== target;
    });

    localStorage.setItem("options-active-tab", target);
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });
  activateTab(localStorage.getItem("options-active-tab") || "content");

  btnToggleTheme.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  // ---------- carga de dados ----------
  async function loadData() {
    try {
      await sendMessage({ action: "ensureMigration" });
      const data = await AluraStore.get(null);

      state.courses = data.courses && typeof data.courses === "object" ? data.courses : {};
      state.questions = Array.isArray(data.savedQuestions) ? data.savedQuestions : [];
      state.summaries = Array.isArray(data.aiSummaries) ? data.aiSummaries : [];
      state.rawContent = data.rawContent || "";
      state.settings = {
        subfolder: data.subfolder !== undefined ? data.subfolder : "Transcricoes",
        filename: data.filename || "transcricoes_acumuladas.txt",
        antiDuplicate: data.antiDuplicate !== false,
        autoCaptureOnNextVideo: data.autoCaptureOnNextVideo !== undefined ? data.autoCaptureOnNextVideo : false,
        questionAutoCapture: data.questionAutoCapture !== undefined ? data.questionAutoCapture : false,
        autoBackupEvery: Number(data.autoBackupEvery) || 0
      };

      subfolderInput.value = state.settings.subfolder;
      filenameInput.value = state.settings.filename;
      antiDuplicateCheckbox.checked = state.settings.antiDuplicate;
      autoCaptureCheckbox.checked = state.settings.autoCaptureOnNextVideo;
      questionAutoCaptureCheckbox.checked = state.settings.questionAutoCapture;
      autoBackupEveryInput.value = state.settings.autoBackupEvery || 0;

      apiKeyInput.value = data.apiKey || "";

      const models = data.availableModels && data.availableModels.length > 0
        ? data.availableModels
        : DEFAULT_MODELS;
      populateModelSelect(models, data.modelName || DEFAULT_MODELS[0]);
      populateOcrModelSelect(models, data.ocrModelName || "");

      const isOldPrompt = !data.promptCustom || !data.promptCustom.includes("NÃO inclua saudações");
      let promptValue = isOldPrompt ? DEFAULT_PROMPT : data.promptCustom;
      if (promptValue.includes("aula da Alura")) {
        promptValue = promptValue.replace(/aula da Alura/g, "aula");
      }
      promptCustomInput.value = promptValue;
      if (isOldPrompt || promptValue !== data.promptCustom) {
        await AluraStore.set({ promptCustom: promptValue });
      }

      renderRawPreview(state.rawContent);
      renderCourseSelectors();
      renderCourseManager();
      renderQuestions();
      renderSummaries();
      if (editRawTextarea) editRawTextarea.value = state.rawContent;
      syncEditSummaries();

      updateTokenEstimate();
      await checkStorageQuota();
    } catch (err) {
      console.error(err);
      showAlert(`Erro ao carregar dados: ${err.message}`, "danger", 8000);
    }
  }

  async function checkStorageQuota() {
    try {
      const res = await sendMessage({ action: "getStorageInfo" });
      if (res && res.success) {
        storageUsageEl.textContent = `${res.percent}%`;
        storageUsageEl.parentElement.style.color = res.nearLimit ? "var(--danger)" : "var(--text-muted)";

        const parts = [];
        if (res.compressedKeys?.length) parts.push(`🗜️ ${res.compressedKeys.length} comprimido(s)`);
        if (res.idbKeys?.length) parts.push(`🗄️ ${res.idbKeys.length} no IndexedDB`);
        storageModeEl.textContent = parts.length ? parts.join(" · ") : "sem compressão";

        if (res.nearLimit) {
          showAlert(
            `⚠️ O armazenamento local está em ${res.percent}% da cota estimada. Baixe e limpe o histórico, ou aumente o backup automático.`,
            "warning",
            9000
          );
        }
      }
    } catch (_) {
      storageUsageEl.textContent = "n/d";
    }
  }

  function populateModelSelect(modelsList, selectedModel) {
    modelSelect.innerHTML = "";
    modelsList.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      if (m === selectedModel) opt.selected = true;
      modelSelect.appendChild(opt);
    });
  }

  function populateOcrModelSelect(modelsList, selectedModel) {
    if (!ocrModelSelect) return;
    ocrModelSelect.innerHTML = "";

    const auto = document.createElement("option");
    auto.value = "";
    auto.textContent = "Usar o modelo ativo";
    ocrModelSelect.appendChild(auto);

    modelsList.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      if (m === selectedModel) opt.selected = true;
      ocrModelSelect.appendChild(opt);
    });
  }

  // ---------- gerenciar cursos ----------
  function renderCourseManager() {
    if (!courseManagerList) return;

    const courses = Object.values(state.courses)
      .filter((course) => course && course.id)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));

    if (courses.length === 0) {
      courseManagerList.innerHTML = '<div class="empty-state">Nenhum curso com aulas capturadas.</div>';
    } else {
      courseManagerList.innerHTML = courses
        .map((course) => {
          const questionCount = state.questions.filter(
            (q) => q.courseId === course.id || courseNameOfQuestion(q) === course.name
          ).length;
          return `
            <div class="item-card">
              <div class="item-actions">
                <button class="icon-btn" data-rename-course="${escapeHtml(course.id)}" title="Renomear curso">✏️</button>
              </div>
              <h4>${escapeHtml(course.name || course.id)}</h4>
              <div class="meta">${(course.lessons || []).length} aula(s) · ${questionCount} questão(ões)</div>
            </div>`;
        })
        .join("");
    }

    const previousSource = mergeSource.value;
    const previousTarget = mergeTarget.value;
    const optionsHtml = courses
      .map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.name || course.id)}</option>`)
      .join("");

    mergeSource.innerHTML = optionsHtml || '<option value="">—</option>';
    mergeTarget.innerHTML = optionsHtml || '<option value="">—</option>';

    if (previousSource && courses.some((course) => course.id === previousSource)) {
      mergeSource.value = previousSource;
    }
    if (previousTarget && courses.some((course) => course.id === previousTarget)) {
      mergeTarget.value = previousTarget;
    }
    if (courses.length > 1 && mergeTarget.value === mergeSource.value) {
      const other = courses.find((course) => course.id !== mergeSource.value);
      if (other) mergeTarget.value = other.id;
    }
  }

  if (courseManagerList) {
    courseManagerList.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-rename-course]");
      if (!button) return;

      const courseId = button.getAttribute("data-rename-course");
      const current = state.courses[courseId]?.name || "";
      const newName = prompt("Novo nome do curso:", current);
      if (!newName || !newName.trim() || newName.trim() === current) return;

      const res = await sendMessage({
        action: "renameCourse",
        courseId,
        newName: newName.trim()
      });

      if (!res.success) {
        showAlert(res.error || "Falha ao renomear o curso.", "danger");
        return;
      }

      await loadData();
      showAlert(`✓ Curso renomeado para "${res.name}".`, "success");
    });
  }

  if (btnMergeCourses) {
    btnMergeCourses.addEventListener("click", async () => {
      const sourceId = mergeSource.value;
      const targetId = mergeTarget.value;

      if (!sourceId || !targetId || sourceId === targetId) {
        showAlert("Escolha dois cursos diferentes para unir.", "danger");
        return;
      }

      const sourceName = state.courses[sourceId]?.name || sourceId;
      const targetName = state.courses[targetId]?.name || targetId;

      if (!confirm(`Unir "${sourceName}" em "${targetName}"?\n\nAulas, questões e resumos serão movidos.`)) {
        return;
      }

      const res = await sendMessage({ action: "mergeCourses", sourceId, targetId });
      if (!res.success) {
        showAlert(res.error || "Falha ao unir os cursos.", "danger");
        return;
      }

      await loadData();
      showAlert(`✓ Cursos unidos em "${res.name}".`, "success");
    });
  }

  if (btnNormalizeCourses) {
    btnNormalizeCourses.addEventListener("click", async () => {
      if (!confirm("Normalizar os nomes de todos os cursos e unir duplicados?")) return;

      const res = await sendMessage({ action: "normalizeCourses" });
      if (!res.success) {
        showAlert(res.error || "Falha ao normalizar os cursos.", "danger");
        return;
      }

      const changes = res.changes || [];
      const merged = changes.filter((change) => change.merged).length;

      await loadData();
      showAlert(`✓ ${changes.length} curso(s) revisado(s), ${merged} unido(s).`, "success", 6000);
    });
  }

  // ---------- render: transcrições ----------
  function parseRawBlocks(content) {
    const blocks = [];
    const re = /\[Titulo\]\s*([\s\S]*?)\n\n\[Texto\]\s*([\s\S]*?)(?=\n\n\n\[Titulo\]|$)/g;
    let match;
    while ((match = re.exec(String(content || ""))) !== null) {
      blocks.push({ title: (match[1] || "").trim(), transcript: (match[2] || "").trim() });
    }
    return blocks;
  }

  function filteredTranscriptContent(content) {
    const text = transcriptSearchInput.value.trim().toLowerCase();
    const courseId = transcriptCourseFilter.value;
    if (!text && !courseId) return content;

    let blocks;
    if (courseId && state.courses[courseId]) {
      blocks = (state.courses[courseId].lessons || []).map((lesson) => ({
        title: lesson.title,
        transcript: lesson.transcript || ""
      }));
    } else {
      blocks = parseRawBlocks(content);
    }

    blocks = blocks.filter((block) => {
      if (!text) return true;
      return `${block.title} ${block.transcript}`.toLowerCase().includes(text);
    });

    if (blocks.length === 0) return "";
    return blocks
      .map((block) => `[Titulo] ${block.title}\n\n[Texto] ${block.transcript}`)
      .join("\n\n\n");
  }

  function renderRawPreview(content) {
    const lessonCount = Object.values(state.courses).reduce(
      (total, course) => total + (course.lessons?.length || 0),
      0
    );
    const fallbackCount = (String(content).match(/\[Titulo\]/g) || []).length;

    countLessonsEl.textContent = String(lessonCount || fallbackCount);
    countCoursesEl.textContent = String(questionFilterCourses().length);

    if (!content || !String(content).trim()) {
      rawPreviewEl.textContent =
        "Nenhuma transcrição acumulada ainda. Clique no ícone da extensão ou pressione Alt + C em uma página de aula compatível para começar!";
      sizeLessonsEl.textContent = "0 KB";
      return;
    }

    const visible = filteredTranscriptContent(content);
    const hasFilter = !!(transcriptSearchInput.value.trim() || transcriptCourseFilter.value);

    if (!visible.trim() && hasFilter) {
      rawPreviewEl.textContent = "Nenhuma transcrição encontrada com os filtros atuais.";
    } else {
      rawPreviewEl.textContent = visible;
    }

    sizeLessonsEl.textContent = (new Blob([content]).size / 1024).toFixed(1) + " KB";
  }

  transcriptSearchInput.addEventListener("input", () => renderRawPreview(state.rawContent));
  transcriptCourseFilter.addEventListener("change", () => renderRawPreview(state.rawContent));

  // Cursos do filtro de questões: inclui cursos que existem apenas em questões manuais.
  function questionFilterCourses() {
    const list = Object.values(state.courses)
      .filter((course) => course && course.id)
      .map((course) => ({ id: course.id, name: course.name || course.id, lessons: course.lessons || [] }));

    const byName = new Map(list.map((course) => [String(course.name), course]));
    const usedIds = new Set(list.map((course) => String(course.id)));

    for (const question of state.questions) {
      const name = String(courseNameOfQuestion(question) || "").trim();
      if (!name || byName.has(name)) continue;

      let id = question.courseId ? String(question.courseId) : "";
      if (!id || usedIds.has(id)) id = `question:${name}`;

      const course = { id, name, lessons: [] };
      usedIds.add(id);
      byName.set(name, course);
      list.push(course);
    }

    return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  }

  function hasOptionValue(select, value) {
    return Array.from(select.options).some((option) => option.value === value);
  }

  function renderCourseSelectors() {
    const courses = Object.values(state.courses)
      .filter((course) => course && course.id)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
    const questionCourses = questionFilterCourses();

    const previousCourse = courseSelect.value;
    const previousFilter = questionCourseFilter.value;
    const previousTranscriptFilter = transcriptCourseFilter.value;

    courseSelect.innerHTML = '<option value="">Todos os cursos</option>';
    questionCourseFilter.innerHTML = '<option value="">Todos os cursos</option>';
    transcriptCourseFilter.innerHTML = '<option value="">Todos os cursos</option>';
    selectorCourseNames.clear();

    for (const course of courses) {
      const label = course.name || course.id;
      selectorCourseNames.set(String(course.id), label);

      const optA = document.createElement("option");
      optA.value = course.id;
      optA.textContent = `${label} (${course.lessons?.length || 0})`;
      courseSelect.appendChild(optA);

      const optC = document.createElement("option");
      optC.value = course.id;
      optC.textContent = label;
      transcriptCourseFilter.appendChild(optC);
    }

    for (const course of questionCourses) {
      const label = course.name || course.id;
      selectorCourseNames.set(String(course.id), label);

      const optB = document.createElement("option");
      optB.value = course.id;
      optB.textContent = label;
      questionCourseFilter.appendChild(optB);
    }

    if (previousCourse && hasOptionValue(courseSelect, previousCourse)) {
      courseSelect.value = previousCourse;
    }
    if (previousFilter && hasOptionValue(questionCourseFilter, previousFilter)) {
      questionCourseFilter.value = previousFilter;
    }
    if (previousTranscriptFilter && hasOptionValue(transcriptCourseFilter, previousTranscriptFilter)) {
      transcriptCourseFilter.value = previousTranscriptFilter;
    }
  }

  // ---------- render: questões ----------
  function filteredQuestions() {
    const text = questionSearchInput.value.trim().toLowerCase();
    const courseId = questionCourseFilter.value;

    const selectedName = courseId ? selectorCourseNames.get(String(courseId)) : "";

    return state.questions.filter((q) => {
      const matchesCourse =
        !courseId ||
        q.courseId === courseId ||
        (selectedName && courseNameOfQuestion(q) === selectedName);

      const haystack = [
        q.question,
        q.lesson,
        q.course,
        q.courseName,
        q.correctExplanation,
        ...(q.options || []).map((o) => o.text)
      ]
        .join(" ")
        .toLowerCase();

      return matchesCourse && (!text || haystack.includes(text));
    });
  }

  function renderQuestions() {
    const questions = filteredQuestions();
    countQuestionsEl.textContent = String(state.questions.length);

    if (questions.length === 0) {
      const msg = state.questions.length === 0
        ? "Nenhuma questão capturada ainda. Acesse uma página com questões e pressione Alt + Q ou use Alt + S!"
        : "Nenhuma questão encontrada com os filtros atuais.";
      questionsListEl.innerHTML = `<div class="empty-state">${escapeHtml(msg)}</div>`;
      return;
    }

    questionsListEl.innerHTML = questions
      .map((q) => {
        const correct = (q.options || []).find((o) => o.correct);
        const answer = q.correctLabel
          ? `${q.correctLabel}) ${q.correctText || correct?.text || ""}`
          : "Resposta não identificada";
        const options = (q.options || [])
          .map((o) => `${escapeHtml(o.label)}) ${escapeHtml(o.text)}`)
          .join("<br>");

        return `
          <div class="item-card">
            <div class="item-actions">
              <button class="icon-btn" data-delete-question="${escapeHtml(q.id)}" title="Apagar questão">🗑️</button>
            </div>
            <h4>${escapeHtml(q.lesson || "Aula")}</h4>
            <div class="meta">${escapeHtml(courseNameOfQuestion(q))}</div>
            <div class="question-text">${escapeHtml(q.question)}</div>
            <div class="meta">${options}</div>
            <div class="answer">✓ ${escapeHtml(answer)}</div>
            ${q.correctExplanation ? `<div class="explanation">${escapeHtml(q.correctExplanation)}</div>` : ""}
          </div>`;
      })
      .join("");
  }

  questionsListEl.addEventListener("click", async (evt) => {
    const btn = evt.target.closest("[data-delete-question]");
    if (!btn) return;
    const id = btn.getAttribute("data-delete-question");
    if (!confirm("Apagar esta questão permanentemente?")) return;

    state.questions = state.questions.filter((q) => String(q.id) !== String(id));
    await AluraStore.set({ savedQuestions: state.questions });
    stopQuiz();
    renderCourseSelectors();
    renderQuestions();
    await checkStorageQuota();
    showAlert("Questão apagada.", "info");
  });

  questionSearchInput.addEventListener("input", renderQuestions);
  questionCourseFilter.addEventListener("change", renderQuestions);

  // ---------- render: resumos ----------
  function filteredSummaries() {
    const text = summarySearchInput.value.trim().toLowerCase();
    if (!text) return state.summaries;
    return state.summaries.filter((s) =>
      [s.content, s.model, s.filename, s.courseName].join(" ").toLowerCase().includes(text)
    );
  }

  function renderSummaries() {
    const summaries = filteredSummaries();
    summariesCountEl.textContent = String(state.summaries.length);

    if (summaries.length === 0) {
      summaryListEl.innerHTML = `<div class="empty-state">${
        state.summaries.length === 0
          ? "Nenhum resumo da IA gerado ainda."
          : "Nenhum resumo encontrado com a busca atual."
      }</div>`;
      return;
    }

    summaryListEl.innerHTML = summaries
      .map((s) => {
        const course = s.courseName || (s.courseId ? state.courses[s.courseId]?.name : "") || "Geral";
        return `
          <div class="item-card">
            <div class="item-actions">
              <button class="icon-btn" data-delete-summary="${escapeHtml(s.id || s.filename)}" title="Apagar resumo">🗑️</button>
            </div>
            <h4>${escapeHtml(s.filename || "Resumo")}</h4>
            <div class="meta">${escapeHtml(s.model || "Gemini")} · ${escapeHtml(s.date || "")} · ${escapeHtml(course)}</div>
            <div class="explanation">${escapeHtml(truncate(s.content, 480))}</div>
          </div>`;
      })
      .join("");
  }

  summaryListEl.addEventListener("click", async (evt) => {
    const btn = evt.target.closest("[data-delete-summary]");
    if (!btn) return;
    const id = btn.getAttribute("data-delete-summary");
    if (!confirm("Apagar este resumo permanentemente?")) return;

    state.summaries = state.summaries.filter(
      (s) => String(s.id || s.filename) !== String(id)
    );
    await AluraStore.set({ aiSummaries: state.summaries });
    renderSummaries();
    syncEditSummaries();
    await checkStorageQuota();
    showAlert("Resumo apagado.", "info");
  });

  summarySearchInput.addEventListener("input", renderSummaries);

  // ---------- token estimate ----------
  function updateTokenEstimate() {
    const content = currentCourseScopeContent();
    const full = `${promptCustomInput.value || ""}\n${content}`;
    const tokens = AluraStore.estimateTokens(full);
    const warn = tokens > 900000;

    tokenEstimateEl.classList.toggle("warn", warn);
    tokenEstimateEl.innerHTML =
      `Tokens estimados do conteúdo: <b>${tokens.toLocaleString("pt-BR")}</b>` +
      ` · ${fmtBytes(content.length)} de texto` +
      (warn ? " · ⚠️ acima do limite confortável do modelo" : "");
  }

  promptCustomInput.addEventListener("input", updateTokenEstimate);
  courseSelect.addEventListener("change", updateTokenEstimate);
  summarizeCourseOnlyCheckbox.addEventListener("change", updateTokenEstimate);

  // ---------- quiz ----------
  function stopQuiz() {
    quiz.active = false;
    quiz.items = [];
    quiz.index = 0;
    quiz.score = 0;
    quiz.answered = false;
    quizArea.style.display = "none";
    quizFinalEl.style.display = "none";
    quizFeedbackEl.className = "quiz-feedback";
    quizFeedbackEl.textContent = "";
  }

  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function startQuiz() {
    const candidates = filteredQuestions().filter(
      (q) => q.correctLabel || (q.options || []).some((o) => o.correct)
    );

    if (candidates.length === 0) {
      showAlert("Não há questões com resposta identificada para montar o quiz.", "info");
      return;
    }

    quiz.items = quizShuffleCheckbox.checked ? shuffle(candidates) : candidates.slice();
    quiz.index = 0;
    quiz.score = 0;
    quiz.answered = false;
    quiz.active = true;
    quizArea.style.display = "block";
    quizFinalEl.style.display = "none";
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    if (!quiz.active) return;

    if (quiz.index >= quiz.items.length) {
      renderQuizFinal();
      return;
    }

    const q = quiz.items[quiz.index];
    const correct = q.correctLabel || (q.options || []).find((o) => o.correct)?.label || "?";

    quizProgressEl.textContent = `Questão ${quiz.index + 1} de ${quiz.items.length}`;
    quizScoreEl.textContent = `Acertos: ${quiz.score}`;
    quizQuestionEl.textContent = q.question;
    quizFeedbackEl.className = "quiz-feedback";
    quizFeedbackEl.textContent = "";
    quizNextBtn.style.display = "none";
    quizFinalEl.style.display = "none";
    quiz.answered = false;

    quizOptionsEl.innerHTML = "";
    (q.options || []).forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-option";
      button.textContent = `${option.label}) ${option.text}`;
      button.addEventListener("click", () => answerQuiz(option, correct, q));
      quizOptionsEl.appendChild(button);
    });
  }

  function answerQuiz(option, correctLabel, q) {
    if (!quiz.active || quiz.answered) return;
    quiz.answered = true;

    const isCorrect = option.correct || option.label === correctLabel;
    if (isCorrect) quiz.score += 1;

    Array.from(quizOptionsEl.children).forEach((btn, index) => {
      const opt = q.options[index];
      btn.disabled = true;
      if (opt.correct || opt.label === correctLabel) btn.classList.add("correct");
      else if (opt.label === option.label) btn.classList.add("wrong");
    });

    quizScoreEl.textContent = `Acertos: ${quiz.score}`;
    quizFeedbackEl.className = `quiz-feedback ${isCorrect ? "ok" : "no"}`;
    quizFeedbackEl.innerHTML =
      `${isCorrect ? "✅ Correto!" : `❌ Resposta correta: ${escapeHtml(correctLabel)}`}` +
      (q.correctText ? `<br><b>${escapeHtml(q.correctText)}</b>` : "") +
      (q.correctExplanation ? `<br>${escapeHtml(q.correctExplanation)}` : "");

    quizNextBtn.style.display = "inline-flex";
    quizNextBtn.textContent = quiz.index + 1 >= quiz.items.length ? "Ver resultado 🏁" : "Próxima →";
  }

  function renderQuizFinal() {
    const total = quiz.items.length;
    const pct = total ? Math.round((quiz.score / total) * 100) : 0;
    const message =
      pct === 100 ? "🏆 Perfeito! Você dominou o conteúdo." :
      pct >= 80 ? "🎉 Muito bom! Revise apenas os erros." :
      pct >= 60 ? "👍 Bom começo. Vale revisar as questões erradas." :
      "📚 Continue estudando: revise as explicações e tente novamente.";

    quizQuestionEl.textContent = "";
    quizOptionsEl.innerHTML = "";
    quizFeedbackEl.className = "quiz-feedback";
    quizFeedbackEl.textContent = "";
    quizNextBtn.style.display = "none";
    quizProgressEl.textContent = "Quiz concluído";
    quizScoreEl.textContent = `Acertos: ${quiz.score}`;
    quizFinalEl.style.display = "block";
    quizFinalEl.innerHTML = `<div>Resultado: <b>${quiz.score}/${total} (${pct}%)</b></div><div>${message}</div>`;
    quiz.active = false;
  }

  btnStartQuiz.addEventListener("click", startQuiz);
  quizRestartBtn.addEventListener("click", startQuiz);
  quizNextBtn.addEventListener("click", () => {
    quiz.index += 1;
    renderQuizQuestion();
  });

  // ---------- downloads de questões ----------
  function questionsAsTxt(questions) {
    return questions
      .map((q, idx) => {
        const correct = (q.options || []).find((o) => o.correct);
        const optionsText = (q.options || [])
          .map((o) => `${o.label}) ${o.text}${o.correct ? "  ✓ Correta" : ""}`)
          .join("\n");
        return [
          `=== QUESTÃO ${idx + 1} ===`,
          `Curso: ${courseNameOfQuestion(q)}`,
          `Aula: ${q.lesson || "-"}`,
          `Pergunta: ${q.question}`,
          "Alternativas:",
          optionsText,
          `Resposta correta: ${q.correctLabel || correct?.label || "-"}`,
          q.correctExplanation ? `Explicação: ${q.correctExplanation}` : "",
          `Fonte: ${q.sourceUrl || ""}`,
          ""
        ].join("\n");
      })
      .join("\n" + "=".repeat(50) + "\n\n");
  }

  function questionsAsMarkdown(questions) {
    return questions
      .map((q, idx) => {
        const correct = (q.options || []).find((o) => o.correct);
        return [
          `## Questão ${idx + 1}`,
          `**Curso:** ${courseNameOfQuestion(q)}`,
          `**Aula:** ${q.lesson || "-"}`,
          "",
          q.question,
          "",
          (q.options || []).map((o) => `- ${o.label}. ${o.text}${o.correct ? " ✓ Correta" : ""}`).join("\n"),
          "",
          `**Resposta correta:** ${q.correctLabel || correct?.label || "-"}`,
          q.correctExplanation ? `**Explicação:** ${q.correctExplanation}` : "",
          `**Fonte:** ${q.sourceUrl || ""}`,
          ""
        ].join("\n");
      })
      .join("\n---\n\n");
  }

  btnDownloadQuestionsTxt.addEventListener("click", async () => {
    const questions = filteredQuestions();
    if (questions.length === 0) return showAlert("Não há questões para baixar.", "info");
    try {
      const path = await downloadText(`questoes_${timestamp()}.txt`, questionsAsTxt(questions));
      showAlert(`✓ Questões exportadas para ${path}`, "success");
    } catch (err) {
      showAlert(`Erro ao baixar: ${err.message}`, "danger");
    }
  });

  btnDownloadQuestionsMd.addEventListener("click", async () => {
    const questions = filteredQuestions();
    if (questions.length === 0) return showAlert("Não há questões para baixar.", "info");
    try {
      const path = await downloadText(
        `questoes_${timestamp()}.md`,
        questionsAsMarkdown(questions),
        "text/markdown;charset=utf-8"
      );
      showAlert(`✓ Questões exportadas para ${path}`, "success");
    } catch (err) {
      showAlert(`Erro ao baixar: ${err.message}`, "danger");
    }
  });

  // Anki: 3 colunas (Frente, Verso, Tags). Funciona com "Importar arquivo" no Anki.
  btnDownloadQuestionsAnki.addEventListener("click", async () => {
    const questions = filteredQuestions();
    if (questions.length === 0) return showAlert("Não há questões para exportar.", "info");

    const rows = questions.map((q) => {
      const correct = (q.options || []).find((o) => o.correct);
      const back = [
        `${q.correctLabel || correct?.label || "?"}) ${q.correctText || correct?.text || ""}`,
        q.correctExplanation ? `<br><br>${q.correctExplanation}` : ""
      ].join("");
      const tags = [slugify(courseNameOfQuestion(q)), slugify(q.lesson || ""), "alura"]
        .filter(Boolean)
        .join(" ");
      return [csvField(q.question), csvField(back), csvField(tags)].join(",");
    });

    try {
      const path = await downloadText(
        `anki_questoes_${timestamp()}.csv`,
        "\uFEFF" + rows.join("\n") + "\n",
        "text/csv;charset=utf-8"
      );
      showAlert(`✓ Anki CSV exportado (${rows.length} cards) para ${path}`, "success", 6000);
    } catch (err) {
      showAlert(`Erro ao exportar Anki: ${err.message}`, "danger");
    }
  });

  // Guia de estudo a partir das questões (sem chamada de IA).
  btnDownloadStudyGuide.addEventListener("click", async () => {
    const questions = filteredQuestions();
    if (questions.length === 0) return showAlert("Não há questões para montar o guia.", "info");

    const groups = new Map();
    for (const q of questions) {
      const course = courseNameOfQuestion(q);
      if (!groups.has(course)) groups.set(course, []);
      groups.get(course).push(q);
    }

    const lines = [
      "---",
      `title: ${JSON.stringify("Guia de Estudo")}`,
      `generated: ${new Date().toISOString()}`,
      `questions: ${questions.length}`,
      "---",
      "",
      "# 🧠 Guia de Estudo",
      "",
      `Gerado em ${new Date().toLocaleString("pt-BR")} · ${questions.length} questões em ${groups.size} curso(s).`,
      ""
    ];

    for (const [course, list] of groups) {
      lines.push(`## ${course}`, "");
      list.forEach((q, idx) => {
        const correct = (q.options || []).find((o) => o.correct);
        lines.push(
          `### ${idx + 1}. ${q.lesson || "Aula"}`,
          "",
          q.question,
          "",
          ...(q.options || []).map((o) => `- ${o.label}. ${o.text}`),
          "",
          `**Resposta:** ${q.correctLabel || correct?.label || "-"}) ${q.correctText || correct?.text || ""}`,
          q.correctExplanation ? `\n**Explicação:** ${q.correctExplanation}` : "",
          "",
          "---",
          ""
        );
      });
    }

    lines.push("## 🔑 Gabarito rápido", "");
    for (const [course, list] of groups) {
      lines.push(`### ${course}`);
      lines.push(
        list
          .map((q, idx) => `${idx + 1}. ${q.correctLabel || (q.options || []).find((o) => o.correct)?.label || "?"}`)
          .join(" · ")
      );
      lines.push("");
    }

    try {
      const path = await downloadText(
        `guia_estudo_${timestamp()}.md`,
        lines.join("\n"),
        "text/markdown;charset=utf-8"
      );
      showAlert(`✓ Guia de estudo exportado para ${path}`, "success", 6000);
    } catch (err) {
      showAlert(`Erro ao gerar guia: ${err.message}`, "danger");
    }
  });

  btnClearQuestions.addEventListener("click", async () => {
    if (!confirm("Deseja realmente limpar todas as questões capturadas?")) return;
    state.questions = [];
    await AluraStore.set({ savedQuestions: [] });
    stopQuiz();
    renderQuestions();
    await checkStorageQuota();
    showAlert("Questões foram limpas com sucesso!", "info");
  });

  // ---------- documento consolidado por curso ----------
  function buildCourseDocument(courseId) {
    const now = new Date();
    const courses = courseId ? [state.courses[courseId]].filter(Boolean) : Object.values(state.courses);
    if (courses.length === 0) return null;

    const courseIds = new Set(courses.map((c) => c.id));
    const courseNames = new Set(courses.map((c) => c.name));
    const questions = state.questions.filter((q) =>
      courseId
        ? q.courseId === courseId || courseNameOfQuestion(q) === state.courses[courseId]?.name
        : courseIds.has(q.courseId) || courseNames.has(courseNameOfQuestion(q))
    );
    const summaries = courseId
      ? state.summaries.filter((s) => s.courseId === courseId)
      : state.summaries;

    const totalLessons = courses.reduce((t, c) => t + (c.lessons?.length || 0), 0);
    const title = courseId
      ? state.courses[courseId]?.name || "Curso"
      : "Cursos";

    const lines = [
      "---",
      `title: ${JSON.stringify(title)}`,
      `generated: ${now.toISOString()}`,
      `courses: ${courses.length}`,
      `lessons: ${totalLessons}`,
      `questions: ${questions.length}`,
      `summaries: ${summaries.length}`,
      "---",
      "",
      `# ${title}`,
      "",
      `Documento gerado em ${now.toLocaleString("pt-BR")}.`,
      "",
      "## Sumário",
      ""
    ];

    for (const course of courses) {
      if (!courseId) lines.push(`- [${course.name}](#${slugify(course.name)})`);
      for (const lesson of course.lessons || []) {
        lines.push(`  - [${lesson.title}](#${slugify(lesson.title)})`);
      }
    }
    lines.push("");

    for (const course of courses) {
      if (!courseId) lines.push(`# ${course.name}`, "");
      lines.push("## Transcrições", "");
      for (const lesson of course.lessons || []) {
        lines.push(`### ${lesson.title}`, "");
        if (lesson.sourceUrl) lines.push(`[Fonte](${lesson.sourceUrl})`, "");
        lines.push(lesson.transcript || "_(sem transcrição)_", "");
      }
      if (!course.lessons?.length) lines.push("_Nenhuma transcrição capturada._", "");
    }

    const courseQuestions = courseId
      ? questions
      : questions;
    lines.push("## Questões", "");
    if (courseQuestions.length === 0) {
      lines.push("_Nenhuma questão capturada._", "");
    } else {
      courseQuestions.forEach((q, idx) => {
        const correct = (q.options || []).find((o) => o.correct);
        lines.push(
          `### Questão ${idx + 1} - ${q.lesson || "Aula"}`,
          "",
          q.question,
          "",
          ...(q.options || []).map((o) => `- ${o.label}. ${o.text}`),
          "",
          `**Resposta correta:** ${q.correctLabel || correct?.label || "-"}) ${q.correctText || correct?.text || ""}`,
          q.correctExplanation ? `\n**Explicação:** ${q.correctExplanation}` : "",
          q.sourceUrl ? `\n[Fonte da questão](${q.sourceUrl})` : "",
          ""
        );
      });
    }

    if (summaries.length > 0) {
      lines.push("## Resumos da IA", "");
      summaries.forEach((s, idx) => {
        lines.push(`### Resumo ${idx + 1} (${s.model || "Gemini"})`, "", s.content, "");
      });
    }

    return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
  }

  btnDownloadCourse.addEventListener("click", async () => {
    const courseId = courseSelect.value;
    const content = buildCourseDocument(courseId);
    if (!content) {
      showAlert("Ainda não há cursos ou aulas capturadas para gerar o documento.", "info");
      return;
    }

    const name = courseId ? state.courses[courseId].name : "todos_os_cursos";
    const filename = `curso_${slugify(name)}_${timestamp()}.md`;
    try {
      const path = await downloadText(filename, content, "text/markdown;charset=utf-8");
      showAlert(`✓ Documento consolidado salvo em ${path}`, "success", 6000);
    } catch (err) {
      showAlert(`Erro ao gerar documento: ${err.message}`, "danger");
    }
  });

  btnDeleteCourse.addEventListener("click", async () => {
    const courseId = courseSelect.value;
    const course = state.courses[courseId];

    if (!courseId || !course) {
      showAlert("Selecione um curso específico na lista para removê-lo.", "info");
      return;
    }

    const cascade = deleteCourseCascadeCheckbox.checked;
    const relatedQuestions = state.questions.filter(
      (q) => q.courseId === courseId || courseNameOfQuestion(q) === course.name
    );
    const relatedSummaries = state.summaries.filter(
      (s) => s.courseId === courseId || s.courseName === course.name
    );

    const details = [`${course.lessons?.length || 0} transcrição(ões)`];
    if (cascade) {
      details.push(`${relatedQuestions.length} questão(ões)`, `${relatedSummaries.length} resumo(s)`);
    }

    if (!confirm(
      `Remover o curso "${course.name}"?\n\n` +
      `Serão apagados: ${details.join(", ")}.\n\n` +
      "Essa ação não pode ser desfeita. Baixe um backup antes se necessário."
    )) return;

    // Remove a estrutura do curso.
    delete state.courses[courseId];

    // Remove do texto bruto apenas os blocos que pertencem a este curso.
    const allBlocks = parseRawBlocks(state.rawContent);
    const deletedTitles = new Set(
      (course.lessons || []).map((lesson) => String(lesson.title || "").trim().toLowerCase())
    );
    const remainingTitles = new Set(
      Object.values(state.courses).flatMap((remainingCourse) =>
        (remainingCourse.lessons || []).map((lesson) => String(lesson.title || "").trim().toLowerCase())
      )
    );
    const lessonKeys = new Set(
      (course.lessons || []).map(
        (lesson) => `${String(lesson.title || "").trim().toLowerCase()}\u0000${String(lesson.transcript || "").trim()}`
      )
    );
    const remainingBlocks = allBlocks.filter((block) => {
      const key = `${block.title.trim().toLowerCase()}\u0000${block.transcript.trim()}`;
      if (lessonKeys.has(key)) return false;
      const title = block.title.trim().toLowerCase();
      return !(deletedTitles.has(title) && !remainingTitles.has(title));
    });
    if (remainingBlocks.length !== allBlocks.length) {
      state.rawContent = remainingBlocks
        .map((block) => `[Titulo] ${block.title}\n\n[Texto] ${block.transcript}`)
        .join("\n\n\n");
    }

    // Remove os títulos do controle de anti-duplicação.
    const stored = await AluraStore.get(["savedTitles"]);
    const lessonTitles = new Set(
      (course.lessons || []).map((lesson) => String(lesson.title || "").trim().toLowerCase())
    );
    const savedTitles = (stored.savedTitles || []).filter((title) => {
      const normalized = String(title || "").trim().toLowerCase();
      return !lessonTitles.has(normalized) || remainingTitles.has(normalized);
    });

    const updates = {
      courses: state.courses,
      rawContent: state.rawContent,
      savedTitles
    };

    if (cascade) {
      state.questions = state.questions.filter((q) => !relatedQuestions.includes(q));
      state.summaries = state.summaries.filter((s) => !relatedSummaries.includes(s));
      updates.savedQuestions = state.questions;
      updates.aiSummaries = state.summaries;

      const cacheData = await AluraStore.get(["summaryCache"]);
      const cache = cacheData.summaryCache || {};
      let cacheChanged = false;
      for (const key of Object.keys(cache)) {
        if (cache[key]?.courseId === courseId) {
          delete cache[key];
          cacheChanged = true;
        }
      }
      if (cacheChanged) updates.summaryCache = cache;
    }

    await AluraStore.set(updates);

    stopQuiz();
    renderRawPreview(state.rawContent);
    renderCourseSelectors();
    renderCourseManager();
    renderQuestions();
    renderSummaries();
    if (editRawTextarea) editRawTextarea.value = state.rawContent;
    syncEditSummaries();
    updateTokenEstimate();
    await checkStorageQuota();

    showAlert(`Curso "${course.name}" removido com sucesso.`, "info", 6000);
  });

  // ---------- transcrições: downloads e edição ----------
  btnDownloadTxt.addEventListener("click", async () => {
    if (!state.rawContent.trim()) return showAlert("O arquivo acumulado está vazio.", "danger");
    try {
      const path = await downloadText(filenameInput.value || "transcricoes_acumuladas.txt", state.rawContent);
      showAlert(`✓ Arquivo .TXT baixado para ${path}`, "success");
    } catch (err) {
      showAlert(`Erro ao baixar: ${err.message}`, "danger");
    }
  });

  btnDownloadMd.addEventListener("click", async () => {
    if (!state.rawContent.trim()) return showAlert("O arquivo acumulado está vazio.", "danger");
    const md = state.rawContent
      .replace(/\[Titulo\]\s*(.+)/g, "# $1\n")
      .replace(/\[Texto\]\s*/g, "\n");
    const base = (filenameInput.value || "transcricoes_acumuladas.txt").replace(/\.txt$/i, "");
    try {
      const path = await downloadText(`${base}.md`, md, "text/markdown;charset=utf-8");
      showAlert(`✓ Markdown baixado em ${path}`, "success");
    } catch (err) {
      showAlert(`Erro ao baixar: ${err.message}`, "danger");
    }
  });

  btnSaveRawEdit.addEventListener("click", async () => {
    state.rawContent = editRawTextarea.value;
    await AluraStore.set({ rawContent: state.rawContent });
    renderRawPreview(state.rawContent);
    updateTokenEstimate();
    showAlert("✓ Transcrições brutas editadas salvas.", "success");
  });

  btnResetRaw.addEventListener("click", async () => {
    const data = await AluraStore.get(["rawContent"]);
    state.rawContent = data.rawContent || "";
    editRawTextarea.value = state.rawContent;
    renderRawPreview(state.rawContent);
    updateTokenEstimate();
    showAlert("✅ Conteúdo bruto recarregado.", "info");
  });

  btnClearRaw.addEventListener("click", async () => {
    if (!confirm("Deseja realmente limpar todo o histórico acumulado de transcrições?")) return;
    state.rawContent = "";
    state.courses = {};
    await AluraStore.set({ rawContent: "", savedTitles: [], courses: {} });
    renderRawPreview("");
    renderCourseSelectors();
    await checkStorageQuota();
    showAlert("Histórico de transcrições limpo.", "info");
  });

  // ---------- preferências ----------
  btnSaveConfig.addEventListener("click", async () => {
    let filename = filenameInput.value.trim() || "transcricoes_acumuladas.txt";
    if (!filename.endsWith(".txt")) filename += ".txt";

    const autoBackupEvery = Math.max(0, Number(autoBackupEveryInput.value) || 0);

    await AluraStore.set({
      subfolder: subfolderInput.value.trim(),
      filename,
      antiDuplicate: antiDuplicateCheckbox.checked,
      autoCaptureOnNextVideo: autoCaptureCheckbox.checked,
      questionAutoCapture: questionAutoCaptureCheckbox.checked,
      autoBackupEvery
    });

    state.settings.autoBackupEvery = autoBackupEvery;

    showAlert("✓ Preferências e backup automático salvos!", "success");
  });

  // ---------- modelos ----------
  btnAddModel.addEventListener("click", async () => {
    const newModel = newModelInput.value.trim();
    if (!newModel) return showAlert("Digite o identificador do modelo.", "danger");

    const data = await AluraStore.get(["availableModels"]);
    const list = data.availableModels || DEFAULT_MODELS;

    if (list.includes(newModel)) {
      modelSelect.value = newModel;
      newModelInput.value = "";
      return showAlert("Este modelo já está na lista.", "info");
    }

    list.unshift(newModel);
    await AluraStore.set({ availableModels: list, modelName: newModel });
    populateModelSelect(list, newModel);
    populateOcrModelSelect(list, ocrModelSelect.value);
    newModelInput.value = "";
    showAlert(`✓ Modelo "${newModel}" adicionado e selecionado!`, "success");
  });

  btnRemoveModel.addEventListener("click", async () => {
    const selected = modelSelect.value;
    if (!selected) return;

    const data = await AluraStore.get(["availableModels"]);
    let list = data.availableModels || DEFAULT_MODELS;
    if (list.length <= 1) return showAlert("É preciso manter pelo menos um modelo.", "danger");

    list = list.filter((m) => m !== selected);
    await AluraStore.set({ availableModels: list, modelName: list[0] });
    populateModelSelect(list, list[0]);
    populateOcrModelSelect(list, ocrModelSelect.value);
    showAlert(`Modelo "${selected}" removido.`, "info");
  });

  btnSaveApi.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showAlert("Preencha a chave de API antes de salvar.", "danger");
      apiKeyInput.focus();
      return;
    }
    await AluraStore.set({
      apiKey,
      modelName: modelSelect.value,
      ocrModelName: ocrModelSelect.value,
      promptCustom: promptCustomInput.value
    });
    showAlert("✓ Configurações da IA salvas!", "success");
  });

  btnToggleApiKey.addEventListener("click", () => {
    if (apiKeyInput.type === "password") {
      apiKeyInput.type = "text";
      btnToggleApiKey.textContent = "🙈";
    } else {
      apiKeyInput.type = "password";
      btnToggleApiKey.textContent = "👁️";
    }
  });

  btnResetPrompt.addEventListener("click", async () => {
    promptCustomInput.value = DEFAULT_PROMPT;
    await AluraStore.set({ promptCustom: DEFAULT_PROMPT });
    updateTokenEstimate();
    showAlert("✓ Prompt restaurado para o padrão.", "info");
  });

  // ---------- Gemini: cache, retry e resumo ----------
  async function hashText(text) {
    try {
      const data = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (_) {
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
      }
      return "fallback-" + Math.abs(hash).toString(36);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchWithRetry(url, options, retries = 3) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, options);
        const retryable = [429, 500, 502, 503, 504].includes(response.status);
        if (!retryable || attempt === retries) return response;

        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(8000, 800 * Math.pow(2, attempt));
        await sleep(delay);
      } catch (err) {
        lastError = err;
        if (attempt === retries) throw err;
        await sleep(Math.min(8000, 800 * Math.pow(2, attempt)));
      }
    }
    throw lastError || new Error("Falha ao consultar a API");
  }

  // Alguns modelos recusam maxOutputTokens alto; tenta valores menores antes de desistir.
  const GEMINI_MAX_OUTPUT_CANDIDATES = [65536, 32768, 8192];
  const MAX_CONTINUATIONS = 4;

  async function callGemini(apiKey, modelForUrl, contents, signal) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelForUrl}:generateContent?key=${apiKey}`;
    let lastError = null;

    for (const maxOutputTokens of GEMINI_MAX_OUTPUT_CANDIDATES) {
      const response = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens, temperature: 0.4 }
        }),
        signal
      });

      if (response.ok) return response.json();

      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error ? errorData.error.message : `HTTP ${response.status}`;
      lastError = new Error(message);

      const configRejected =
        response.status === 400 &&
        /maxOutputTokens|generationConfig|temperature|output token/i.test(message);
      if (!configRejected) throw lastError;
    }

    throw lastError || new Error("Falha ao consultar a API");
  }

  function extractGeminiText(json) {
    const parts = json?.candidates?.[0]?.content?.parts || [];
    return parts
      .filter((part) => part && typeof part.text === "string" && !part.thought)
      .map((part) => part.text)
      .join("");
  }

  btnSummarizeWithGemini.addEventListener("click", async () => {
    try {
      const data = await AluraStore.get([
        "apiKey",
        "modelName",
        "promptCustom",
        "rawContent",
        "aiSummaries",
        "summaryCache",
        "courses"
      ]);

      const apiKey = (data.apiKey || apiKeyInput.value).trim();
      if (!apiKey) {
        showAlert("Informe sua chave de API do Google AI Studio antes de resumir.", "danger");
        apiKeyInput.focus();
        return;
      }

      state.courses = data.courses || state.courses;
      const courseId = summarizeCourseOnlyCheckbox.checked ? courseSelect.value : "";
      const course = courseId ? state.courses[courseId] : null;
      const content = course ? courseTranscript(course) : data.rawContent || "";

      if (!String(content).trim()) {
        showAlert(
          course
            ? `O curso "${course.name}" ainda não tem transcrições capturadas.`
            : "Não há nenhuma transcrição acumulada para resumir.",
          "danger"
        );
        return;
      }

      const rawModel = (data.modelName || modelSelect.value || DEFAULT_MODELS[0]).trim();
      const modelForUrl = rawModel.startsWith("models/") ? rawModel.replace("models/", "") : rawModel;
      const prompt = data.promptCustom || promptCustomInput.value || DEFAULT_PROMPT;

      const tokens = AluraStore.estimateTokens(prompt + "\n" + content);
      if (tokens > 950000 && !confirm(
        `O conteúdo tem ~${tokens.toLocaleString("pt-BR")} tokens, acima do limite confortável do modelo. Deseja continuar?`
      )) return;

      const fullPrompt = `${prompt}\n\n---\n${content}`;
      const cacheKey = await hashText(`${modelForUrl}\n${fullPrompt}`);
      const cache = data.summaryCache && typeof data.summaryCache === "object" ? data.summaryCache : {};
      let generatedText = null;
      let fromCache = false;

      if (useSummaryCacheCheckbox.checked && cache[cacheKey]?.content) {
        generatedText = cache[cacheKey].content;
        fromCache = true;
        showAlert("⚡ Conteúdo idêntico já resumido: usando cache local (nenhuma chamada à API).", "info", 6000);
      }

      btnSummarizeWithGemini.disabled = true;
      aiLoading.style.display = "block";

      let truncated = false;

      if (!generatedText) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000);

        try {
          const contents = [{ role: "user", parts: [{ text: fullPrompt }] }];
          let json = await callGemini(apiKey, modelForUrl, contents, controller.signal);
          generatedText = extractGeminiText(json);
          if (!generatedText) throw new Error("A API respondeu sem texto gerado.");

          // Se o modelo atingiu o limite de tokens, continua de onde parou.
          let finishReason = json?.candidates?.[0]?.finishReason;
          for (let continuation = 0; finishReason === "MAX_TOKENS" && continuation < MAX_CONTINUATIONS; continuation++) {
            contents.push({ role: "model", parts: [{ text: generatedText }] });
            contents.push({
              role: "user",
              parts: [{
                text: "Continue o resumo exatamente de onde parou. Não repita o que já foi escrito e não adicione introdução."
              }]
            });

            json = await callGemini(apiKey, modelForUrl, contents, controller.signal);
            const extra = extractGeminiText(json);
            if (!extra) break;
            generatedText += extra;
            finishReason = json?.candidates?.[0]?.finishReason;
          }

          truncated = finishReason === "MAX_TOKENS";
          generatedText = generatedText
            .replace(/^(Aqui está o resumo|Segue o resumo|Com certeza|Abaixo está o resumo)[^\n]*\n+/i, "")
            .trim();

          // Resumo truncado não entra no cache, para permitir nova tentativa.
          if (!truncated) {
            cache[cacheKey] = {
              content: generatedText,
              model: rawModel,
              date: new Date().toISOString(),
              courseId: courseId || ""
            };

            const keys = Object.keys(cache);
            if (keys.length > CACHE_LIMIT) {
              keys
                .sort((a, b) => String(cache[a].date).localeCompare(String(cache[b].date)))
                .slice(0, keys.length - CACHE_LIMIT)
                .forEach((key) => delete cache[key]);
            }
          } else {
            delete cache[cacheKey];
          }
        } finally {
          clearTimeout(timeoutId);
        }
      }

      const now = new Date();
      const summaryFilename = `resumo_${modelForUrl}_${timestamp()}.txt`;
      await downloadText(summaryFilename, generatedText);

      const fresh = await AluraStore.get(["aiSummaries"]);
      const summaries = fresh.aiSummaries || [];
      summaries.push({
        id: timestamp(),
        filename: summaryFilename,
        model: rawModel,
        date: now.toLocaleString("pt-BR"),
        content: generatedText,
        courseId: courseId || "",
        courseName: course ? course.name : "",
        tokens
      });

      state.summaries = summaries;
      await AluraStore.set({ aiSummaries: summaries, summaryCache: cache });
      renderSummaries();
      syncEditSummaries();
      await checkStorageQuota();

      showAlert(
        truncated
          ? `⚠️ Resumo salvo em '${summaryFilename}', mas o modelo atingiu o limite de tokens. Confira se o final está completo.`
          : `${fromCache ? "⚡ Resumo recuperado do cache" : "✓ Resumo gerado"} com ${rawModel} e salvo em '${summaryFilename}'!`,
        truncated ? "danger" : "success",
        9000
      );
    } catch (err) {
      console.error(err);
      if (err.name === "AbortError") {
        showAlert("Erro ao consultar Gemini: tempo esgotado (90s).", "danger", 9000);
      } else {
        showAlert(`Erro ao consultar Gemini: ${err.message}`, "danger", 9000);
      }
    } finally {
      btnSummarizeWithGemini.disabled = false;
      aiLoading.style.display = "none";
    }
  });

  // ---------- diagnóstico do Gemini Vision (fase 0) ----------
  const VISION_PROMPT = [
    "Extraia fielmente todo o texto visível nesta imagem.",
    "Preserve quebras de linha, listas e alternativas (A, B, C...).",
    "Não resuma, não traduza, não explique e não adicione comentários.",
    "Responda somente com o texto extraído."
  ].join(" ");

  function buildVisionSampleImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 420;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível para gerar a imagem de teste.");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111827";

    ctx.font = "700 30px Arial, sans-serif";
    ctx.fillText("Teste de OCR - Gemini Vision", 40, 66);

    ctx.font = "24px Arial, sans-serif";
    const lines = [
      "Ação, coração, informação, questão e português.",
      "1) Qual é a capital do Brasil?",
      "A) Rio de Janeiro        B) Brasília",
      "C) São Paulo             D) Salvador",
      "Resposta correta: B"
    ];
    lines.forEach((line, index) => ctx.fillText(line, 40, 132 + index * 52));

    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

    return canvas.toDataURL("image/jpeg", 0.92);
  }

  const VISION_EXPECTED = ["Ação", "coração", "Brasília", "Resposta correta: B"];

  function normalizeForVisionCheck(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Falha ao ler a imagem."));
      reader.readAsDataURL(file);
    });
  }

  function setVisionStatus(text, type = "") {
    if (!visionStatus) return;
    visionStatus.textContent = text || "";
    visionStatus.style.color =
      type === "danger"
        ? "var(--danger)"
        : type === "success"
          ? "var(--success, #10b981)"
          : "";
  }

  async function runVisionTest(dataUrl, label, expected = []) {
    if (!window.GeminiClient) {
      setVisionStatus("Cliente Gemini não carregado. Recarregue a extensão.", "danger");
      return;
    }

    const data = await AluraStore.get(["apiKey", "modelName"]);
    const apiKey = String(data.apiKey || apiKeyInput.value || "").trim();
    if (!apiKey) {
      setVisionStatus("Informe e salve sua chave de API antes de testar.", "danger");
      apiKeyInput.focus();
      return;
    }

    const model = modelSelect.value || data.modelName || DEFAULT_MODELS[0];
    btnTestVision.disabled = true;
    if (visionResult) {
      visionResult.value = "";
      visionResult.style.display = "none";
    }
    if (btnCopyVision) btnCopyVision.disabled = true;
    if (visionCopyStatus) visionCopyStatus.textContent = "";
    setVisionStatus(`⏳ Enviando ${label} para ${model}...`);

    const started = Date.now();
    try {
      const result = await window.GeminiClient.describeImage({
        apiKey,
        model,
        prompt: VISION_PROMPT,
        dataUrl,
        maxOutputTokens: 2048,
        temperature: 0,
        timeoutMs: 90000,
        retries: 0
      });

      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      const text = result.text || "";
      const normalized = normalizeForVisionCheck(text);
      const missing = expected.filter((item) => !normalized.includes(normalizeForVisionCheck(item)));
      const usedFallback = result.model && result.model !== model;

      if (visionResult) {
        visionResult.value = text || "(o modelo não retornou texto)";
        visionResult.style.display = "block";
      }
      if (btnCopyVision) btnCopyVision.disabled = !text;

      if (!text) {
        setVisionStatus(
          `⚠️ ${result.model} respondeu sem texto (${result.finishReason || "sem motivo"}).`,
          "danger"
        );
        return;
      }

      const checks = expected.length
        ? ` · ${expected.length - missing.length}/${expected.length} trechos encontrados` +
          (missing.length ? ` (faltou: ${missing.join(", ")})` : "")
        : "";
      const fallbackNote = usedFallback ? ` · fallback de ${model}` : "";
      setVisionStatus(
        `✓ Vision ok em ${elapsed}s · ${result.model}${fallbackNote}${checks}`,
        missing.length && expected.length ? "danger" : "success"
      );
    } catch (err) {
      const retry = err.retryAfter ? ` Aguarde ~${err.retryAfter}s.` : "";
      setVisionStatus(`✗ ${err.message}${retry}`, "danger");
    } finally {
      btnTestVision.disabled = false;
    }
  }

  btnTestVision.addEventListener("click", async () => {
    try {
      const dataUrl = buildVisionSampleImage();
      await runVisionTest(dataUrl, "imagem de exemplo", VISION_EXPECTED);
    } catch (err) {
      setVisionStatus(`✗ ${err.message}`, "danger");
    }
  });

  btnCopyVision.addEventListener("click", async () => {
    const text = visionResult.value || "";
    if (!text.trim()) return;

    try {
      await navigator.clipboard.writeText(text);
      if (visionCopyStatus) visionCopyStatus.textContent = "✓ Texto copiado.";
    } catch (_) {
      visionResult.focus();
      visionResult.select();
      if (visionCopyStatus) visionCopyStatus.textContent = "Selecione e copie com Ctrl+C.";
    }
  });

  visionDrop.addEventListener("click", () => visionDrop.focus());

  visionDrop.addEventListener("paste", async (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type && item.type.startsWith("image/"));
    if (!imageItem) {
      setVisionStatus("Nenhuma imagem encontrada na área de transferência.", "danger");
      return;
    }

    event.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) {
      setVisionStatus("Não foi possível ler a imagem colada.", "danger");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      await runVisionTest(dataUrl, `print colado (${Math.round(file.size / 1024)} KB)`, []);
    } catch (err) {
      setVisionStatus(`✗ ${err.message}`, "danger");
    }
  });

  visionDrop.addEventListener("dragover", (event) => {
    event.preventDefault();
    visionDrop.style.borderColor = "var(--primary)";
  });

  visionDrop.addEventListener("dragleave", () => {
    visionDrop.style.borderColor = "var(--border)";
  });

  visionDrop.addEventListener("drop", async (event) => {
    event.preventDefault();
    visionDrop.style.borderColor = "var(--border)";
    const file = Array.from(event.dataTransfer?.files || []).find((f) => f.type.startsWith("image/"));
    if (!file) {
      setVisionStatus("Arraste um arquivo de imagem (PNG/JPEG).", "danger");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      await runVisionTest(dataUrl, `imagem arrastada (${Math.round(file.size / 1024)} KB)`, []);
    } catch (err) {
      setVisionStatus(`✗ ${err.message}`, "danger");
    }
  });

  // ---------- resumos: edição e mesclagem ----------
  function syncEditSummaries() {
    if (!editSummariesTextarea) return;
    editSummariesTextarea.value = state.summaries
      .map((s, idx) => `=== RESUMO ${idx + 1} (${s.model || "Gemini"}) | ${s.date || ""} | ${s.filename || ""}\n${s.content}`)
      .join("\n\n");
  }

  // Lê o textarea no formato "=== RESUMO n (modelo) | data | arquivo" e devolve os blocos.
  function parseEditedSummaries(text) {
    const marker = /^=== RESUMO (\d+) \((.*?)\) \| (.*?) \| (.*)$/gm;
    const matches = Array.from(text.matchAll(marker));

    return matches.map((match, idx) => {
      const start = match.index + match[0].length;
      const end = idx + 1 < matches.length ? matches[idx + 1].index : text.length;
      const content = text
        .slice(start, end)
        .replace(/^\s*\n/, "")
        .replace(/\s+$/, "");

      return {
        model: match[2].trim(),
        date: match[3].trim(),
        filename: match[4].trim(),
        content
      };
    });
  }

  btnSaveSummariesEdit.addEventListener("click", async () => {
    const edited = editSummariesTextarea.value;

    if (!edited.trim()) {
      state.summaries = [];
      await AluraStore.set({ aiSummaries: [] });
      syncEditSummaries();
      renderSummaries();
      showAlert("Todos os resumos foram removidos do histórico.", "info", 6000);
      return;
    }

    const parsed = parseEditedSummaries(edited);
    if (parsed.length === 0) {
      showAlert(
        "Formato não reconhecido. Mantenha os cabeçalhos '=== RESUMO ...' para que os resumos sejam salvos.",
        "danger",
        9000
      );
      return;
    }

    const byFilename = new Map(
      state.summaries.filter((s) => s.filename).map((s) => [s.filename, s])
    );
    const byDate = new Map(
      state.summaries.filter((s) => s.date).map((s) => [s.date, s])
    );

    state.summaries = parsed.map((entry, idx) => {
      const existing = byFilename.get(entry.filename) || byDate.get(entry.date) || {};
      return {
        ...existing,
        id: existing.id || `${Date.now()}_${idx}`,
        filename: entry.filename || existing.filename || `resumo_editado_${idx + 1}.txt`,
        model: entry.model || existing.model || "Gemini",
        date: entry.date || existing.date || new Date().toLocaleString("pt-BR"),
        content: entry.content
      };
    });

    await AluraStore.set({ aiSummaries: state.summaries });
    syncEditSummaries();
    renderSummaries();
    await checkStorageQuota();
    showAlert(
      `✓ Histórico atualizado: ${state.summaries.length} resumo(s) salvos. Resumos apagados da lista não voltam.`,
      "success",
      7000
    );
  });

  btnResetSummaries.addEventListener("click", async () => {
    const data = await AluraStore.get(["aiSummaries"]);
    state.summaries = data.aiSummaries || [];
    syncEditSummaries();
    renderSummaries();
    showAlert("✅ Resumos recarregados.", "info");
  });

  btnMergeSummariesTxt.addEventListener("click", async () => {
    if (state.summaries.length === 0) return showAlert("Não há resumos para mesclar.", "info");
    const merged = state.summaries
      .map((s, index) =>
        `============================================================\n` +
        `RESUMO #${index + 1} | Modelo: ${s.model || "Gemini"} | Data: ${s.date || ""}\n` +
        `Arquivo Original: ${s.filename || ""}\n` +
        `============================================================\n\n${s.content}`
      )
      .join("\n\n\n\n");

    try {
      const path = await downloadText(`resumos_mesclados_${timestamp()}.txt`, merged);
      showAlert(`✓ ${state.summaries.length} resumos mesclados em ${path}`, "success");
    } catch (err) {
      showAlert(`Erro ao mesclar: ${err.message}`, "danger");
    }
  });

  btnMergeSummariesMd.addEventListener("click", async () => {
    if (state.summaries.length === 0) return showAlert("Não há resumos para mesclar.", "info");
    const merged = state.summaries
      .map((s, index) =>
        `# Resumo ${index + 1} (${s.model || "Gemini"})\n*Gerado em: ${s.date || ""}*\n\n${s.content}`
      )
      .join("\n\n---\n\n");

    try {
      const path = await downloadText(
        `resumos_mesclados_${timestamp()}.md`,
        merged,
        "text/markdown;charset=utf-8"
      );
      showAlert(`✓ Resumos mesclados em ${path}`, "success");
    } catch (err) {
      showAlert(`Erro ao mesclar: ${err.message}`, "danger");
    }
  });

  btnClearSummaries.addEventListener("click", async () => {
    if (!confirm("Limpar a lista de resumos salvos? Os arquivos baixados continuam no computador.")) return;
    state.summaries = [];
    await AluraStore.set({ aiSummaries: [] });
    renderSummaries();
    syncEditSummaries();
    await checkStorageQuota();
    showAlert("Lista de resumos limpa.", "info");
  });

  // ---------- recomeçar do zero ----------
  if (btnClearAll) {
    btnClearAll.addEventListener("click", async () => {
      const message =
        "Limpar TUDO e começar um novo curso?\n\n" +
        "Serão apagados: transcrições, cursos, questões, resumos e caches.\n" +
        "Preferências, chave de API e modelos serão mantidos.\n\n" +
        "Esta ação não pode ser desfeita.";

      if (!confirm(message)) return;

      const res = await sendMessage({ action: "clearAllContent" });
      if (!res.success) {
        showAlert(res.error || "Falha ao limpar os dados.", "danger");
        return;
      }

      transcriptSearchInput.value = "";
      transcriptCourseFilter.value = "";
      questionSearchInput.value = "";
      questionCourseFilter.value = "";
      summarySearchInput.value = "";
      courseSelect.value = "";

      stopQuiz();
      await loadData();
      showAlert("✓ Tudo limpo. Você pode começar um novo curso.", "success", 6000);
    });
  }

  // ---------- importar / exportar ----------
  btnExportConfig.addEventListener("click", async () => {
    const res = await sendMessage({ action: "exportAllData" });
    if (res.success) {
      showAlert(`✓ Backup exportado: ${res.filename || "arquivo JSON"} (${fmtBytes(res.bytes || 0)}).`, "success");
      await checkStorageQuota();
    } else {
      showAlert(`Erro ao exportar: ${res.error || "falha desconhecida"}`, "danger");
    }
  });

  btnImportConfig.addEventListener("click", () => fileImportConfig.click());

  fileImportConfig.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch (_) {
      showAlert("Arquivo JSON inválido.", "danger");
      return;
    }

    if (!confirm("Importar o backup? As preferências existentes serão substituídas (a chave de API atual é preservada).")) {
      return;
    }

    const res = await sendMessage({ action: "importAllData", payload });
    if (res.success) {
      showAlert("✓ Backup importado. Recarregando dados...", "success");
      await loadData();
    } else {
      showAlert(`Erro ao importar: ${res.error || "falha desconhecida"}`, "danger");
    }

    fileImportConfig.value = "";
  });

  // ---------- inicialização ----------
  await loadData();
});
