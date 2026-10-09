import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { PoolClient } from "pg";
import {
  canAccessAtendimento,
  canManageUsers,
  isUserRole,
  type AuthProfile,
} from "@alc/identity/auth";
import {
  authConfig,
  HttpError,
  identityScopeFor,
  requireAdmin,
  visible,
  type Scope,
} from "./auth";
import { audit, core, db } from "./db";
import { normalize } from "./domain";

export const OPERATOR_ROLES = {
  agent: "Atendente",
  supervisor: "Supervisor",
  coordinator: "Coordenador",
  manager: "Gerente",
  director: "Diretor",
  admin: "Administrador",
} as const;
export const operatorSchema = z
  .object({
    userId: z.string().uuid(),
    roles: z
      .array(
        z.enum([
          "agent",
          "supervisor",
          "coordinator",
          "manager",
          "director",
          "admin",
        ]),
      )
      .min(1)
      .max(6),
    active: z.boolean(),
    available: z.boolean(),
    receiving: z.boolean(),
    bases: z
      .array(
        z
          .object({
            unitKey: z.string().min(1).max(250),
            responsibility: z.enum(["primary", "substitute"]),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type Operator = {
  user_id: string;
  roles: string[];
  active: boolean;
  available: boolean;
  receiving: boolean;
};
export type Unit = {
  unit_key: string;
  base_key: string;
  sigla: string;
  base_name: string;
  xpt_code: string;
  coordinator_name: string;
  supervisors: string[];
};
export async function operationalUnits(): Promise<Unit[]> {
  return (
    await core()
      .query(`SELECT u.unit_key,u.base_key,u.sigla,u.base_name,u.xpt_code,u.coordinator_name,
    coalesce((SELECT array_agg(s.supervisor_name ORDER BY s.supervisor_name) FROM public.operational_unit_supervisors s WHERE s.unit_key=u.unit_key AND s.active=true),'{}') AS supervisors
    FROM public.operational_units u WHERE u.active=true ORDER BY u.sigla,u.base_name`)
  ).rows;
}
export function canonicalUnit(
  units: Unit[],
  row: { base_key?: string; sigla?: string },
) {
  const sigla = normalize(row.sigla),
    base = normalize(row.base_key);
  if (!sigla || ["SVC", "XPT"].includes(sigla)) return null;
  const matches = units.filter(
    (u) =>
      normalize(u.sigla) === sigla &&
      (!base || base === sigla || normalize(u.base_key) === base),
  );
  return matches.length === 1 ? matches[0] : null;
}
export function receivingOperator(operator: Operator | undefined) {
  return Boolean(
    operator?.active &&
      operator.available &&
      operator.receiving &&
      operator.roles.includes("agent"),
  );
}
export async function enabledProfiles(transaction?: PoolClient): Promise<AuthProfile[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new HttpError(503, "Cadastro de responsáveis não configurado.");
  const client = createClient(authConfig().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from("profiles")
    .select(
      "id,full_name,email,role,active,global_access,base_scope,sigla_scope,module_scope",
    )
    .limit(500);
  if (error || data?.length === 500)
    throw new HttpError(
      503,
      "Cadastro de identidades indisponível ou acima do limite de consulta.",
    );
  const access = (
    await (transaction || db()).query(
      "SELECT key,value FROM alc_atendimento.settings WHERE key=ANY($1::text[])",
      [(data || []).map((r) => `access_${r.id}`)],
    )
  ).rows;
  return (data || []).flatMap((r) => {
    if (r.active === false || !isUserRole(r.role)) return [];
    const profile: AuthProfile = {
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      role: r.role,
      globalAccess: Boolean(r.global_access),
      baseScope: r.base_scope || [],
      siglaScope: r.sigla_scope || [],
      moduleScope: r.module_scope ?? undefined,
      atendimentoAccess: access.find((a) => a.key === `access_${r.id}`)?.value
        ?.active,
    };
    return canAccessAtendimento(profile) ? [profile] : [];
  });
}
export async function operatorScope(
  profile: AuthProfile,
  central: Scope,
  transaction?: PoolClient,
): Promise<Scope> {
  if (canManageUsers(profile)) return central;
  const { rows } = await (transaction || db()).query(
    `SELECT b.* FROM alc_atendimento.operator_bases b JOIN alc_atendimento.operators o USING(user_id) WHERE o.user_id=$1 AND o.active=true`,
    [profile.id],
  );
  const units = await operationalUnits(),
    pairs = new Set<string>(),
    safe = new Set<string>();
  for (const row of rows) {
    const unit = canonicalUnit(units, row);
    if (!unit || unit.unit_key !== row.unit_key || !visible(central, row))
      continue;
    pairs.add(`${normalize(unit.sigla)}|${normalize(unit.base_key)}`);
    if (
      units.filter((u) => normalize(u.sigla) === normalize(unit.sigla))
        .length === 1
    )
      safe.add(normalize(unit.sigla));
  }
  return { full: false, pairs, safe };
}
export async function eligibleOperators() {
  const profiles = await enabledProfiles();
  const operators = (
    await db().query(
      "SELECT * FROM alc_atendimento.operators WHERE active=true AND available=true AND receiving=true AND 'agent'=ANY(roles)",
    )
  ).rows as Operator[];
  return profiles.filter((profile) =>
    receivingOperator(operators.find((o) => o.user_id === profile.id)),
  );
}
export async function requireOperator(
  profile: AuthProfile,
  transaction?: PoolClient,
) {
  const operator = (
    await (transaction || db()).query(
      "SELECT * FROM alc_atendimento.operators WHERE user_id=$1",
      [profile.id],
    )
  ).rows[0] as Operator | undefined;
  if (!operator?.active || !operator.roles.includes("agent"))
    throw new HttpError(
      403,
      "A função de atendente deve ser atribuída explicitamente.",
    );
  return operator;
}
export async function canSupervise(
  profile: AuthProfile,
  transaction?: PoolClient,
) {
  if (canManageUsers(profile)) return true;
  const operator = (
    await (transaction || db()).query(
      "SELECT * FROM alc_atendimento.operators WHERE user_id=$1",
      [profile.id],
    )
  ).rows[0] as Operator | undefined;
  return Boolean(
    operator?.active && operator.roles.some((role) => role !== "agent"),
  );
}
export async function listOperators(profile: AuthProfile) {
  requireAdmin(profile);
  const [profiles, units, operators, bases, counts] = await Promise.all([
    enabledProfiles(),
    operationalUnits(),
    db().query("SELECT * FROM alc_atendimento.operators ORDER BY user_id"),
    db().query(
      "SELECT * FROM alc_atendimento.operator_bases ORDER BY sigla,base_key",
    ),
    db().query(
      "SELECT assigned_to,count(*)::int AS conversations FROM alc_atendimento.conversations WHERE status<>'resolved' GROUP BY assigned_to",
    ),
  ]);
  return {
    profiles: profiles.map((p) => ({ id: p.id, name: p.fullName || p.email })),
    units,
    records: operators.rows.map((o) => ({
      ...o,
      name:
        profiles.find((p) => p.id === o.user_id)?.fullName ||
        "Identidade indisponível",
      identityEnabled: profiles.some((p) => p.id === o.user_id),
      bases: bases.rows.filter((b) => b.user_id === o.user_id),
      conversations:
        counts.rows.find((c) => c.assigned_to === o.user_id)?.conversations ||
        0,
    })),
  };
}
export async function saveOperator(profile: AuthProfile, input: unknown) {
  requireAdmin(profile);
  const parsed = operatorSchema.parse(input),
    target = (await enabledProfiles()).find((p) => p.id === parsed.userId);
  if (!target && parsed.active)
    throw new HttpError(
      403,
      "Identidade desabilitada ou sem acesso ao Atendimento.",
    );
  const units = await operationalUnits(),
    scope = target
      ? await identityScopeFor(target)
      : { full: false, pairs: new Set<string>(), safe: new Set<string>() };
  if (new Set(parsed.bases.map((b) => b.unitKey)).size !== parsed.bases.length)
    throw new HttpError(400, "Base repetida.");
  const bases = parsed.bases.map((base) => {
    const unit = units.find((u) => u.unit_key === base.unitKey);
    if (
      !unit ||
      ["SVC", "XPT"].includes(normalize(unit.sigla)) ||
      (parsed.active && !visible(scope, unit))
    )
      throw new HttpError(
        403,
        "Base inválida ou fora do escopo central do responsável.",
      );
    return { ...base, unit };
  });
  const transaction = await db().connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query(
      "SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))",
    );
    await transaction.query(
      `INSERT INTO alc_atendimento.operators(user_id,roles,active,available,receiving,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET roles=excluded.roles,active=excluded.active,available=excluded.available,receiving=excluded.receiving,updated_by=excluded.updated_by,updated_at=now()`,
      [
        parsed.userId,
        [...new Set(parsed.roles)],
        parsed.active,
        parsed.available,
        parsed.receiving,
        profile.id,
      ],
    );
    await transaction.query(
      "DELETE FROM alc_atendimento.operator_bases WHERE user_id=$1",
      [parsed.userId],
    );
    for (const b of bases)
      await transaction.query(
        "INSERT INTO alc_atendimento.operator_bases(user_id,unit_key,base_key,sigla,responsibility) VALUES($1,$2,$3,$4,$5)",
        [
          parsed.userId,
          b.unit.unit_key,
          b.unit.base_key,
          b.unit.sigla,
          b.responsibility,
        ],
      );
    await audit(
      profile.id,
      "operator_updated",
      parsed.userId,
      {
        roles: parsed.roles,
        active: parsed.active,
        available: parsed.available,
        receiving: parsed.receiving,
        bases: bases.map((b) => b.unit.unit_key),
      },
      transaction,
    );
    await transaction.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    transaction.release();
  }
}
