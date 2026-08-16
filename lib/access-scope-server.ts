import { buildAccessScope, type AccessScope } from "@/lib/access-scope";
import type { AuthProfile } from "@/lib/auth";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

function profileIdentityKeys(profile: AuthProfile) {
  const localPart = profile.email.split("@")[0] ?? "";
  return new Set([profile.fullName, profile.email, localPart].map(normalizeText).filter(Boolean));
}

export async function getUserAccessScope(profile: AuthProfile): Promise<AccessScope> {
  const baseKeys = new Set<string>();
  const siglas = new Set<string>();
  const scope = buildAccessScope(profile);
  if (scope.fullAccess) return scope;

  const admin = createAdminClient();
  const [assignments, hierarchy] = await Promise.all([
    admin.from("admin_base_assignments").select("base_key").eq("admin_id", profile.id).eq("active", true),
    admin.from("hierarchy_scopes").select("coordinator_name,supervisor_name,base_key,sigla"),
  ]);
  if (assignments.error) throw new Error(assignments.error.message);
  if (hierarchy.error) throw new Error(hierarchy.error.message);

  for (const row of (assignments.data ?? []) as DbRow[]) {
    const baseKey = normalizeText(row.base_key);
    if (baseKey) baseKeys.add(baseKey);
  }

  const identities = profileIdentityKeys(profile);
  for (const row of (hierarchy.data ?? []) as DbRow[]) {
    const coordinatorMatch = profile.role === "coordinator" && identities.has(normalizeText(row.coordinator_name));
    const supervisorMatch = profile.role === "supervisor" && identities.has(normalizeText(row.supervisor_name));
    if (!coordinatorMatch && !supervisorMatch) continue;
    const baseKey = normalizeText(row.base_key);
    const sigla = normalizeText(row.sigla);
    if (baseKey) baseKeys.add(baseKey);
    if (sigla) siglas.add(sigla);
  }

  return buildAccessScope(profile, { baseKeys: [...baseKeys], siglas: [...siglas] });
}
