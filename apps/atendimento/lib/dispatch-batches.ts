import { createHash } from "node:crypto";
import { z } from "zod";
import type { AuthProfile } from "@alc/identity/auth";
import { canManageUsers } from "@alc/identity/auth";
import { db, audit } from "./db";
import { HttpError, scopeFor, visible, requireAdmin } from "./auth";
import {
  enabledProfiles,
  requireOperator,
  canSupervise,
  receivingOperator,
  canonicalUnit,
  operationalUnits,
} from "./operator-directory";
import { inboxScopeSql } from "./inbox";
import { channelConfig, type Channel } from "./meta";
import { queueTemplate } from "./source";
import { competence } from "./domain";

export const dispatchBatchSchema = z
  .object({
    batchId: z.string().uuid(),
    channel: z.enum(["client", "driver"]),
    mode: z.enum(["individual", "global"]),
    caseIds: z.array(z.string().min(1).max(120)).min(1).max(100),
  })
  .strict()
  .refine(
    (v) => new Set(v.caseIds).size === v.caseIds.length,
    "PNR repetida no lote.",
  );

export async function dispatchBatch(profile: AuthProfile, input: unknown) {
  const parsed = dispatchBatchSchema.parse(input);
  if (parsed.mode === "global") requireAdmin(profile);
  else await requireOperator(profile);
  const cfg = await channelConfig(parsed.channel);
  if (!cfg.token || !cfg.appSecret)
    throw new HttpError(409, "Configure o canal e o webhook antes de enviar.");
  const scope = await scopeFor(profile);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        channel: parsed.channel,
        mode: parsed.mode,
        cases: [...parsed.caseIds].sort(),
      }),
    )
    .digest("hex");
  const transaction = await db().connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query(
      "INSERT INTO alc_atendimento.dispatch_batches(id,triggered_by,mode,channel,request_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
      [parsed.batchId, profile.id, parsed.mode, parsed.channel, hash],
    );
    const batch = (
      await transaction.query(
        "SELECT * FROM alc_atendimento.dispatch_batches WHERE id=$1 FOR UPDATE",
        [parsed.batchId],
      )
    ).rows[0];
    if (
      batch.triggered_by !== profile.id ||
      batch.request_hash !== hash ||
      batch.mode !== parsed.mode ||
      batch.channel !== parsed.channel
    )
      throw new HttpError(
        409,
        "Identificador de lote já utilizado com outro pedido.",
      );
    await transaction.query("COMMIT");
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    transaction.release();
  }
  const results: { caseId: string; status: string; reason?: string }[] = [];
  for (const caseId of parsed.caseIds) {
    const row = (
      await db().query("SELECT * FROM alc_atendimento.cases WHERE case_id=$1", [
        caseId,
      ])
    ).rows[0];
    if (!row || !visible(scope, row)) {
      results.push({
        caseId,
        status: "blocked",
        reason: "PNR não encontrada.",
      });
      continue;
    }
    try {
      const queued = await queueTemplate(
        parsed.channel,
        row.record,
        profile,
        false,
        { batchId: parsed.batchId, global: parsed.mode === "global" },
      );
      results.push({ caseId, status: queued ? "queued" : "duplicate" });
    } catch (error) {
      results.push({
        caseId,
        status: "blocked",
        reason:
          error instanceof HttpError ||
          (error instanceof Error &&
            /^(Telefone|Contato inicial|PNR encerrada|Classificação|Modelo aprovado|Cadastro do cliente|Nome do motorista)/.test(
              error.message,
            ))
            ? error.message
            : "Disparo indisponível; nenhum envio foi confirmado.",
      });
    }
  }
  const queued = results.filter((r) => r.status === "queued").length;
  await audit(profile.id, "dispatch_batch_requested", parsed.batchId, {
    mode: parsed.mode,
    channel: parsed.channel,
    queued,
    results,
  });
  return { batchId: parsed.batchId, queued, results };
}
export async function dispatchPreview(profile: AuthProfile, channel: Channel) {
  const values: unknown[] = [],
    scope = inboxScopeSql(await scopeFor(profile), values);
  let ownership = "";
  if (!(await canSupervise(profile))) {
    values.push(profile.id);
    ownership = ` AND a.assigned_to=$${values.length}`;
  }
  values.push(channel);
  const records = (
    await db().query(
      `SELECT c.case_id,c.competence,c.classification,c.record,a.assigned_to,a.version,o.roles,o.active,o.available,o.receiving,
     (SELECT status FROM alc_atendimento.outbox q WHERE q.case_id=c.case_id AND q.channel=$${values.length} AND q.dedupe_key LIKE '%:initial' ORDER BY q.created_at,q.id LIMIT 1) AS initial_status
     FROM alc_atendimento.cases c LEFT JOIN alc_atendimento.case_assignments a USING(case_id)
     LEFT JOIN alc_atendimento.operators o ON o.user_id=a.assigned_to WHERE ${scope}${ownership}
     ORDER BY c.updated_at DESC,c.case_id DESC LIMIT 10000`,
      values,
    )
  ).rows;
  const profiles = await enabledProfiles(),
    units = await operationalUnits();
  const scopes = new Map(
    await Promise.all(
      profiles
        .filter((p) => records.some((r) => r.assigned_to === p.id))
        .map(async (p) => [p.id, await scopeFor(p)] as const),
    ),
  );
  return {
    records: records.map((r) => {
      const owner = profiles.find((p) => p.id === r.assigned_to),
        unit = canonicalUnit(units, {
          base_key: r.record.baseKey,
          sigla: r.record.sigla,
        });
      const ownerScope = owner && scopes.get(owner.id);
      return {
        ...r,
        operator_name: owner?.fullName || "",
        dispatch_block:
          !owner?.fullName?.trim() ||
          !unit ||
          !ownerScope ||
          !visible(ownerScope, unit) ||
          !receivingOperator(r)
            ? "PNR sem responsável disponível e autorizado"
            : !canManageUsers(profile) && owner.id !== profile.id
              ? "PNR de outro atendente"
              : "",
      };
    }),
    competence: competence(),
    limit: 10000,
  };
}
