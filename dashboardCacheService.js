(function initDashboardCacheService() {
  const STORAGE_KEY = "alc-dashboard-module-cache-v1";
  const CACHE_VERSION = "dashboard-cache-v2";
  const RESET_VERSION = "dashboard-reset-2026-05-20-v2";
  const RESET_MARKER_KEY = "alc-dashboard-reset-version";
  const DEFAULT_TIMEOUT_MS = 30000;

  function resetLocalDashboardCachesOnce() {
    try {
      if (window.localStorage.getItem(RESET_MARKER_KEY) === RESET_VERSION) return;
      const explicitKeys = [
        STORAGE_KEY,
        "alc-pnr-dashboard-light-cache-v1",
        "alc-pre-fatura-dashboard-state-v1",
        "alc-pre-fatura-dashboard-library-v1",
        "evolutionPeriodView",
        "comparisonPeriodView",
      ];
      const patterns = [
        /pre[_-]?fatura/i,
        /gestao[_-]?pacotes/i,
        /desvios[_-]?pnr/i,
        /pnr/i,
        /evolucao[_-]?mensal/i,
        /evolution/i,
        /dashboard[_-]?cache/i,
        /processed[_-]?files/i,
        /uploaded[_-]?files/i,
        /no[_-]?files/i,
        /has[_-]?files/i,
        /empty[_-]?state/i,
        /no[_-]?base/i,
        /base[_-]?missing/i,
        /files[_-]?empty/i,
        /module[_-]?empty/i,
      ];
      const removeFromStorage = (storage) => {
        explicitKeys.forEach((key) => storage.removeItem(key));
        const keys = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key && patterns.some((pattern) => pattern.test(key))) keys.push(key);
        }
        keys.forEach((key) => storage.removeItem(key));
      };
      removeFromStorage(window.localStorage);
      removeFromStorage(window.sessionStorage);
      window.localStorage.setItem(RESET_MARKER_KEY, RESET_VERSION);
      console.info("[Painel Cache] Caches locais antigos do dashboard foram limpos.", { version: RESET_VERSION });
    } catch (error) {
      console.warn("[Painel Cache] Não foi possível limpar caches locais antigos.", error);
    }
  }

  resetLocalDashboardCachesOnce();

  function readAll() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      console.warn("[Painel Cache] Falha ao ler cache local.", error);
      return {};
    }
  }

  function writeAll(cache) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache || {}));
    } catch (error) {
      console.warn("[Painel Cache] Falha ao salvar cache local.", error);
    }
  }

  function get(moduleKey) {
    const entry = readAll()[moduleKey];
    if (!entry || entry.version !== CACHE_VERSION) return null;
    return entry;
  }

  function set(moduleKey, payload = {}) {
    const cache = readAll();
    const entry = {
      ...payload,
      moduleKey,
      version: CACHE_VERSION,
      updatedAt: new Date().toISOString(),
    };
    cache[moduleKey] = entry;
    writeAll(cache);
    log(moduleKey, "cache local atualizado", {
      status: entry.status,
      signature: entry.signature,
      total: entry.total,
    });
    return entry;
  }

  function invalidate(moduleKey, reason = "") {
    const cache = readAll();
    if (!cache[moduleKey]) return;
    delete cache[moduleKey];
    writeAll(cache);
    log(moduleKey, "cache local invalidado", { reason });
  }

  function buildFilesSignature(moduleKey, files = []) {
    const parts = (Array.isArray(files) ? files : [])
      .map((file) => {
        const metadata = file?.metadata || {};
        return [
          file?.id || "",
          file?.file_name || file?.fileName || "",
          file?.file_size || metadata.size_bytes || "",
          metadata.file_hash || "",
          file?.updated_at || metadata.processed_at || metadata.last_loaded_at || "",
          metadata.record_count || metadata.parsed_rows || metadata.consolidated_rows || "",
          metadata.competencia || metadata.reference_year || file?.reference_year || "",
          metadata.reference_month || file?.reference_month || "",
          metadata.period_type || file?.period_type || "",
        ].join(":");
      })
      .sort();
    return `${CACHE_VERSION}:${moduleKey}:${parts.join("|") || "__empty"}`;
  }

  function log(moduleKey, message, details) {
    const label = moduleKey ? `[Painel Cache][${moduleKey}]` : "[Painel Cache]";
    if (details === undefined) console.info(label, message);
    else console.info(label, message, details);
  }

  function withTimeout(promise, timeoutMs = DEFAULT_TIMEOUT_MS, message = "Tempo limite excedido.") {
    let timeoutId = null;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timeoutId) window.clearTimeout(timeoutId);
    });
  }

  async function timed(moduleKey, label, fn, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const start = performance.now();
    log(moduleKey, `início: ${label}`);
    try {
      const result = await withTimeout(Promise.resolve().then(fn), timeoutMs, `${label}: tempo limite excedido.`);
      log(moduleKey, `fim: ${label}`, { ms: Math.round(performance.now() - start) });
      return result;
    } catch (error) {
      log(moduleKey, `erro: ${label}`, { ms: Math.round(performance.now() - start), error });
      throw error;
    }
  }

  window.dashboardCacheService = {
    version: CACHE_VERSION,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    get,
    set,
    invalidate,
    buildFilesSignature,
    log,
    withTimeout,
    timed,
  };
})();
