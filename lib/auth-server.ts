import { redirect } from "next/navigation";
import { isUserRole, type AuthProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { retrySupabaseResult } from "@/lib/supabase/retry";

type ProfileResolution =
  | { status: "authenticated"; profile: AuthProfile }
  | { status: "unauthenticated" }
  | { status: "forbidden" };

async function resolveCurrentProfile(): Promise<ProfileResolution> {
  if (!isSupabaseConfigured()) return { status: "unauthenticated" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { sub?: string; email?: string } | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : "";

  if (claimsError) throw new Error("CLAIMS_LOOKUP_FAILED");
  if (!userId) return { status: "unauthenticated" };

  const { data: profile, error: profileError } = await retrySupabaseResult(
    () => supabase
      .from("profiles")
      .select("id,email,full_name,role,global_access,base_scope,sigla_scope,xpt_scope,module_scope,driver_management_scope,active")
      .eq("id", userId)
      .maybeSingle(),
    [200],
  );

  if (profileError) throw new Error("PROFILE_LOOKUP_FAILED");
  if (!profile || profile.active === false) return { status: "forbidden" };
  const role = isUserRole(profile.role) ? profile.role : null;
  if (!role) return { status: "forbidden" };

  return {
    status: "authenticated",
    profile: {
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
    },
  };
}

export async function getCurrentProfile(): Promise<AuthProfile | null> {
  const result = await resolveCurrentProfile();
  return result?.status === "authenticated" ? result.profile : null;
}

export async function requireCurrentProfile(): Promise<AuthProfile> {
  const result = await resolveCurrentProfile();
  if (result?.status === "authenticated") return result.profile;
  redirect(result?.status === "forbidden" ? "/login?error=access" : "/login");
}
