import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createRailwayHybridClient } from "@/lib/db/railway-data-client";
import { requireSupabaseConfig } from "@/lib/supabase/config";

export async function createClient() {
  const config = requireSupabaseConfig();
  const cookieStore = await cookies();

  const supabase = createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
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

  return createRailwayHybridClient(supabase);
}
