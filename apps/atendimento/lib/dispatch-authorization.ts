import type { PoolClient } from "pg";
import { canManageUsers, type AuthProfile } from "@alc/identity/auth";
import { HttpError, scopeFor, visible } from "./auth";
import {
  enabledProfiles,
  operationalUnits,
  canonicalUnit,
  receivingOperator,
  requireOperator,
} from "./operator-directory";
import {
  competence,
  driverNotificationEligible,
  type CaseRecord,
} from "./domain";

export async function dispatchOwner(
  record: CaseRecord,
  transaction: PoolClient,
) {
  const unit = canonicalUnit(await operationalUnits(), {
    base_key: record.baseKey,
    sigla: record.sigla,
  });
  if (!unit) throw new HttpError(409, "Base da PNR ausente ou ambígua.");
  const assignment = (
    await transaction.query(
      `SELECT a.*,o.roles,o.active,o.available,o.receiving FROM alc_atendimento.case_assignments a
     JOIN alc_atendimento.operators o ON o.user_id=a.assigned_to WHERE a.case_id=$1`,
      [record.caseId],
    )
  ).rows[0];
  if (
    !assignment ||
    !receivingOperator({ ...assignment, user_id: assignment.assigned_to })
  )
    throw new HttpError(409, "PNR sem atendente disponível e habilitado.");
  const profiles = await enabledProfiles(transaction);
  const owner = profiles.find((p) => p.id === assignment.assigned_to);
  if (
    !owner?.fullName?.trim() ||
    !visible(await scopeFor(owner, transaction), unit) ||
    assignment.base_key !== unit.base_key ||
    assignment.sigla !== unit.sigla
  )
    throw new HttpError(
      403,
      "Responsável sem identidade, nome ou permissão válida para esta PNR.",
    );
  return { owner, profiles, assignment, unit };
}
export async function authorizeDispatch(
  trigger: AuthProfile | null,
  record: CaseRecord,
  transaction: PoolClient,
  global = false,
) {
  const resolved = await dispatchOwner(record, transaction);
  if (trigger) {
    const actor = resolved.profiles.find((p) => p.id === trigger.id);
    if (!actor || !visible(await scopeFor(actor, transaction), resolved.unit))
      throw new HttpError(403, "Acesso ao disparo foi revogado.");
    if (global) {
      if (!canManageUsers(actor))
        throw new HttpError(
          403,
          "Disparo global restrito a gestores autorizados.",
        );
    } else {
      await requireOperator(actor, transaction);
      if (actor.id !== resolved.owner.id)
        throw new HttpError(403, "Esta PNR pertence a outro atendente.");
    }
  }
  return resolved;
}

export async function validateQueuedAuthor(
  job: Record<string, unknown>,
  transaction: PoolClient,
) {
  if (job.case_id) {
    const current = (
      await transaction.query(
        "SELECT record FROM alc_atendimento.cases WHERE case_id=$1",
        [job.case_id],
      )
    ).rows[0]?.record as CaseRecord | undefined;
    if (
      !current ||
      current.competence !== competence() ||
      current.classification === "encerrada" ||
      (job.channel === "driver"
        ? !driverNotificationEligible(current.classification) ||
          current.driverPhone !== job.phone
        : !current.customerVerified || current.customerPhone !== job.phone)
    )
      throw new HttpError(409, "Caso ou contato mudou após entrar na fila.");
  }
  if (job.dispatch_batch_id) {
    const row = (
      await transaction.query(
        "SELECT record FROM alc_atendimento.cases WHERE case_id=$1",
        [job.case_id],
      )
    ).rows[0];
    if (!row) throw new HttpError(409, "PNR removida da fila operacional.");
    if (
      job.channel === "client" &&
      !["aguardando_comprovante", "penalidade"].includes(
        row.record.classification,
      )
    )
      throw new HttpError(
        409,
        "PNR fora da tratativa de clientes após o enfileiramento.",
      );
    const resolved = await dispatchOwner(row.record, transaction);
    const batch = (
      await transaction.query(
        "SELECT * FROM alc_atendimento.dispatch_batches WHERE id=$1",
        [job.dispatch_batch_id],
      )
    ).rows[0];
    if (
      !batch ||
      resolved.owner.id !== job.assigned_to ||
      resolved.assignment.version !== job.assignment_version ||
      resolved.unit.base_key !== job.base_key ||
      resolved.unit.sigla !== job.sigla
    )
      throw new HttpError(
        409,
        "Responsável ou base mudou após o enfileiramento.",
      );
    if (batch.triggered_by) {
      const actor = resolved.profiles.find((p) => p.id === batch.triggered_by);
      if (
        !actor ||
        !visible(await scopeFor(actor, transaction), resolved.unit) ||
        (batch.mode === "global"
          ? !canManageUsers(actor)
          : actor.id !== resolved.owner.id)
      )
        throw new HttpError(
          403,
          "A autorização de quem iniciou o lote foi revogada.",
        );
    } else {
      const automation = (
        await transaction.query(
          "SELECT value FROM alc_atendimento.settings WHERE key='automation'",
        )
      ).rows[0]?.value;
      if (
        !(job.channel === "driver"
          ? automation?.driverNotifications
          : automation?.clientOutreach)
      )
        throw new HttpError(409, "Automação pausada antes do envio.");
    }
    const conversation = (
      await transaction.query(
        "SELECT * FROM alc_atendimento.conversations WHERE id=$1",
        [job.conversation_id],
      )
    ).rows[0];
    if (
      !conversation ||
      conversation.status === "resolved" ||
      conversation.phone !== job.phone ||
      (conversation.assigned_to &&
        conversation.assigned_to !== resolved.owner.id) ||
      conversation.base_key !== resolved.unit.base_key ||
      conversation.sigla !== resolved.unit.sigla
    )
      throw new HttpError(409, "Conversa mudou após o enfileiramento.");
  } else if ((job.payload as { type?: string })?.type === "template") {
    throw new HttpError(
      409,
      "Modelo legado sem responsabilidade auditável; revisão necessária.",
    );
  } else if (job.sender_kind === "human") {
    const actor = (await enabledProfiles(transaction)).find(
      (p) => p.id === job.sender_user_id,
    );
    const conversation = (
      await transaction.query(
        "SELECT * FROM alc_atendimento.conversations WHERE id=$1",
        [job.conversation_id],
      )
    ).rows[0];
    if (
      !actor ||
      !conversation ||
      conversation.assigned_to !== actor.id ||
      conversation.status !== "human" ||
      !visible(await scopeFor(actor, transaction), conversation)
    )
      throw new HttpError(403, "Resposta sem responsável autorizado vigente.");
    await requireOperator(actor, transaction);
    if (conversation.case_id) {
      const assignment = (
        await transaction.query(
          "SELECT assigned_to FROM alc_atendimento.case_assignments WHERE case_id=$1",
          [conversation.case_id],
        )
      ).rows[0];
      if (assignment?.assigned_to !== actor.id)
        throw new HttpError(403, "Responsável da PNR foi alterado.");
    }
  }
}
