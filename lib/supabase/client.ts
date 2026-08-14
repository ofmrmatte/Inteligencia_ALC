"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "@/lib/supabase/config";

export function createClient() {
  const config = requireSupabaseConfig();
  return createBrowserClient(config.supabaseUrl, config.supabasePublishableKey);
}
