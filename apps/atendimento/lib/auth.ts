import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  canManageUsers,
  canAccessAtendimento,
  hasFullOperationalScope,
  isUserRole,
  type AuthProfile,
} from "@alc/identity/auth";
import { core, setting } from "./db";
import { normalize } from "./domain";
import { ENTRY_COOKIE, entrySessionKey, validEntryGrant, validEntryReceipt } from "@alc/identity/transfer";
export function inteligenciaEntryUrl() {
  return new URL(
    "/atendimento",
    process.env.INTELIGENCIA_PUBLIC_URL ||
      "https://inteligenciaalc-production.up.railway.app",
  ).toString();
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new HttpError(503, "Acesso ainda não configurado.");
  return { url, key };
}
export async function supabase(fetcher?: typeof fetch) {
  const { url, key } = authConfig();
  const store = await cookies();
  return createServerClient(url, key, {
    ...(fetcher ? { global: { fetch: fetcher } } : {}),
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          /* Proxy refreshes cookies for server components. */
        }
      },
    },
  });
}
export async function currentSessionContext(transaction?: import("pg").PoolClient, fetcher?: typeof fetch) {
  const readSetting = <T>(key: string) => transaction
    ? transaction.query<{ value: T }>("SELECT value FROM alc_atendimento.settings WHERE key=$1", [key])
      .then((result) => result.rows[0]?.value)
    : setting<T>(key);
  const client = await supabase(fetcher);
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub)
    throw new HttpError(401, "Entre com sua conta do Inteligência ALC.");
  const store = await cookies();
  if (
    typeof data.claims.session_id !== "string" || !validEntryReceipt(
      store.get(ENTRY_COOKIE)?.value,
      process.env.ATENDIMENTO_ENCRYPTION_KEY || "",
      data.claims,
    )
  )
    throw new HttpError(401, "Abra o Atendimento pelo Inteligência ALC.");
  // A signed JWT can outlive logout; the panel owns this revocable entry grant.
  const entryGrant = await readSetting(entrySessionKey(data.claims.session_id));
  if (!validEntryGrant(entryGrant, data.claims.sub))
    throw new HttpError(401, "Sessão encerrada. Abra o Atendimento pelo Inteligência ALC.");
  if (data.claims.aal !== "aal2") {
    const factors = await client.auth.mfa.listFactors();
    if (factors.error)
      throw new HttpError(503, "Não foi possível verificar o segundo fator.");
    if (factors.data.totp.length) throw new HttpError(403, "MFA_REQUIRED");
  }
  const result = await client
    .from("profiles")
    .select(
      "id,email,full_name,role,setor,global_access,base_scope,sigla_scope,module_scope,active",
    )
    .eq("id", data.claims.sub)
    .maybeSingle();
  const row = result.data;
  if (result.error)
    throw new HttpError(503, "Não foi possível consultar seu perfil.");
  if (!row || row.active === false || !isUserRole(row.role))
    throw new HttpError(403, "Perfil sem acesso ao Atendimento.");
  const profile: AuthProfile = {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    globalAccess: Boolean(row.global_access),
    baseScope: row.base_scope ?? [],
    siglaScope: row.sigla_scope ?? [],
    moduleScope: row.module_scope ?? undefined,
  };
  const access = await readSetting<{ active: boolean }>(`access_${profile.id}`);
  profile.atendimentoAccess = access?.active;
  if (!canAccessAtendimento(profile))
    throw new HttpError(403, "Seu acesso ao Atendimento está desativado.");
  return {
    client,
    profile,
    claims: {
      sub: data.claims.sub,
      session_id: data.claims.session_id,
      aal: data.claims.aal,
    },
    entryGrant: {
      profileId: data.claims.sub,
      expiresAt: (entryGrant as { expiresAt: number }).expiresAt,
    },
  };
}
export async function currentProfile(): Promise<AuthProfile> {
  return (await currentSessionContext()).profile;
}
export async function requireProfile() {
  try {
    return await currentProfile();
  } catch (error) {
    if (
      error instanceof HttpError &&
      (error.status === 401 || error.message === "MFA_REQUIRED")
    )
      redirect(inteligenciaEntryUrl());
    if (error instanceof HttpError && error.status === 403)
      redirect("/acesso-indisponivel");
    throw error;
  }
}
export function requireAdmin(profile: AuthProfile) {
  if (!canManageUsers(profile))
    throw new HttpError(403, "Administração restrita a gestores autorizados.");
}
export type Scope = { full: boolean; pairs: Set<string>; safe: Set<string> };
export async function identityScopeFor(profile: AuthProfile, units?: { unit_key: string; base_key: string; sigla: string }[]): Promise<Scope> {
  if (hasFullOperationalScope(profile))
    return { full: true, pairs: new Set(), safe: new Set() };
  const rows = units ?? (await core().query(
    "SELECT unit_key,base_key,sigla FROM public.operational_units WHERE active=true",
  )).rows;
  const assigned = new Set(profile.baseScope.map(normalize)),
    siglas = new Set(profile.siglaScope.map(normalize));
  const counts = new Map<string, number>();
  rows.forEach((r) =>
    counts.set(normalize(r.sigla), (counts.get(normalize(r.sigla)) || 0) + 1),
  );
  const visible = rows.filter(
    (r) =>
      assigned.has(normalize(r.unit_key)) ||
      (assigned.has(normalize(r.base_key)) &&
        (!siglas.size || siglas.has(normalize(r.sigla)))) ||
      (assigned.has(normalize(r.sigla)) &&
        counts.get(normalize(r.sigla)) === 1),
  );
  return {
    full: false,
    pairs: new Set(
      visible.map((r) => `${normalize(r.sigla)}|${normalize(r.base_key)}`),
    ),
    safe: new Set(
      visible
        .filter((r) => counts.get(normalize(r.sigla)) === 1)
        .map((r) => normalize(r.sigla)),
    ),
  };
}
export async function scopeFor(profile: AuthProfile, transaction?: import("pg").PoolClient): Promise<Scope> {
  const central = await identityScopeFor(profile);
  return (await import("./operator-directory")).operatorScope(profile, central, transaction);
}
export function visible(
  scope: Scope,
  row: { base_key?: string; sigla?: string },
) {
  if (scope.full) return true;
  const b = normalize(row.base_key),
    s = normalize(row.sigla);
  if (s && (!b || b === s)) return scope.safe.has(s);
  return Boolean(b && s && scope.pairs.has(`${s}|${b}`));
}
