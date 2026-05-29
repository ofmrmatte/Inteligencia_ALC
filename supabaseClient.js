(function () {
  if (!window.APP_CONFIG) {
    console.error("Configuração do Supabase não encontrada.");
    return;
  }

  const SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.APP_CONFIG.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("URL ou chave pública do Supabase não configurada.");
    return;
  }

  if (!window.supabase?.createClient) {
    console.error("SDK do Supabase não carregado.");
    return;
  }

  const isInvalidRefreshTokenError = (reason) =>
    /Invalid Refresh Token|Refresh Token Not Found|refresh_token/i.test(`${reason?.message || ""} ${reason?.error_description || ""} ${reason || ""}`);

  const clearExpiredSupabaseAuthStorage = () => {
    try {
      const projectRef = new URL(SUPABASE_URL).host.split(".")[0];
      const keys = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key && key.includes(projectRef) && key.includes("auth-token")) keys.push(key);
      }
      keys.forEach((key) => window.localStorage.removeItem(key));
    } catch (error) {
      console.warn("[AUTH] Não foi possível limpar token local expirado.", error);
    }
  };

  window.addEventListener("unhandledrejection", (event) => {
    if (!isInvalidRefreshTokenError(event.reason)) return;
    clearExpiredSupabaseAuthStorage();
    console.warn("[AUTH] Sessão local expirada; token antigo removido.");
    event.preventDefault();
  });

  const nativeConsoleError = console.error.bind(console);
  console.error = (...args) => {
    if (args.some(isInvalidRefreshTokenError)) {
      clearExpiredSupabaseAuthStorage();
      console.warn("[AUTH] Sessão local expirada; token antigo removido.");
      return;
    }
    nativeConsoleError(...args);
  };

  const supabaseFetch = (input, init = {}) => fetch(input, {
    ...init,
    cache: "no-store",
  });

  const baseSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: supabaseFetch },
  });

  const railwayStagingApiUrl = window.APP_CONFIG.RAILWAY_STAGING_API_URL;
  if (railwayStagingApiUrl && window.createRailwayStagingClient) {
    window.supabaseAuthClient = baseSupabaseClient;
    window.supabaseClient = window.createRailwayStagingClient({
      apiUrl: railwayStagingApiUrl,
      authClient: baseSupabaseClient,
    });
    console.info("[Railway Staging] Cliente do painel usando Railway para dados e Supabase Auth para login.");
    return;
  }

  window.supabaseClient = baseSupabaseClient;
})();
