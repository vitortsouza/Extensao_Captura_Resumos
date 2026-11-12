// content.js - Injetado nas páginas de aula com suporte para capturar transcrição e questões

// Função de Notificação na Tela (Toast)
function showToast(message, bgColor = "#047857") {
  const existing = document.getElementById("alura-transcript-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "alura-transcript-toast";
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    padding: "12px 20px",
    backgroundColor: bgColor,
    color: "#ffffff",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
    zIndex: "999999999",
    transition: "opacity 0.3s ease, transform 0.3s ease",
    opacity: "0",
    transform: "translateY(10px)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    pointerEvents: "none"
  });

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Copia para a área de transferência (usado apenas em capturas manuais).
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.setAttribute("readonly", "");
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      return true;
    } catch (_) {
      return false;
    }
  }
}

// Debounce simples
function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

// 1. Verifica se a página atual é de fato uma aula em vídeo com player ativo
function isVideoLessonPage() {
  if (!document.body) return false;

  const videoEl = document.body.querySelector("video");
  if (videoEl) return true;

  const videoPlayerContainer = document.body.querySelector(
    "div.video-js, div.vjs-tech, [data-component='VideoPlayer'], [data-test='video-player'], .video-player-container, .vjs-poster"
  );
  if (videoPlayerContainer) return true;

  const bodyVideoClass = document.body.querySelector("div[class*='video-player'], div[class*='VideoPlayer']");
  if (bodyVideoClass) return true;

  return false;
}

// 1b. Verifica se a página contém uma questão de múltipla escolha
function isQuestionPage() {
  if (!document.body) return false;

  // Título da aula presente
  const hasLessonTitle = !!(
    document.querySelector("h1, h2") &&
    document.querySelector("h1, h2").innerText.trim().length > 0
  );

  // Alternativas: <li> com <button> contendo letra (A/B/C/D) + texto
  const hasAlternatives = !!document.querySelector(
    "li > button, ul > li > button"
  );

  return hasLessonTitle && hasAlternatives;
}

// 2. Extrai Título da Aula
function getLessonTitle() {
  const titleCandidates = [
    ".task-body__title",
    ".course-content-head-title",
    ".video-solution-title",
    ".task-title",
    "h1.task-body__title",
    "[data-task-title]",
    "h1",
    "h2"
  ];

  for (const selector of titleCandidates) {
    const el = document.querySelector(selector);
    if (el && el.innerText && el.innerText.trim().length > 0) {
      const text = el.innerText.trim();
      if (!text.toLowerCase().includes("alura") && text.length < 150) {
        return text;
      }
    }
  }

  const docTitle = document.title || "";
  if (docTitle.includes(">")) {
    const parts = docTitle.split(">");
    const rightPart = parts[parts.length - 1];
    const clean = rightPart.split("|")[0].split("-")[0].trim();
    if (clean) return clean;
  } else if (docTitle.includes("|")) {
    const clean = docTitle.split("|")[0].trim();
    if (clean) return clean;
  }

  return "Transcrição da Aula";
}

// 2b. Extrai o nome do curso a partir do título da página
function getCourseName() {
  const raw = (document.title || "").trim();
  if (!raw) return "Curso";
  const withoutSite = raw.split("|")[0].trim();
  const parts = withoutSite.split(">").map((p) => p.trim()).filter(Boolean);
  return (parts.length > 1 ? parts[0] : withoutSite) || "Curso";
}

// 3. Extrai Texto da Transcrição
// allowExpand=false é usado na captura automática para não clicar em nada da página.
function getTranscriptText(allowExpand = true) {
  if (allowExpand) {
    const expandButtons = document.querySelectorAll("button, a, summary, [role='button']");
    for (const btn of expandButtons) {
      const text = (btn.innerText || "").toLowerCase();
      if (text.includes("mostrar transcri") || text.includes("ver transcri") || text.includes("abrir transcri")) {
        btn.click();
        break;
      }
    }
  }

  const containerSelectors = [
    ".task-body",
    ".transcricao-bloco",
    ".transcription-content",
    "[data-transcription]",
    ".formatted-text",
    ".video-solution-text",
    ".task-body__text"
  ];

  for (const sel of containerSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const paragraphs = Array.from(el.querySelectorAll("p, h2, h3, h4, li"))
        .map((p) => p.innerText.trim())
        .filter((t) => t.length > 0);
      if (paragraphs.length >= 2) {
        return paragraphs.join("\n\n");
      }
      const text = el.innerText.trim();
      if (text.length > 100) return text;
    }
  }

  const headings = document.querySelectorAll("h1, h2, h3, h4, h5, strong, span, button");
  for (const h of headings) {
    const headingText = (h.innerText || "").trim().toLowerCase();
    if (headingText === "transcrição" || headingText === "transcricao" || headingText.startsWith("transcri")) {
      const parent = h.closest("section, article, details, div");
      if (parent) {
        const paragraphs = Array.from(parent.querySelectorAll("p"))
          .map((p) => p.innerText.trim())
          .filter((t) => t.length > 0);
        if (paragraphs.length >= 2) {
          return paragraphs.join("\n\n");
        }
      }
    }
  }

  const allContainers = document.querySelectorAll("section, article, main, div");
  let bestContainer = null;
  let maxParagraphCount = 0;

  for (const cont of allContainers) {
    if (cont.closest("nav, header, footer, aside, .sidebar, #header, #footer")) continue;

    const directOrNearParagraphs = Array.from(cont.querySelectorAll("p")).filter((p) => {
      const txt = p.innerText.trim();
      return txt.length > 30 && !txt.includes("©") && !txt.includes("Cookies");
    });

    if (directOrNearParagraphs.length > maxParagraphCount) {
      maxParagraphCount = directOrNearParagraphs.length;
      bestContainer = directOrNearParagraphs;
    }
  }

  if (bestContainer && bestContainer.length >= 2) {
    return bestContainer.map((p) => p.innerText.trim()).join("\n\n");
  }

  return null;
}

