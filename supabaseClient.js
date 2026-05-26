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
