import { redirect } from "next/navigation";
import { isUserRole, type AuthProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentProfile(): Promise<AuthProfile | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,global_access,base_scope,sigla_scope")
    .eq("id", userData.user.id)
    .maybeSingle();

  const role = isUserRole(profile?.role) ? profile.role : "coordinator";

  return {
    id: userData.user.id,
    email: profile?.email ?? userData.user.email ?? "",
    fullName: profile?.full_name ?? userData.user.email ?? "Usuário ALC",
    role,
    globalAccess: Boolean(profile?.global_access),
    baseScope: Array.isArray(profile?.base_scope) ? profile.base_scope : [],
    siglaScope: Array.isArray(profile?.sigla_scope) ? profile.sigla_scope : [],
  };
}

export async function requireCurrentProfile() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}