// 3b. Extrai questão de múltipla escolha com alternativas e correta
function extractQuestion() {
  if (!isQuestionPage()) return null;

  const lessonTitle = getLessonTitle();

  // Texto da pergunta: primeiro <p> significativo após "Selecione uma alternativa:" ou próximo
  const questionParagraph = Array.from(document.querySelectorAll("p")).find((p) => {
    const t = p.innerText.trim();
    return t.length > 5 && !t.toLowerCase().includes("selecione uma alternativa");
  });

  const questionText = questionParagraph ? questionParagraph.innerText.trim() : "";

  // Alternativas: cada <li> com <button> contendo letra + texto
  const alternatives = [];
  let explanation = "";
  const optionItems = Array.from(document.querySelectorAll("li > button, ul > li > button"));

  optionItems.forEach((btn, index) => {
    // O próprio <button> é o container grid: primeiro filho = letra, segundo = texto
    const children = Array.from(btn.children).filter((c) => c.tagName === "DIV");
    if (children.length < 2) return;

    const letterCell = children[0];
    const textCell = children[1];
    let letter = letterCell ? letterCell.innerText.trim() : "";
    const text = textCell ? textCell.innerText.trim() : "";

    // Normaliza "A." / "A)" / "A " -> "A"
    const letterMatch = letter.match(/^([A-Za-z])[\).\s]*$/);
    if (letterMatch) letter = letterMatch[1];

    // Na alternativa correta a célula da letra exibe um ícone de check (sem texto).
    // Nesse caso, infere a letra pela posição na lista (A, B, C, D...).
    if (!/^[A-Za-z]$/.test(letter)) {
      letter = String.fromCharCode(65 + index);
    }

    // Correta: borda esquerda verde (feedback-success-default) ou ícone de check svg
    const isCorrect = !!(
      btn.classList.contains("border-l-feedback-success-default") ||
      btn.querySelector("svg")
    );

    // Explicação da correta: div com bg-task-alternative-opinion-bg dentro do mesmo <li>
    if (isCorrect) {
      const li = btn.closest("li");
      const container = li || btn.parentElement;
      if (container) {
        let opinion = container.querySelector(
          ".bg-task-alternative-opinion-bg, [class*='bg-task-alternative-opinion-bg']"
        );
        // Fallback: irmão seguinte do <li>
        if (!opinion && li && li.nextElementSibling && (li.nextElementSibling.className || "").includes("bg-task-alternative-opinion-bg")) {
          opinion = li.nextElementSibling;
        }
        if (opinion) {
          const p = opinion.querySelector("p");
          explanation = (p ? p.innerText : opinion.innerText).trim();
        }
      }
    }

    // Aceita apenas alternativas com texto
    if (text) {
      alternatives.push({ label: letter, text, correct: isCorrect });
    }
  });

  if (!questionText || alternatives.length === 0) return null;

  const correctOption = alternatives.find((a) => a.correct);
  const correctLabel = correctOption ? correctOption.label : "";
  const correctText = correctOption ? correctOption.text : "";

  // ID estável: hash simples baseado no conteúdo
  const id = (
    lessonTitle +
    "|" +
    questionText +
    "|" +
    alternatives.map((a) => a.label + a.text).join("")
  )
    .split("")
    .reduce((hash, char) => {
      hash = (hash << 5) - hash + char.charCodeAt(0);
      return hash & hash;
    }, 0)
    .toString();

  return {
    id,
    course: document.title || "",
    courseName: getCourseName(),
    lesson: lessonTitle,
    question: questionText,
    options: alternatives,
    correctExplanation: explanation,
    correctLabel,
    correctText,
    sourceUrl: window.location.href,
    capturedAt: new Date().toISOString()
  };
}

