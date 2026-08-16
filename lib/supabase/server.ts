import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "@/lib/supabase/config";

export async function createClient() {
  const config = requireSupabaseConfig();
  const cookieStore = await cookies();

  const client = createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes sessions for requests.
        }
      },
    },
  });

  // Algumas rotas antigas ainda usam getUser(), que depende de uma chamada ao
  // Auth server. Se essa chamada falhar transitoriamente, não devemos tratar uma
  // sessão JWT já verificada como expirada. O fallback abaixo só é aceito depois
  // de getClaims() validar assinatura/expiração e reaproveita o usuário da sessão.
  const originalGetUser = client.auth.getUser.bind(client.auth);
  Object.defineProperty(client.auth, "getUser", {
    configurable: true,
    value: async (...args: unknown[]) => {
      const result = await originalGetUser(...(args as []));
      if (result.data.user && !result.error) return result;

      const { data: claimsData, error: claimsError } = await client.auth.getClaims();
      const claims = claimsData?.claims as { sub?: string } | undefined;
      if (claimsError || !claims?.sub) return result;

      const { data: sessionData } = await client.auth.getSession();
      if (sessionData.session?.user?.id === claims.sub) {
        return { data: { user: sessionData.session.user }, error: null };
      }

      return result;
    },
  });

  return client;
}
