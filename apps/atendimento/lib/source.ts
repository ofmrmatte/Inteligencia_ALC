import { core, db, setting, audit } from "./db";
import {
  competence,
  classification,
  driverNotificationEligible,
  phone,
  knownPurchaseValue,
  templateParameters,
  type CaseRecord,
} from "./domain";
import { templates, type Channel } from "./meta";
import { assignCase } from "./assignment-engine";
import { createHash, randomUUID } from "node:crypto";
import type { AuthProfile } from "@alc/identity/auth";
import { HttpError, requireAdmin, scopeFor, visible } from "./auth";
import { authorizeDispatch } from "./dispatch-authorization";
import { caseFingerprint, CASE_COMPARISON_VERSION } from "./sync-delta";
import { enqueueVerifiedContact } from "./sync-enrichment";
import { z } from "zod";
export type Automation = {
  driverNotifications: boolean;
  clientOutreach: boolean;
  bot: boolean;
  operatorName: string;
  intervalMinutes: 30;
};
export async function verifyCustomerContact(
  profile: AuthProfile,
  input: unknown,
) {
  requireAdmin(profile);
  const parsed = z
    .object({
      caseId: z.string().trim().min(1).max(200),
      name: z.string().trim().min(1).max(200),
      phone: z.string().trim().min(1).max(200),
      verified: z.literal(true),
      document: z.string().max(100).optional(),
      address: z.string().max(500).optional(),
      sourceUrl: z.url().max(1000).optional(),
    })
    .strict()
    .parse(input);
  const number = phone(parsed.phone);
  if (!number) throw new HttpError(400, "Telefone inválido.");
  const transaction = await db().connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `atendimento_case:${parsed.caseId}`,
    ]);
    const row = (
      await transaction.query(
        "SELECT * FROM alc_atendimento.cases WHERE case_id=$1 FOR UPDATE",
        [parsed.caseId],
      )
    ).rows[0];
    if (!row || !visible(await scopeFor(profile, transaction), row))
      throw new HttpError(404, "PNR não encontrada.");
    if (parsed.sourceUrl) {
      const source = new URL(parsed.sourceUrl);
      if (
        source.protocol !== "https:" ||
        source.hostname !== "envios.adminml.com" ||
        source.port ||
        source.username ||
        source.password ||
        source.search ||
        source.hash ||
        source.pathname !==
          `/logistics/package-management/package/${row.record.shipmentId}`
      )
        throw new HttpError(400, "Fonte do comprador inválida.");
    }
    const record = {
      ...row.record,
      customerName: parsed.name,
      customerPhone: number,
      customerVerified: true,
      customerDocument: parsed.document || row.record.customerDocument || "",
      customerAddress: parsed.address || row.record.customerAddress || "",
      customerSource: parsed.sourceUrl || "validado_pela_equipe",
      customerCapturedAt: new Date().toISOString(),
    };
    await transaction.query(
      `UPDATE alc_atendimento.cases SET record=$2,customer_phone=$3,comparison_version=${CASE_COMPARISON_VERSION},fingerprint=$4,updated_at=now() WHERE case_id=$1`,
      [parsed.caseId, record, number, caseFingerprint(record)],
    );
    await enqueueVerifiedContact(transaction, record);
    await audit(
      profile.id,
      "customer_contact_verified",
      parsed.caseId,
      {},
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
export function validateInitialContact(channel: Channel, record: CaseRecord) {
  const to = channel === "driver" ? record.driverPhone : record.customerPhone;
  if (!phone(to)) throw new Error("Telefone não validado.");
  if (record.competence !== competence())
    throw new Error("Contato inicial limitado à competência vigente.");
  if (record.classification === "encerrada") throw new Error("PNR encerrada.");
  if (
    channel === "client" &&
    !["aguardando_comprovante", "penalidade"].includes(record.classification)
  )
    throw new Error("Classificação fora da tratativa de clientes.");
  if (
    channel === "driver" &&
    !driverNotificationEligible(record.classification)
  )
    throw new Error("Classificação fora das notificações de motoristas.");
  templateParameters(channel, record, "Validação");
  return to;
}
export async function queueTemplate(
  channel: Channel,
  input: CaseRecord,
  trigger: AuthProfile | null,
  automatic = false,
  options: { batchId?: string; global?: boolean } = {},
) {
  // Local until the parent's client-safe agent-brand constant is integrated.
  const AGENT_DISPLAY_NAME = "Ellie";
  validateInitialContact(channel, input);
  const { readTemplateContract } = await import("./template-contract-config");
  const { assertTemplateSender, reviewTemplateContract, validateTemplateContract, semanticTemplateValues } = await import("./template-contract");
  const { channelConfig } = await import("./meta");
  await readTemplateContract(channel);
  const config = await channelConfig(channel);
  // The legacy cliente_loss template omits the approved purchase amount.
  // Require separately approved v2 to avoid silently sending an outdated script.
  const name = channel === "driver" ? "pnraberta" : "cliente_loss_v2";
  const catalog = await templates(channel, config);
  const transaction = await db().connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query(
      "SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))",
    );
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `atendimento_case:${input.caseId}`,
    ]);
    const row = (
      await transaction.query(
        "SELECT * FROM alc_atendimento.cases WHERE case_id=$1 FOR UPDATE",
        [input.caseId],
      )
    ).rows[0];
    if (!row) throw new HttpError(404, "PNR não encontrada.");
    const record = row.record as CaseRecord,
      to = validateInitialContact(channel, record);
    const { owner, assignment, unit } = await authorizeDispatch(
      trigger,
      record,
      transaction,
      options.global,
    );
    if (!trigger && !automatic)
      throw new HttpError(403, "Disparo sem autorização.");
    if (automatic) {
      const automation = (
        await transaction.query(
          "SELECT value FROM alc_atendimento.settings WHERE key='automation'",
        )
      ).rows[0]?.value;
      if (
        !(channel === "driver"
          ? automation?.driverNotifications
          : automation?.clientOutreach)
      )
        throw new HttpError(409, "Automação pausada.");
    }
    const duplicate = await transaction.query(
      "SELECT id FROM alc_atendimento.outbox WHERE case_id=$1 AND channel=$2 AND dedupe_key LIKE '%:initial' LIMIT 1",
      [record.caseId, channel],
    );
    if (duplicate.rowCount) {
      await audit(
        trigger?.id || null,
        "template_duplicate",
        record.caseId,
        { channel, automatic },
        transaction,
      );
      await transaction.query("COMMIT");
      return false;
    }
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`atendimento_meta_contract:${channel}`]);
    const { revision, contract } = await readTemplateContract(channel, transaction);
    assertTemplateSender(contract, config);
    reviewTemplateContract(contract, catalog);
    const components = templateParameters(channel, record, owner.fullName!);
    const approved = catalog.find((entry) => entry.name === name && entry.language === "pt_BR");
    const evidence = validateTemplateContract(approved, contract, components,
      semanticTemplateValues(channel, record, owner.fullName!));
    const previous = (
      await transaction.query(
        "SELECT * FROM alc_atendimento.conversations WHERE channel=$1 AND phone=$2",
        [channel, to],
      )
    ).rows[0];
    if (previous) {
      await transaction.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [previous.id],
      );
      const current = (
        await transaction.query(
          "SELECT * FROM alc_atendimento.conversations WHERE id=$1 FOR UPDATE",
          [previous.id],
        )
      ).rows[0];
      if (
        current &&
        ((current.assigned_to && current.assigned_to !== owner.id) ||
          (channel === "client" &&
            current.case_id !== record.caseId &&
            current.status !== "resolved") ||
          (channel === "driver" &&
            ((current.driver_id && current.driver_id !== record.driverId) ||
              (current.base_key && current.base_key !== unit.base_key) ||
              (current.sigla && current.sigla !== unit.sigla))))
      )
        throw new HttpError(
          409,
          "Contato possui uma tratativa incompatível. Revisão necessária.",
        );
    }
    const conversation = await transaction.query(
      `INSERT INTO alc_atendimento.conversations(channel,phone,name,base_key,sigla,case_id,driver_id,identity_verified,agent_state,assigned_to)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(channel,phone) DO UPDATE SET
       name=excluded.name,base_key=excluded.base_key,sigla=excluded.sigla,driver_id=excluded.driver_id,assigned_to=excluded.assigned_to,
       identity_verified=CASE WHEN alc_atendimento.conversations.channel='client' THEN excluded.identity_verified ELSE alc_atendimento.conversations.identity_verified END,
       case_id=CASE WHEN alc_atendimento.conversations.channel='client' THEN excluded.case_id ELSE coalesce(alc_atendimento.conversations.case_id,excluded.case_id) END,
       agent_state=CASE WHEN alc_atendimento.conversations.status='resolved' THEN excluded.agent_state ELSE alc_atendimento.conversations.agent_state END,
       status=CASE WHEN alc_atendimento.conversations.status='resolved' THEN 'bot' ELSE alc_atendimento.conversations.status END,
       updated_at=now() RETURNING id`,
      [
        channel,
        to,
        channel === "driver" ? record.driverName : record.customerName,
        unit.base_key,
        unit.sigla,
        record.caseId,
        record.driverId,
        channel === "client",
        { step: channel === "client" ? "receipt" : "start" },
        owner.id,
      ],
    );
    const batchId = options.batchId || randomUUID();
    if (!options.batchId)
      await transaction.query(
        "INSERT INTO alc_atendimento.dispatch_batches(id,triggered_by,mode,channel,request_hash) VALUES($1,$2,$3,$4,$5)",
        [
          batchId,
          trigger?.id || null,
          automatic ? "automatic" : options.global ? "global" : "individual",
          channel,
          createHash("sha256").update(record.caseId).digest("hex"),
        ],
      );
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: "pt_BR" },
        components,
      },
    };
    const version = evidence.contentVersion;
    const result = await transaction.query(
      `INSERT INTO alc_atendimento.outbox(dedupe_key,conversation_id,case_id,channel,phone,payload,triggered_by,assigned_to,assignment_version,operator_name_snapshot,base_key,sigla,dispatch_batch_id,template_name,template_version,sender_kind,sender_display_name_snapshot,template_contract_revision,template_evidence,rendered_template_text)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'system',$19,$16,$17,$18) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`,
      [
        `${channel}:${record.caseId}:initial`,
        conversation.rows[0].id,
        record.caseId,
        channel,
        to,
        payload,
        trigger?.id || null,
        owner.id,
        assignment.version,
        owner.fullName,
        unit.base_key,
        unit.sigla,
        batchId,
        name,
        version,
        revision,
        evidence,
        evidence.renderedText,
        AGENT_DISPLAY_NAME,
      ],
    );
    await audit(
      trigger?.id || null,
      result.rowCount ? "template_queued" : "template_duplicate",
      record.caseId,
      {
        channel,
        automatic,
        assignedTo: owner.id,
        batchId,
        templateVersion: version,
        templateContractRevision: revision,
      },
      transaction,
    );
    await transaction.query("COMMIT");
    return Boolean(result.rowCount);
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    transaction.release();
  }
}
export async function upsertCases(
  records: CaseRecord[],
  sourceAt: string,
  baseline: boolean,
  actor: string | null = null,
  allowAutomaticOutreach = true,
  authoritativeCoreSnapshot = false,
) {
  const client = await db().connect();
  const newlySeen: CaseRecord[] = [];
  const assignmentCandidates: CaseRecord[] = [];
  const stats = {
    processed: records.length,
    found: records.length,
    new: 0,
    updated: 0,
    unchanged: 0,
    classificationChanged: 0,
    verifiedPhoneAdded: 0,
    verifiedContactConflicts: 0,
    scopeChanged: 0,
    stale: 0,
    errors: 0,
  };
  try {
    await client.query("BEGIN");
    for (const record of records) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `atendimento_case:${record.caseId}`,
      ]);
      const previous = await client.query(
        "SELECT record,source_at,comparison_version,fingerprint FROM alc_atendimento.cases WHERE case_id=$1 FOR UPDATE",
        [record.caseId],
      );
      const previousRow = previous.rows[0];
      const old = previousRow?.record as CaseRecord | undefined;
      if (old && old.shipmentId !== record.shipmentId)
        throw new Error("Vinculo PNR/envio divergente.");
      const sourceTime =
        (record as CaseRecord & { sourceAt?: string }).sourceAt || sourceAt;
      if (!Number.isFinite(Date.parse(sourceTime)))
        throw new Error("Data de origem da PNR inválida.");
      if (
        !authoritativeCoreSnapshot &&
        old &&
        previousRow?.source_at &&
        Date.parse(String(previousRow.source_at)) > Date.parse(sourceTime)
      ) {
        stats.stale += 1;
        continue;
      }
      // A list response must not erase details or a verified complementary contact.
      const incomingCapture = Date.parse(record.customerCapturedAt || "");
      const existingCapture = Date.parse(old?.customerCapturedAt || "");
      const contactConflict = Boolean(
        old?.customerVerified && record.customerVerified &&
        Number.isFinite(incomingCapture) && incomingCapture === existingCapture &&
        caseFingerprint({
          ...old,
          customerName: record.customerName,
          customerPhone: record.customerPhone,
          customerDocument: record.customerDocument,
          customerAddress: record.customerAddress,
          customerAddressFields: record.customerAddressFields,
          customerSource: record.customerSource,
        }) !== caseFingerprint(old),
      );
      const acceptVerifiedContact = Boolean(
        record.customerVerified &&
          (!old?.customerVerified ||
            (Number.isFinite(incomingCapture) &&
              Number.isFinite(existingCapture) &&
              incomingCapture > existingCapture)),
      );
      const merged = {
        ...old,
        ...record,
        purchaseValue:
          knownPurchaseValue(record.purchaseValue) ?? knownPurchaseValue(old?.purchaseValue),
        driverId: record.driverId || old?.driverId || "",
        driverPhone: record.driverPhone || old?.driverPhone || "",
        products: record.products.length
          ? record.products
          : old?.products || [],
        deliveryAt: record.deliveryAt || old?.deliveryAt || "",
        customerName: acceptVerifiedContact
          ? record.customerName
          : old?.customerVerified
            ? old.customerName
            : record.customerName || old?.customerName || "",
        customerPhone: acceptVerifiedContact
          ? record.customerPhone
          : old?.customerVerified
            ? old.customerPhone
            : record.customerPhone || old?.customerPhone || "",
        customerVerified: acceptVerifiedContact || old?.customerVerified || false,
        customerDocument: acceptVerifiedContact
          ? record.customerDocument
          : old?.customerVerified
            ? old.customerDocument
            : record.customerDocument || old?.customerDocument,
        customerAddress: acceptVerifiedContact
          ? record.customerAddress
          : old?.customerVerified
            ? old.customerAddress
            : record.customerAddress || old?.customerAddress,
        customerAddressFields: acceptVerifiedContact
          ? record.customerAddressFields
          : old?.customerVerified
            ? old.customerAddressFields
            : record.customerAddressFields || old?.customerAddressFields,
        customerSource: acceptVerifiedContact
          ? record.customerSource
          : old?.customerVerified
            ? old.customerSource
            : record.customerSource || old?.customerSource,
        customerCapturedAt: acceptVerifiedContact
          ? record.customerCapturedAt
          : old?.customerVerified
            ? old.customerCapturedAt
            : record.customerCapturedAt || old?.customerCapturedAt,
      };
      const fingerprint = caseFingerprint(merged);
      const unchanged = Boolean(
        old &&
          (previousRow?.comparison_version === CASE_COMPARISON_VERSION && previousRow?.fingerprint
            ? previousRow.fingerprint
            : caseFingerprint(old)) === fingerprint,
      );
      const stored = unchanged ? old! : merged;
      const persisted = await client.query(
        `INSERT INTO alc_atendimento.cases(case_id,competence,base_key,sigla,driver_id,driver_phone,customer_phone,classification,record,source_at,comparison_version,fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,${CASE_COMPARISON_VERSION},$11) ON CONFLICT(case_id) DO UPDATE SET competence=excluded.competence,base_key=excluded.base_key,sigla=excluded.sigla,driver_id=excluded.driver_id,driver_phone=excluded.driver_phone,customer_phone=excluded.customer_phone,classification=excluded.classification,record=excluded.record,source_at=greatest(alc_atendimento.cases.source_at,excluded.source_at),comparison_version=excluded.comparison_version,fingerprint=excluded.fingerprint,updated_at=CASE WHEN alc_atendimento.cases.fingerprint IS DISTINCT FROM excluded.fingerprint OR alc_atendimento.cases.comparison_version<>excluded.comparison_version THEN now() ELSE alc_atendimento.cases.updated_at END WHERE alc_atendimento.cases.source_at<=excluded.source_at OR $12::boolean RETURNING case_id`,
        [
          stored.caseId,
          stored.competence,
          stored.baseKey,
          stored.sigla,
          stored.driverId,
          stored.driverPhone,
          stored.customerPhone,
          stored.classification,
          stored,
          sourceTime,
          fingerprint,
          authoritativeCoreSnapshot,
        ],
      );
      if (!persisted.rowCount) {
        stats.stale += 1;
        continue;
      }
      if (contactConflict) {
        stats.verifiedContactConflicts += 1;
        await audit(actor, "customer_contact_conflict", record.caseId,
          { capturedAt: new Date(existingCapture).toISOString(), reason: "equal_capture_time" }, client);
      }
      if (!old) stats.new += 1;
      else if (unchanged) stats.unchanged += 1;
      else stats.updated += 1;
      if (old && old.classification !== merged.classification)
        stats.classificationChanged += 1;
      if (
        old &&
        merged.customerVerified &&
        (!old.customerVerified || old.customerPhone !== merged.customerPhone)
      )
        stats.verifiedPhoneAdded += 1;
      if (
        old &&
        (old.baseKey !== merged.baseKey || old.sigla !== merged.sigla)
      )
        stats.scopeChanged += 1;
      if (merged.customerVerified) await enqueueVerifiedContact(client, merged);
      if (stored.competence === competence()) assignmentCandidates.push(stored);
      if (
        !baseline &&
        (!old ||
          (!old.driverPhone && merged.driverPhone) ||
          (!old.customerVerified && merged.customerVerified))
      )
        newlySeen.push(merged);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (
    (await setting<{ mode: string }>("assignment_policy"))?.mode ===
    "primary_then_least_loaded"
  ) {
    for (const record of assignmentCandidates) {
      try {
        await assignCase(
          null,
          {
            caseId: record.caseId,
            assignedTo: null,
            version: 0,
            reason: "Distribuição automática por base",
          },
          true,
        );
      } catch (error) {
        await audit(actor, "assignment_blocked", record.caseId, {
          reason:
            error instanceof Error
              ? error.message
              : "Distribuição indisponível",
        });
      }
    }
  }
  // A manual collection is data-only, even if automatic outreach is enabled.
  if (!allowAutomaticOutreach)
    return stats;
  const automation = await setting<Automation>("automation");
  for (const record of newlySeen.filter((r) => r.competence === competence())) {
    for (const channel of ["driver", "client"] as const) {
      if (
        !(channel === "driver"
          ? automation.driverNotifications
          : automation.clientOutreach)
      )
        continue;
      try {
        await queueTemplate(channel, record, null, true);
      } catch (error) {
        await audit(actor, "outreach_blocked", record.caseId, {
          channel,
          reason:
            error instanceof Error ? error.message : "Dados insuficientes",
        });
      }
    }
  }
  return stats;
}
export function fromCore(row: Record<string, unknown>): CaseRecord {
  const raw = row.raw_snapshot_jsonb as
    { detailSnapshot?: Record<string, unknown> } | undefined;
  const detail = raw?.detailSnapshot || {};
  return {
    caseId: String(row.case_id),
    shipmentId: String(row.shipment_id),
    competence: String(row.competence),
    caseDate: String(row.case_date),
    baseKey: String(row.base_key || ""),
    sigla: String(row.sigla || ""),
    driverId: String(row.driver_id || detail.driverId || ""),
    driverName: String(detail.driverName || row.driver_name || ""),
    driverPhone: phone(detail.driverPhone),
    mainStatus: String(row.main_status || ""),
    subStatus: String(row.sub_status || ""),
    classification: classification(row.main_status, row.sub_status),
    customerName: String(detail.buyerName || ""),
    customerPhone: "",
    customerVerified: false,
    products: Array.isArray(detail.products)
      ? (detail.products as { title: string }[])
      : [],
    deliveryAt: String(detail.deliveryAt || ""),
    purchaseValue: knownPurchaseValue(row.purchase_value),
    ...{
      sourceAt: new Date(Math.max(
        ...[row.source_last_seen_at, row.updated_at]
          .filter((value) => value != null)
          .map((value) => value instanceof Date ? value.getTime() : Date.parse(String(value)))
          .filter(Number.isFinite),
      )).toISOString(),
    },
  };
}
export async function syncCore(history = false, allowAutomaticOutreach = true) {
  const lease = await db().connect();
  let locked = false;
  let acquisitionComplete = false;
  try {
    locked = Boolean((await lease.query(
      "SELECT pg_try_advisory_lock(hashtext('atendimento_core_sync')) AS locked",
    )).rows[0]?.locked);
    acquisitionComplete = true;
    if (!locked) throw new HttpError(409, "Coleta Core em andamento.");
    return await syncCoreSnapshot(history, allowAutomaticOutreach);
  } finally {
    let releaseError = acquisitionComplete ? undefined : new Error("Core sync lock acquisition failed");
    if (locked) {
      try {
        const released = await lease.query(
          "SELECT pg_advisory_unlock(hashtext('atendimento_core_sync')) AS unlocked",
        );
        if (!released.rows[0]?.unlocked) releaseError = new Error("Core sync lock lost");
      } catch {
        releaseError = new Error("Core sync unlock failed");
      }
    }
    lease.release(releaseError);
  }
}

async function syncCoreSnapshot(history: boolean, allowAutomaticOutreach: boolean) {
  const source = await setting<{
    baselineComplete: boolean;
    lastSync?: string;
    competence?: string;
  }>("source");
  const currentCompetence = competence();
  // Historical data is imported only by an explicit driver inquiry or staff action.
  const result = await core().query(
    `SELECT * FROM public.pnr_case_center_cases
     WHERE ($1::boolean OR competence=$2)
     ORDER BY case_date DESC,case_id DESC`,
    [history, currentCompetence],
  );
  const stats = await upsertCases(
    result.rows.map(fromCore),
    new Date().toISOString(),
    history || !source.baselineComplete || source.competence !== currentCompetence,
    null,
    allowAutomaticOutreach,
    // Projection timestamps are not a commit-order watermark.
    true,
  );
  if (!history)
    await db().query(
      `UPDATE alc_atendimento.settings SET value=$1,updated_at=now() WHERE key='source'`,
      [
        {
          baselineComplete: (source.competence === currentCompetence && source.baselineComplete) || result.rows.length > 0,
          competence: currentCompetence,
          lastSync: new Date().toISOString(),
          origin: "Inteligência",
          ...stats,
        },
      ],
    );
  return stats;
}
