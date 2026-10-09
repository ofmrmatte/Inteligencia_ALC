import { core, db, setting, audit } from "./db";
import {
  competence,
  classification,
  driverNotificationEligible,
  phone,
  templateParameters,
  type CaseRecord,
} from "./domain";
import { templates, type Channel } from "./meta";
import { assignCase } from "./assignment-engine";
export type Automation = {
  driverNotifications: boolean;
  clientOutreach: boolean;
  bot: boolean;
  operatorName: string;
  intervalMinutes: 30;
};
export async function queueTemplate(
  channel: Channel,
  record: CaseRecord,
  operator: string,
  automatic = false,
) {
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
  if (channel === "driver" && !driverNotificationEligible(record.classification))
    throw new Error("Classificação fora das notificações de motoristas.");
  if (channel === "client") {
    const active = await db().query(
      "SELECT case_id,status FROM alc_atendimento.conversations WHERE channel='client' AND phone=$1",
      [to],
    );
    if (
      active.rows[0] &&
      active.rows[0].case_id !== record.caseId &&
      active.rows[0].status !== "resolved"
    )
      throw new Error(
        "Cliente já possui uma tratativa ativa para outro envio. Revisão da equipe necessária.",
      );
  }
  // The legacy cliente_loss template omits the approved purchase amount.
  // Require separately approved v2 to avoid silently sending an outdated script.
  const name = channel === "driver" ? "pnraberta" : "cliente_loss_v2";
  const approved = (await templates(channel)).find(
    (t) => t.name === name && t.status === "APPROVED" && t.language === "pt_BR",
  );
  if (!approved) throw new Error("Modelo aprovado indisponível.");
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: "pt_BR" },
      components: templateParameters(channel, record, operator),
    },
  };
  const conversation = await db().query(
    `INSERT INTO alc_atendimento.conversations(channel,phone,name,base_key,sigla,case_id,driver_id,identity_verified,agent_state)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(channel,phone) DO UPDATE SET
      name=CASE WHEN alc_atendimento.conversations.channel='client' AND alc_atendimento.conversations.status='resolved' AND alc_atendimento.conversations.case_id IS DISTINCT FROM excluded.case_id THEN excluded.name ELSE alc_atendimento.conversations.name END,
      base_key=CASE WHEN alc_atendimento.conversations.channel='client' AND alc_atendimento.conversations.status='resolved' AND alc_atendimento.conversations.case_id IS DISTINCT FROM excluded.case_id THEN excluded.base_key ELSE alc_atendimento.conversations.base_key END,
      sigla=CASE WHEN alc_atendimento.conversations.channel='client' AND alc_atendimento.conversations.status='resolved' AND alc_atendimento.conversations.case_id IS DISTINCT FROM excluded.case_id THEN excluded.sigla ELSE alc_atendimento.conversations.sigla END,
      driver_id=CASE WHEN alc_atendimento.conversations.channel='client' AND alc_atendimento.conversations.status='resolved' AND alc_atendimento.conversations.case_id IS DISTINCT FROM excluded.case_id THEN excluded.driver_id ELSE alc_atendimento.conversations.driver_id END,
      case_id=CASE WHEN alc_atendimento.conversations.channel='client' AND alc_atendimento.conversations.status='resolved' THEN excluded.case_id ELSE alc_atendimento.conversations.case_id END,
      agent_state=CASE WHEN alc_atendimento.conversations.channel='client' AND alc_atendimento.conversations.status='resolved' AND alc_atendimento.conversations.case_id IS DISTINCT FROM excluded.case_id THEN excluded.agent_state ELSE alc_atendimento.conversations.agent_state END,
      status=CASE WHEN alc_atendimento.conversations.channel='client' AND alc_atendimento.conversations.status='resolved' AND alc_atendimento.conversations.case_id IS DISTINCT FROM excluded.case_id THEN 'bot' ELSE alc_atendimento.conversations.status END,
      updated_at=now() RETURNING id,case_id`,
    [
      channel,
      to,
      channel === "driver" ? record.driverName : record.customerName,
      record.baseKey,
      record.sigla,
      record.caseId,
      record.driverId,
      channel === "client",
      JSON.stringify({ step: channel === "client" ? "receipt" : "start" }),
    ],
  );
  if (channel === "client" && conversation.rows[0].case_id !== record.caseId)
    throw new Error(
      "Uma tratativa de outro envio está ativa para este cliente.",
    );
  const result = await db().query(
    `INSERT INTO alc_atendimento.outbox(dedupe_key,conversation_id,case_id,channel,phone,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`,
    [
      `${channel}:${record.caseId}:${to}:initial`,
      conversation.rows[0].id,
      record.caseId,
      channel,
      to,
      payload,
    ],
  );
  await audit(
    null,
    result.rowCount ? "template_queued" : "template_duplicate",
    record.caseId,
    { channel, automatic },
  );
  return Boolean(result.rowCount);
}
export async function upsertCases(
  records: CaseRecord[],
  sourceAt: string,
  baseline: boolean,
  actor: string | null = null,
  allowAutomaticOutreach = true,
) {
  const client = await db().connect();
  const newlySeen: CaseRecord[] = [];
  try {
    await client.query("BEGIN");
    for (const record of records) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `atendimento_case:${record.caseId}`,
      ]);
      const previous = await client.query(
        "SELECT record FROM alc_atendimento.cases WHERE case_id=$1 FOR UPDATE",
        [record.caseId],
      );
      const old = previous.rows[0]?.record as CaseRecord | undefined;
      const sourceTime =
        (record as CaseRecord & { sourceAt?: string }).sourceAt || sourceAt;
      // A list response must not erase details or a verified complementary contact.
      const merged = {
        ...old,
        ...record,
        driverId: record.driverId || old?.driverId || "",
        driverPhone: record.driverPhone || old?.driverPhone || "",
        products: record.products.length
          ? record.products
          : old?.products || [],
        deliveryAt: record.deliveryAt || old?.deliveryAt || "",
        customerName: record.customerName || old?.customerName || "",
        customerPhone: record.customerPhone || old?.customerPhone || "",
        customerVerified:
          record.customerVerified || old?.customerVerified || false,
      };
      const persisted = await client.query(
        `INSERT INTO alc_atendimento.cases(case_id,competence,base_key,sigla,driver_id,driver_phone,customer_phone,classification,record,source_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(case_id) DO UPDATE SET competence=excluded.competence,base_key=excluded.base_key,sigla=excluded.sigla,driver_id=excluded.driver_id,driver_phone=excluded.driver_phone,customer_phone=excluded.customer_phone,classification=excluded.classification,record=excluded.record,source_at=excluded.source_at,updated_at=now() WHERE alc_atendimento.cases.source_at<=excluded.source_at RETURNING case_id`,
        [
          merged.caseId,
          merged.competence,
          merged.baseKey,
          merged.sigla,
          merged.driverId,
          merged.driverPhone,
          merged.customerPhone,
          merged.classification,
          merged,
          sourceTime,
        ],
      );
      if (
        persisted.rowCount &&
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
  if ((await setting<{ mode: string }>("assignment_policy"))?.mode === "primary_then_least_loaded") {
    for (const record of records) {
      try { await assignCase(null, { caseId: record.caseId, assignedTo: null, version: 0, reason: "Distribuição automática por base" }, true); }
      catch (error) { await audit(actor, "assignment_blocked", record.caseId, { reason: error instanceof Error ? error.message : "Distribuição indisponível" }); }
    }
  }
  // A manual collection is data-only, even if automatic outreach is enabled.
  if (!allowAutomaticOutreach) return { processed: records.length, new: newlySeen.length };
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
        await queueTemplate(channel, record, automation.operatorName, true);
      } catch (error) {
        await audit(actor, "outreach_blocked", record.caseId, {
          channel,
          reason:
            error instanceof Error ? error.message : "Dados insuficientes",
        });
      }
    }
  }
  return { processed: records.length, new: newlySeen.length };
}
export function fromCore(row: Record<string, unknown>): CaseRecord {
  const raw = row.raw_snapshot_jsonb as
    | { detailSnapshot?: Record<string, unknown> }
    | undefined;
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
    purchaseValue: Number(row.purchase_value || 0),
    ...{
      sourceAt: String(
        row.source_last_seen_at || row.updated_at || new Date().toISOString(),
      ),
    },
  };
}
export async function syncCore(history = false, allowAutomaticOutreach = true) {
  const source = await setting<{
    baselineComplete: boolean;
    lastSync?: string;
  }>("source");
  // Historical data is imported only by an explicit driver inquiry or staff action.
  const result = await core().query(
    `SELECT * FROM public.pnr_case_center_cases WHERE ($1::boolean OR competence=$2) ORDER BY case_date DESC,case_id DESC`,
    [history, competence()],
  );
  const stats = await upsertCases(
    result.rows.map(fromCore),
    new Date().toISOString(),
    history || !source.baselineComplete,
    null,
    allowAutomaticOutreach,
  );
  if (!history)
    await db().query(
      `UPDATE alc_atendimento.settings SET value=$1,updated_at=now() WHERE key='source'`,
      [
        {
          baselineComplete: source.baselineComplete || result.rows.length > 0,
          lastSync: new Date().toISOString(),
          origin: "Inteligência",
          ...stats,
        },
      ],
    );
  return stats;
}
