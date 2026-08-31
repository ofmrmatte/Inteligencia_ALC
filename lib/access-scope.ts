import { hasFullAccess, type AuthProfile } from "@/lib/auth";
import { normalizeText } from "@/lib/normalize";

export interface AccessScope {
  profileId: string;
  fullAccess: boolean;
  allowedBaseKeys: string[];
  allowedSiglas: string[];
  allowedPairs: string[];
  safeSiglaOnly: string[];
}

export interface ScopedRecord {
  baseKey?: string | null;
  sigla?: string | null;
}

function uniqueNormalized(values: Array<string | null | undefined>) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function pair(sigla: string | null | undefined, baseKey: string | null | undefined) {
  const normalizedSigla = normalizeText(sigla);
  const normalizedBase = normalizeText(baseKey);
  return normalizedSigla && normalizedBase ? `${normalizedSigla}|${normalizedBase}` : "";
}

export function buildAccessScope(
  profile: AuthProfile,
  extra: { baseKeys?: string[]; siglas?: string[]; pairs?: string[]; safeSiglaOnly?: string[] } = {},
): AccessScope {
  return {
    profileId: profile.id,
    fullAccess: hasFullAccess(profile),
    allowedBaseKeys: uniqueNormalized([...(profile.baseScope ?? []), ...(extra.baseKeys ?? [])]),
    allowedSiglas: uniqueNormalized([...(profile.siglaScope ?? []), ...(extra.siglas ?? [])]),
    allowedPairs: uniqueNormalized(extra.pairs ?? []),
    safeSiglaOnly: uniqueNormalized(extra.safeSiglaOnly ?? []),
  };
}

export function getAllowedBaseIds(scope: AccessScope) {
  return scope.fullAccess ? null : scope.allowedBaseKeys;
}

export function canAccessBase(scope: AccessScope, baseKey: string | null | undefined) {
  if (scope.fullAccess) return true;
  const normalized = normalizeText(baseKey);
  return Boolean(normalized && scope.allowedBaseKeys.includes(normalized));
}

export function canAccessScopedRecord(scope: AccessScope, record: ScopedRecord) {
  if (scope.fullAccess) return true;
  const baseKey = normalizeText(record.baseKey);
  const sigla = normalizeText(record.sigla);
  if (!baseKey && !sigla) return false;

  // Registros antigos de PNR/Risco podem ter BASE_KEY igual à própria SVC.
  // Só aceitamos esse fallback quando a SVC identifica uma única base no cadastro mestre.
  if (sigla && (!baseKey || baseKey === sigla)) return scope.safeSiglaOnly.includes(sigla);

  if (baseKey && sigla) {
    // O escopo resolvido pelo servidor contém pares SVC/base e deve continuar exato.
    // Escopos legados/testes sem pares ainda podem usar a base atribuída; quando
    // existe siglaScope explícito, ele também precisa autorizar a SVC do registro.
    if (scope.allowedPairs.length > 0) return scope.allowedPairs.includes(pair(sigla, baseKey));
    return scope.allowedBaseKeys.includes(baseKey) && (scope.allowedSiglas.length === 0 || scope.allowedSiglas.includes(sigla));
  }
  if (baseKey) return scope.allowedBaseKeys.includes(baseKey);
  return Boolean(sigla && scope.safeSiglaOnly.includes(sigla));
}

export function filterByAccessScope<T extends ScopedRecord>(scope: AccessScope, records: T[]) {
  return records.filter((record) => canAccessScopedRecord(scope, record));
}