// 4. Fluxo principal de extração e salvamento (transcrição)
async function performExtraction(isAutomatic = false) {
  if (isAutomatic && !isVideoLessonPage()) {
    return;
  }

  const title = getLessonTitle();
  const transcript = getTranscriptText(!isAutomatic);

  if (!transcript) {
    if (!isAutomatic) {
      showToast("⚠️ Não foi possível encontrar a transcrição nesta página.", "#dc2626");
    }
    return;
  }

  const formattedText = `[Titulo] ${title}\n\n[Texto] ${transcript}`;

  // Capturas automáticas não tocam no clipboard (evita roubo de foco/cliques).
  if (!isAutomatic) {
    await copyToClipboard(formattedText);
  }

  chrome.runtime.sendMessage(
    {
      action: "storeTranscript",
      title,
      formattedText,
      transcript,
      courseName: getCourseName(),
      sourceUrl: window.location.href,
      isAutomatic
    },
    (res) => {
      if (res && res.success) {
        if (res.isDuplicate) {
          showToast(`ℹ️ "${title}" já estava salva no acumulado!`, "#d97706");
        } else {
          showToast(`✓ Transcrição copiada e acumulada! (${res.totalCount} aulas)`, "#047857");
        }
      }
    }
  );
}

// 4b. Fluxo de extração e salvamento de questão
async function performQuestionExtraction(isAutomatic = false) {
  if (isAutomatic && !isQuestionPage()) {
    return;
  }

  let question;
  try {
    question = extractQuestion();
  } catch (err) {
    console.error("[Captura Pro] Falha ao extrair questão:", err);
    if (!isAutomatic) {
      showToast(`⚠️ Erro ao extrair questão: ${err.message}`, "#dc2626");
    }
    return;
  }

  if (!question) {
    if (!isAutomatic) {
      showToast("⚠️ Não foi possível encontrar uma questão nesta página.", "#dc2626");
    }
    return;
  }

  // Capturas automáticas não tocam no clipboard.
  if (!isAutomatic) {
    await copyToClipboard(formatQuestionForClipboard(question));
  }

  chrome.runtime.sendMessage(
    {
      action: "storeQuestion",
      question
    },
    (res) => {
      if (res && res.success) {
        if (res.isDuplicate) {
          showToast(`ℹ️ Questão "${question.lesson}" já estava salva!`, "#d97706");
        } else {
          showToast(`✓ Questão copiada e acumulada! (${res.totalCount} questões)`, "#047857");
        }
      }
    }
  );
}

function formatQuestionForClipboard(q) {
  const optionsText = q.options
    .map((o) => `${o.label}) ${o.text}${o.correct ? "  ✓ Correta" : ""}`)
    .join("\n");

  return [
    `${q.course} > ${q.lesson}`,
    "",
    q.question,
    "",
    optionsText,
    "",
    `Resposta correta: ${q.correctLabel}`,
    q.correctExplanation ? `Explicação: ${q.correctExplanation}` : ""
  ].join("\n");
}

// 5. Escuta mensagens vindas do background (atalhos e clique no ícone).
// O guard evita listeners duplicados se o script for reinjetado.
if (!window.__aluraProContentReady) {
  window.__aluraProContentReady = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "manualCapture") {
      performExtraction(false);
      sendResponse({ ok: true });
    }

    if (request.action === "captureQuestion") {
      performQuestionExtraction(false);
      sendResponse({ ok: true });
    }
  });

  // 6. Monitoramento leve de SPA: apenas verifica mudanças de URL.
  // Não observa mutações do DOM nem intercepta cliques da página.
  let currentUrl = window.location.href;
  let autoTimer = null;

  function readAutoCaptureFlags() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(
          ["autoCaptureOnNextVideo", "questionAutoCapture"],
          (data) => resolve(data || {})
        );
      } catch (_) {
        resolve({});
      }
    });
  }

  async function runAutoCapture() {
    const data = await readAutoCaptureFlags();
    if (!data.autoCaptureOnNextVideo && !data.questionAutoCapture) return;

    try {
      if (data.autoCaptureOnNextVideo && isVideoLessonPage()) {
        performExtraction(true);
      }
      if (data.questionAutoCapture && isQuestionPage()) {
        performQuestionExtraction(true);
      }
    } catch (err) {
      console.warn("[Captura Pro] Captura automática ignorada:", err);
    }
  }

  function scheduleAutoCapture() {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(runAutoCapture, 2500);
  }

  function handlePossibleNavigation() {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      scheduleAutoCapture();
    }
  }

  setInterval(handlePossibleNavigation, 1500);
  window.addEventListener("popstate", handlePossibleNavigation);
  window.addEventListener("hashchange", handlePossibleNavigation);

  // Verificação inicial única (não repete a cada mutação da página).
  if (!window.__aluraProInitialCheck) {
    window.__aluraProInitialCheck = true;
    scheduleAutoCapture();
  }
}
