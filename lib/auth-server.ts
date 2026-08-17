import { redirect } from "next/navigation";
import { isUserRole, type AuthProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentProfile(): Promise<AuthProfile | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { sub?: string; email?: string } | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : "";

  if (claimsError || !userId) return null;

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,email,full_name,role,global_access,base_scope,sigla_scope,xpt_scope,module_scope,driver_management_scope,active")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.active === false) return null;
  const role = isUserRole(profile.role) ? profile.role : null;
  if (!role) return null;

  return {
    id: userId,
    email: profile.email ?? claims?.email ?? "",
    fullName: profile.full_name ?? profile.email ?? claims?.email ?? "Usuário ALC",
    role,
    globalAccess: Boolean(profile.global_access) || role === "loss_admin",
    baseScope: Array.isArray(profile.base_scope) ? profile.base_scope : [],
    siglaScope: Array.isArray(profile.sigla_scope) ? profile.sigla_scope : [],
    xptScope: Array.isArray(profile.xpt_scope) ? profile.xpt_scope : [],
    moduleScope: Array.isArray(profile.module_scope) ? profile.module_scope : [],
    driverManagementScope: Array.isArray(profile.driver_management_scope) ? profile.driver_management_scope : [],
  };
}

export async function requireCurrentProfile() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}
