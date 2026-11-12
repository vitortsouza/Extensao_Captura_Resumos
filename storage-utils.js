// storage-utils.js - Camada de armazenamento com compressão (LZString) e migração para IndexedDB.
// Carregada pelo service worker (importScripts) e pela página de opções (script comum).
(function (root) {
  "use strict";

  const COMPRESS_THRESHOLD = 64 * 1024;   // 64 KB: começa a comprimir
  const IDB_THRESHOLD = 2 * 1024 * 1024;  // 2 MB: move para IndexedDB
  const META_KEY = "__aluraLargeKeys";
  const IDB_NAME = "alura_extension_store";
  const IDB_STORE = "large_values";

  function byteLength(str) {
    try {
      return new TextEncoder().encode(String(str)).byteLength;
    } catch (_) {
      return String(str).length * 2;
    }
  }

  function lz() {
    return typeof LZString !== "undefined" ? LZString : null;
  }

  function compressText(text) {
    const lib = lz();
    if (!lib || typeof text !== "string" || byteLength(text) < COMPRESS_THRESHOLD) return null;
    try {
      const compressed = lib.compressToUTF16(text);
      // Só compensa se reduzir de verdade.
      if (compressed && byteLength(compressed) < byteLength(text) * 0.92) return compressed;
    } catch (_) { /* ignora e guarda sem compressão */ }
    return null;
  }

  function decompressText(text) {
    const lib = lz();
    if (!lib || typeof text !== "string") return null;
    try {
      return lib.decompressFromUTF16(text);
    } catch (_) {
      return null;
    }
  }

  // ---------- IndexedDB ----------
  function openDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponível"));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Falha ao abrir IndexedDB"));
    });
  }

  async function idbPut(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Falha ao gravar no IndexedDB"));
    });
  }

  async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Falha ao ler do IndexedDB"));
    });
  }

  async function idbDelete(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Falha ao remover do IndexedDB"));
    });
  }

  function storage() {
    if (!root.chrome || !root.chrome.storage || !root.chrome.storage.local) {
      throw new Error("chrome.storage.local indisponível");
    }
    return root.chrome.storage.local;
  }

  async function readMeta() {
    const data = await storage().get([META_KEY]);
    return data[META_KEY] || {};
  }

  async function hydrateKey(data, key, info) {
    let value;
    if (info && info.idb) {
      try {
        value = await idbGet(key);
      } catch (_) {
        value = undefined;
      }
    } else {
      value = data[key];
    }

    if (typeof value === "string" && info && info.compressed) {
      const plain = decompressText(value);
      if (plain !== null) value = plain;
    }

    if (typeof value === "string" && info && info.json) {
      try { value = JSON.parse(value); } catch (_) { /* mantém string */ }
    }

    return value;
  }

  const AluraStore = {
    /**
     * Lê chaves (array, string ou null para tudo) já hidratadas/descomprimidas.
     */
    async get(keys) {
      const isAll = keys === null || keys === undefined;
      const list = isAll ? [] : (Array.isArray(keys) ? keys : [keys]);
      const request = isAll ? null : list.concat([META_KEY]);
      const data = isAll ? await storage().get(null) : await storage().get(request);
      const meta = data[META_KEY] || {};
      delete data[META_KEY];

      const targets = isAll ? Object.keys(meta) : list;
      await Promise.all(
        targets.map(async (key) => {
          const info = meta[key];
          if (!info) return;
          const value = await hydrateKey(data, key, info);
          if (value === undefined) delete data[key];
          else data[key] = value;
        })
      );

      return data;
    },

    async getAll() {
      return this.get(null);
    },

    /**
     * Grava valores. Strings/objetos grandes são comprimidos (LZString) e,
     * acima de 2 MB, movidos para o IndexedDB, liberando a cota do storage.local.
     */
    async set(values) {
      if (!values || typeof values !== "object") return;
      const meta = await readMeta();
      const toSet = {};
      const toRemove = [];

      for (const key of Object.keys(values)) {
        const value = values[key];

        if (value === undefined) {
          delete meta[key];
          toRemove.push(key);
          try { await idbDelete(key); } catch (_) { /* ok */ }
          continue;
        }

        let serialized = null;
        let isJson = false;
        if (typeof value === "string") {
          serialized = value;
        } else if (value !== null && typeof value === "object") {
          try {
            serialized = JSON.stringify(value);
            isJson = true;
          } catch (_) {
            toSet[key] = value;
            delete meta[key];
            continue;
          }
        }

        if (serialized === null) {
          // Número, booleano, null: grava direto.
          toSet[key] = value;
          if (meta[key]) {
            if (meta[key].idb) {
              try { await idbDelete(key); } catch (_) { /* ok */ }
            }
            delete meta[key];
          }
          continue;
        }

        const compressed = compressText(serialized);
        const payload = compressed || serialized;
        const payloadBytes = byteLength(payload);

        if (payloadBytes >= IDB_THRESHOLD) {
          try {
            await idbPut(key, payload);
            await storage().remove([key]);
            meta[key] = {
              idb: true,
              compressed: !!compressed,
              json: isJson,
              originalBytes: byteLength(serialized),
              storedBytes: payloadBytes
            };
            continue;
          } catch (_) {
            // Se o IndexedDB falhar, mantém no storage.local sem compressão.
          }
        }

        toSet[key] = payload;
        if (compressed || isJson) {
          meta[key] = {
            idb: false,
            compressed: !!compressed,
            json: isJson,
            originalBytes: byteLength(serialized),
            storedBytes: byteLength(payload)
          };
        } else if (meta[key]) {
          if (meta[key].idb) {
            try { await idbDelete(key); } catch (_) { /* ok */ }
          }
          delete meta[key];
        }
      }

      toSet[META_KEY] = meta;
      await storage().set(toSet);
      if (toRemove.length) {
        try { await storage().remove(toRemove); } catch (_) { /* ok */ }
      }
    },

    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      const meta = await readMeta();
      for (const key of list) {
        delete meta[key];
        try { await idbDelete(key); } catch (_) { /* ok */ }
      }
      await storage().remove(list.concat([META_KEY]));
      await storage().set({ [META_KEY]: meta });
    },

    async getMeta() {
      return readMeta();
    },

    estimateTokens(text) {
      if (!text) return 0;
      // Aproximação usada pelo Gemini: ~4 caracteres por token.
      return Math.ceil(String(text).length / 4);
    }
  };

  root.AluraStore = AluraStore;
})(typeof globalThis !== "undefined" ? globalThis : self);
