import { buildAccessScope, type AccessScope } from "@/lib/access-scope";
import { hasFullAccess, type AuthProfile } from "@/lib/auth";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

interface UnitRow {
  unit_key: string;
  sigla: string;
  base_key: string;
  active: boolean;
}

export async function getUserAccessScope(profile: AuthProfile): Promise<AccessScope> {
  if (hasFullAccess(profile)) return buildAccessScope(profile);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("operational_units")
    .select("unit_key,sigla,base_key,active")
    .eq("active", true);
  if (error) throw new Error(`operational_units: ${error.message}`);

  const units = (data ?? []) as UnitRow[];
  const assignedBases = new Set((profile.baseScope ?? []).map(normalizeText));
  const assignedSiglas = new Set((profile.siglaScope ?? []).map(normalizeText));
  const siglaCounts = new Map<string, number>();
  for (const unit of units) {
    const sigla = normalizeText(unit.sigla);
    siglaCounts.set(sigla, (siglaCounts.get(sigla) ?? 0) + 1);
  }

  const visible = units.filter((unit) => {
    const unitKey = normalizeText(unit.unit_key);
    const baseKey = normalizeText(unit.base_key);
    const sigla = normalizeText(unit.sigla);
    if (assignedBases.has(unitKey)) return true;
    if (assignedBases.has(baseKey) && (assignedSiglas.size === 0 || assignedSiglas.has(sigla))) return true;
    // Compatibilidade com escopos antigos que armazenavam apenas a sigla,
    // mas somente quando ela representa uma única unidade no cadastro mestre.
    return assignedBases.has(sigla) && (siglaCounts.get(sigla) ?? 0) === 1;
  });

  return buildAccessScope(profile, {
    baseKeys: visible.map((unit) => unit.base_key),
    siglas: visible.map((unit) => unit.sigla),
    pairs: visible.map((unit) => `${normalizeText(unit.sigla)}|${normalizeText(unit.base_key)}`),
    safeSiglaOnly: visible.filter((unit) => (siglaCounts.get(normalizeText(unit.sigla)) ?? 0) === 1).map((unit) => unit.sigla),
  });
}
