import { z } from "zod";
import type { PoolClient } from "pg";
import type { AuthProfile } from "@alc/identity/auth";
import { HttpError, requireAdmin, scopeFor, visible } from "./auth";
import { audit, db, setting } from "./db";
import {
  canonicalUnit,
  eligibleOperators,
  operationalUnits,
} from "./operator-directory";

export const assignmentSchema = z
  .object({
    caseId: z.string().min(1).max(120),
    assignedTo: z.string().uuid().nullable(),
    version: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(400),
  })
  .strict();
export async function recordAssignment(
  transaction: PoolClient,
  record: { case_id: string; base_key: string; sigla: string },
  owner: string | null,
  actor: string | null,
  reason: string,
) {
  const previous = (
    await transaction.query(
      "SELECT * FROM alc_atendimento.case_assignments WHERE case_id=$1 FOR UPDATE",
      [record.case_id],
    )
  ).rows[0];
  if (
    previous &&
    (previous.assigned_to || null) === owner &&
    previous.base_key === record.base_key &&
    previous.sigla === record.sigla
  )
    return previous.version;
  const version = (previous?.version || 0) + 1;
  await transaction.query(
    `INSERT INTO alc_atendimento.case_assignments(case_id,assigned_to,base_key,sigla,version,assigned_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(case_id) DO UPDATE SET assigned_to=excluded.assigned_to,base_key=excluded.base_key,sigla=excluded.sigla,version=excluded.version,assigned_by=excluded.assigned_by,reason=excluded.reason,updated_at=now()`,
    [
      record.case_id,
      owner,
      record.base_key,
      record.sigla,
      version,
      actor,
      reason,
    ],
  );
  await transaction.query(
    "INSERT INTO alc_atendimento.assignment_history(case_id,previous_owner,assigned_to,actor_id,base_key,sigla,reason,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      record.case_id,
      previous?.assigned_to || null,
      owner,
      actor,
      record.base_key,
      record.sigla,
      reason,
      version,
    ],
  );
  return version;
}
export async function assignCase(
  profile: AuthProfile | null,
  input: unknown,
  automatic = false,
) {
  const parsed = assignmentSchema.parse(input);
  if (!automatic) {
    if (!profile) throw new HttpError(403, "Atribuição sem autorização.");
    requireAdmin(profile);
  }
  if (
    automatic &&
    (await setting<{ mode: string }>("assignment_policy"))?.mode !==
      "primary_then_least_loaded"
  )
    return { assigned: false };
  const units = await operationalUnits(),
    candidates = await eligibleOperators();
  const candidateScopes = new Map(
    await Promise.all(
      candidates.map(async (p) => [p.id, await scopeFor(p)] as const),
    ),
  );
  const actorScope = profile ? await scopeFor(profile) : null;
  const transaction = await db().connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query(
      "SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))",
    );
    if (
      automatic &&
      (
        await transaction.query(
          "SELECT value FROM alc_atendimento.settings WHERE key='assignment_policy'",
        )
      ).rows[0]?.value?.mode !== "primary_then_least_loaded"
    ) {
      await transaction.query("COMMIT");
      return { assigned: false };
    }
    const record = (
      await transaction.query(
        "SELECT * FROM alc_atendimento.cases WHERE case_id=$1 FOR UPDATE",
        [parsed.caseId],
      )
    ).rows[0];
    if (!record || (actorScope && !visible(actorScope, record)))
      throw new HttpError(404, "PNR não encontrada.");
    const unit = canonicalUnit(units, record);
    if (!unit)
      throw new HttpError(
        409,
        "Base ou sigla da PNR não corresponde a uma unidade canônica única.",
      );
    const previous = (
      await transaction.query(
        "SELECT * FROM alc_atendimento.case_assignments WHERE case_id=$1 FOR UPDATE",
        [parsed.caseId],
      )
    ).rows[0];
    if (automatic && previous?.assigned_to) {
      await transaction.query("COMMIT");
      return { assigned: true, assignedTo: previous.assigned_to };
    }
    if (!automatic && (previous?.version || 0) !== parsed.version)
      throw new HttpError(
        409,
        "Atribuição alterada por outra pessoa. Atualize a fila.",
      );
    const eligible = (
      await transaction.query(
        `SELECT o.user_id,b.responsibility,(SELECT count(*) FROM alc_atendimento.case_assignments a JOIN alc_atendimento.cases c ON c.case_id=a.case_id WHERE a.assigned_to=o.user_id AND c.classification<>'encerrada') AS load
      FROM alc_atendimento.operators o JOIN alc_atendimento.operator_bases b USING(user_id)
      WHERE o.active=true AND o.available=true AND o.receiving=true AND 'agent'=ANY(o.roles) AND b.unit_key=$1
      ORDER BY CASE b.responsibility WHEN 'primary' THEN 0 ELSE 1 END,load,o.user_id`,
        [unit.unit_key],
      )
    ).rows.filter((r) => {
      const scope = candidateScopes.get(r.user_id);
      return scope && visible(scope, unit);
    });
    const owner = automatic ? eligible[0]?.user_id || null : parsed.assignedTo;
    if (owner && !eligible.some((r) => r.user_id === owner))
      throw new HttpError(
        403,
        "Atendente indisponível ou sem permissão para esta base.",
      );
    if (automatic && !owner) {
      await transaction.query("COMMIT");
      return { assigned: false };
    }
    if (
      previous &&
      (previous.assigned_to || null) === owner &&
      previous.base_key === unit.base_key &&
      previous.sigla === unit.sigla
    ) {
      await transaction.query("COMMIT");
      return {
        assigned: Boolean(owner),
        assignedTo: owner,
        version: previous.version,
      };
    }
    const conversations = (
      await transaction.query(
        "SELECT id,assigned_to FROM alc_atendimento.conversations WHERE case_id=$1 ORDER BY id",
        [parsed.caseId],
      )
    ).rows;
    for (const conversation of conversations) {
      await transaction.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [conversation.id],
      );
      await transaction.query(
        "UPDATE alc_atendimento.conversations SET assigned_to=$2,updated_at=now() WHERE id=$1",
        [conversation.id, owner],
      );
      await transaction.query(
        "UPDATE alc_atendimento.outbox SET status='cancelled',error='Responsável alterado; resposta anterior cancelada.',updated_at=now() WHERE conversation_id=$1 AND status='pending' AND (dedupe_key LIKE 'reply:%' OR dedupe_key LIKE 'staff:%')",
        [conversation.id],
      );
    }
    const version = await recordAssignment(
      transaction,
      { case_id: parsed.caseId, base_key: unit.base_key, sigla: unit.sigla },
      owner,
      profile?.id || null,
      parsed.reason,
    );
    await audit(
      profile?.id || null,
      "case_assigned",
      parsed.caseId,
      {
        previous: previous?.assigned_to || null,
        assignedTo: owner,
        version,
        automatic,
      },
      transaction,
    );
    await transaction.query("COMMIT");
    return { assigned: Boolean(owner), assignedTo: owner, version };
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    transaction.release();
  }
}
export async function saveAssignmentPolicy(
  profile: AuthProfile,
  input: unknown,
) {
  requireAdmin(profile);
  const policy = z
    .object({ mode: z.enum(["manual", "primary_then_least_loaded"]) })
    .strict()
    .parse(input);
  const transaction = await db().connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query(
      "SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))",
    );
    await transaction.query(
      "INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES('assignment_policy',$1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()",
      [policy, profile.id],
    );
    await audit(
      profile.id,
      "assignment_policy_changed",
      "",
      policy,
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
export async function assignmentQueue(
  profile: AuthProfile,
  offset: number,
  history = false,
) {
  requireAdmin(profile);
  const records = await db().query(
    history
      ? `SELECT h.* FROM alc_atendimento.assignment_history h ORDER BY h.created_at DESC,h.id DESC LIMIT 30 OFFSET $1`
      : `SELECT c.case_id,c.base_key,c.sigla,c.classification,a.assigned_to,coalesce(a.version,0)::int AS version FROM alc_atendimento.cases c LEFT JOIN alc_atendimento.case_assignments a USING(case_id) WHERE c.classification<>'encerrada' ORDER BY (a.assigned_to IS NULL) DESC,c.updated_at DESC,c.case_id LIMIT 30 OFFSET $1`,
    [offset],
  );
  return { records: records.rows, limit: 30, offset };
}
