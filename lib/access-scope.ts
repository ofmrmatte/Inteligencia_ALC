import { hasFullAccess, type AuthProfile } from "@/lib/auth";
import { normalizeText } from "@/lib/normalize";

export interface AccessScope {
  profileId: string;
  fullAccess: boolean;
  allowedBaseKeys: string[];
  allowedSiglas: string[];
}

export interface ScopedRecord {
  baseKey?: string | null;
  sigla?: string | null;
}

function uniqueNormalized(values: Array<string | null | undefined>) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

export function buildAccessScope(
  profile: AuthProfile,
  extra: { baseKeys?: string[]; siglas?: string[] } = {},
): AccessScope {
  return {
    profileId: profile.id,
    fullAccess: hasFullAccess(profile),
    allowedBaseKeys: uniqueNormalized([...(profile.baseScope ?? []), ...(extra.baseKeys ?? [])]),
    allowedSiglas: uniqueNormalized([...(profile.siglaScope ?? []), ...(extra.siglas ?? [])]),
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
  return Boolean((baseKey && scope.allowedBaseKeys.includes(baseKey)) || (sigla && scope.allowedSiglas.includes(sigla)));
}

export function filterByAccessScope<T extends ScopedRecord>(scope: AccessScope, records: T[]) {
  return records.filter((record) => canAccessScopedRecord(scope, record));
}
