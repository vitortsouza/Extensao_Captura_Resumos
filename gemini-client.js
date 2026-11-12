// gemini-client.js - Cliente mínimo do Gemini API (texto e imagem).
// Usado pela página de opções e, futuramente, pelo service worker para OCR.
(function (root) {
  "use strict";

  const FALLBACK_MODELS = [
    "models/gemini-3.5-flash-lite",
    "models/gemini-3.1-flash-lite",
    "models/gemini-2.5-flash-lite"
  ];

  const RETRYABLE_STATUS = [429, 500, 502, 503, 504];

  function modelId(model) {
    return String(model || "").trim().replace(/^models\//, "");
  }

  function apiUrl(model) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelId(model)}:generateContent`;
  }

  function extractText(json) {
    const parts = json?.candidates?.[0]?.content?.parts || [];
    return parts
      .filter((part) => part && typeof part.text === "string" && !part.thought)
      .map((part) => part.text)
      .join("")
      .trim();
  }

  function finishReason(json) {
    return json?.candidates?.[0]?.finishReason || "";
  }

  function parseDataUrl(dataUrl) {
    const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(String(dataUrl || ""));
    if (!match) throw new Error("Imagem inválida (data URL esperada).");
    return {
      mimeType: match[1] || "image/jpeg",
      base64: match[2]
    };
  }

  function errorFor(status, message, retryAfter) {
    const err = new Error(message || `HTTP ${status}`);
    err.status = status;
    err.retryAfter = retryAfter || 0;
    return err;
  }

  function messageFrom(data, status) {
    return data?.error?.message || `HTTP ${status}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function requestModel(apiKey, model, contents, generationConfig, signal) {
    const url = `${apiUrl(model)}?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, generationConfig }),
      signal
    });

    if (response.ok) {
      return { ok: true, json: await response.json() };
    }

    const data = await response.json().catch(() => ({}));
    return {
      ok: false,
      status: response.status,
      message: messageFrom(data, response.status),
      retryAfter: Number(response.headers?.get?.("retry-after")) || 0
    };
  }

  async function requestWithRetry(apiKey, model, contents, generationConfig, signal, retries) {
    let last = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      last = await requestModel(apiKey, model, contents, generationConfig, signal);
      if (last.ok) return last;
      if (!RETRYABLE_STATUS.includes(last.status) || attempt === retries) return last;

      const delay = last.retryAfter > 0
        ? Math.min(last.retryAfter * 1000, 15000)
        : Math.min(8000, 800 * Math.pow(2, attempt));
      await sleep(delay);
    }

    return last;
  }

  function isModelUnavailable(result) {
    if (result.status === 404) return true;
    if (result.status !== 400) return false;
    return /not found|not supported|does not support|unsupported|unknown model/i.test(result.message || "");
  }

  function modelList(preferred) {
    const models = [preferred, ...FALLBACK_MODELS]
      .map((model) => String(model || "").trim())
      .filter(Boolean);
    return [...new Set(models)];
  }

  /**
   * Envia uma imagem e um prompt de texto para o Gemini.
   * Tenta o modelo informado e, se ele não existir/suportar imagem, os fallbacks.
   */
  async function describeImage(options) {
    const {
      apiKey,
      model,
      prompt,
      dataUrl,
      maxOutputTokens = 2048,
      temperature = 0,
      timeoutMs = 90000,
      retries = 2
    } = options || {};

    if (!apiKey) throw new Error("Informe a chave de API do Google AI Studio.");
    if (!prompt) throw new Error("Prompt vazio.");

    const image = parseDataUrl(dataUrl);
    const contents = [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType: image.mimeType, data: image.base64 } }
      ]
    }];
    const generationConfig = { temperature, maxOutputTokens };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const tried = [];

    try {
      for (const candidate of modelList(model)) {
        const result = await requestWithRetry(
          apiKey,
          candidate,
          contents,
          generationConfig,
          controller.signal,
          retries
        );

        if (result.ok) {
          return {
            success: true,
            text: extractText(result.json),
            model: candidate,
            finishReason: finishReason(result.json),
            tried
          };
        }

        tried.push({ model: candidate, status: result.status, message: result.message });

        if (result.status === 401 || result.status === 403) {
          throw errorFor(result.status, "Chave de API inválida ou sem permissão para este modelo.");
        }
        if (result.status === 429) {
          throw errorFor(result.status, "Cota do free tier atingida (429). Aguarde e tente novamente.", result.retryAfter);
        }
        if (isModelUnavailable(result)) continue;

        throw errorFor(result.status, result.message, result.retryAfter);
      }

      const detail = tried.map((t) => `${t.model}: ${t.message}`).join(" | ");
      throw errorFor(404, `Nenhum modelo aceitou a imagem. ${detail}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Chamada de texto simples (sem imagem), usada futuramente pelo OCR/refino. */
  async function generateText(options) {
    const {
      apiKey,
      model,
      prompt,
      maxOutputTokens = 2048,
      temperature = 0.4,
      timeoutMs = 180000,
      retries = 2
    } = options || {};

    if (!apiKey) throw new Error("Informe a chave de API do Google AI Studio.");

    const contents = [{ role: "user", parts: [{ text: prompt }] }];
    const generationConfig = { temperature, maxOutputTokens };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await requestWithRetry(
        apiKey,
        model,
        contents,
        generationConfig,
        controller.signal,
        retries
      );
      if (!result.ok) {
        throw errorFor(result.status, result.message, result.retryAfter);
      }
      return {
        success: true,
        text: extractText(result.json),
        model,
        finishReason: finishReason(result.json)
      };
    } finally {
      clearTimeout(timer);
    }
  }

  root.GeminiClient = {
    FALLBACK_MODELS,
    describeImage,
    generateText,
    extractText,
    finishReason,
    parseDataUrl,
    modelId
  };
})(typeof self !== "undefined" ? self : this);
