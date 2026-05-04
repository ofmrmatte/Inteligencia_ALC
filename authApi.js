(function () {
  function normalizeBaseUrl(baseUrl) {
    var raw = String(baseUrl || "").trim().replace(/\/+$/, "");
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return "https://" + raw;
  }

  async function request(baseUrl, path, options) {
    var normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) throw new Error("Backend não configurado");
    var headers = new Headers((options && options.headers) || {});
    if (options && options.token) headers.set("Authorization", "Bearer " + options.token);
    if (options && options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    var response = await fetch(new URL(path, normalized).href, {
      method: (options && options.method) || "GET",
      headers: headers,
      credentials: "include",
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });
    var data = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) throw new Error(data.message || data.error || "Erro na API");
    return data;
  }

  window.authApi = {
    login: function (baseUrl, email, password) {
      return request(baseUrl, "/api/auth/login", { method: "POST", body: { email: email, password: password } });
    },
    logout: function (baseUrl, token) {
      return request(baseUrl, "/api/auth/logout", { method: "POST", token: token });
    },
    getCurrentUser: function (baseUrl, token) {
      return request(baseUrl, "/api/auth/me", { token: token });
    },
    registerUser: function (baseUrl, token, data) {
      return request(baseUrl, "/api/auth/register", { method: "POST", token: token, body: data });
    },
    getUsers: function (baseUrl, token) {
      return request(baseUrl, "/api/users", { token: token });
    },
    updateUserAdmin: function (baseUrl, token, userId, isAdmin) {
      return request(baseUrl, "/api/users/" + encodeURIComponent(userId) + "/admin", {
        method: "PATCH",
        token: token,
        body: { isAdmin: Boolean(isAdmin) },
      });
    },
  };
})();

