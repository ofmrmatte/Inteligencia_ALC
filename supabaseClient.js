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

  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
