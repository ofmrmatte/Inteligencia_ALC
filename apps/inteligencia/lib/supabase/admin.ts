import { createClient } from "@supabase/supabase-js";
import { createRailwayHybridClient } from "@/lib/db/railway-data-client";
import { requireSupabaseConfig } from "@/lib/supabase/config";

export function createAdminClient() {
  const { supabaseUrl } = requireSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return createRailwayHybridClient(supabase);
}
