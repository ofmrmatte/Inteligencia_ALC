(function initRailwayApiClient() {
  function normalizeApiUrl(apiUrl) {
    return String(apiUrl || "").replace(/\/+$/, "");
  }

  function getDataSource() {
    return String(window.APP_CONFIG?.DATA_SOURCE || "supabase");
  }

  function isEnabled() {
    return getDataSource() !== "supabase" && Boolean(window.APP_CONFIG?.RAILWAY_API_URL);
  }

  async function getAuthHeader() {
    const authClient = window.supabaseAuthClient || window.supabaseClient;
    const { data } = await authClient.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function request(path, payload = {}) {
    const apiUrl = normalizeApiUrl(window.APP_CONFIG?.RAILWAY_API_URL);
    if (!apiUrl) {
      return { data: null, error: { message: "RAILWAY_API_URL nao configurada." } };
    }

    const response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getAuthHeader()),
      },
      cache: "no-store",
      body: JSON.stringify(payload || {}),
    });

    const result = await response.json().catch(() => ({
      data: null,
      error: { message: "Resposta invalida da API Railway." },
    }));

    if (!response.ok && !result.error) {
      result.error = { message: `Railway API HTTP ${response.status}` };
    }

    return result;
  }

  window.railwayApiClient = {
    isEnabled,
    dataSource: getDataSource,
    request,
    preFatura: {
      summary(filters = {}) {
        return request("/pre-fatura/summary", { filters });
      },
      table(params = {}) {
        return request("/pre-fatura/table", params);
      },
      filters(filters = {}) {
        return request("/pre-fatura/filters", { filters });
      },
      export(filters = {}) {
        return request("/pre-fatura/export", { filters });
      },
      report(filters = {}) {
        return request("/pre-fatura/report", { filters });
      },
      files() {
        return request("/pre-fatura/files", {});
      },
      existingKeys(keys = []) {
        return request("/pre-fatura/existing-keys", { keys });
      },
      delete(payload = {}) {
        return request("/pre-fatura/delete", payload);
      },
    },
    missingPackages: {
      table(filters = {}) {
        return request("/pacotes-faltantes/table", { filters });
      },
      summary(filters = {}) {
        return request("/pacotes-faltantes/summary", { filters });
      },
      existingKeys(keys = []) {
        return request("/pacotes-faltantes/existing-keys", { keys });
      },
      updateStatus(payload = {}) {
        return request("/pacotes-faltantes/update-status", payload);
      },
      delete(ids = []) {
        return request("/pacotes-faltantes/delete", { ids });
      },
      export(filters = {}) {
        return request("/pacotes-faltantes/export", { filters });
      },
      report(filters = {}) {
        return request("/pacotes-faltantes/report", { filters });
      },
    },
    gestaoPacotes: {
      summary(filters = {}) {
        return request("/gestao-pacotes/summary", { filters });
      },
      table(params = {}) {
        return request("/gestao-pacotes/table", params);
      },
      filters(filters = {}) {
        return request("/gestao-pacotes/filters", { filters });
      },
      export(filters = {}) {
        return request("/gestao-pacotes/export", { filters });
      },
      report(filters = {}) {
        return request("/gestao-pacotes/report", { filters });
      },
      files() {
        return request("/gestao-pacotes/files", {});
      },
      existingKeys(keys = []) {
        return request("/gestao-pacotes/existing-keys", { keys });
      },
      delete(payload = {}) {
        return request("/gestao-pacotes/delete", payload);
      },
    },
  };
})();
