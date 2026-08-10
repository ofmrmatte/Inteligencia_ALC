import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth/types";

export type CurrentSession = {
  user: User | null;
  profile: Profile | null;
};

export async function getCurrentSession(): Promise<CurrentSession> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,name,email,role,is_admin,cargo,setor,avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    profile: (profile as Profile | null) ?? null,
  };
}
