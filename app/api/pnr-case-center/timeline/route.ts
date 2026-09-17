import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessSection } from "@/lib/access-control";
import { canAccessScopedRecord } from "@/lib/access-scope";
import { getUserAccessScope } from "@/lib/access-scope-server";
import { getCurrentProfile } from "@/lib/auth-server";
import {
  CASE_CENTER_TIMELINE_PARSER_VERSION,
  caseCenterEventLabel,
  caseCenterTimelineNeedsRefresh,
  dedupeCaseTimelineEvents,
} from "@/lib/pnr-case-center";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const caseIdSchema = z.string().regex(/^\d{1,30}$/);
const timelineSchema = z.object({
  caseId: caseIdSchema,
  status: z.enum(["COMPLETE", "ERROR"]).default("COMPLETE"),
  detail: z.object({
    claimId: z.string().trim().max(120).optional(),
    preInvoiceNumber: z.string().trim().max(120).optional(),
    billingPeriod: z.string().trim().max(120).optional(),
    driverId: z.string().trim().max(120).optional(),
  }).strict().optional(),
  sourceEventCount: z.number().int().min(0).max(200).optional(),
  events: z.array(z.object({
    eventId: z.string().trim().min(1).max(80),
    eventType: z.string().trim().min(1).max(100),
    dateCreated: z.string().datetime({ offset: true }),
    actorName: z.string().trim().max(180).optional(),
    actorUserId: z.string().trim().max(80).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  }).strict()).max(200),
}).strict().superRefine((value, context) => {
  const uniqueEventCount = new Set(value.events.map((event) => event.eventId)).size;
  if (value.status === "COMPLETE" && (
    value.sourceEventCount === 0
    || value.sourceEventCount !== value.events.length
    || uniqueEventCount !== value.events.length
  )) {
    context.addIssue({
      code: "custom",
      path: ["events"],
      message: "A timeline recebida está incompleta.",
    });
  }
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function errorStatus(message: string) {
  if (message.includes("Sessão")) return 401;
  if (message.includes("permissão") || message.includes("escopo")) return 403;
  if (message.includes("não encontrado")) return 404;
  if (message.includes("SERVICE_ROLE")) return 503;
  return 400;
}

async function authorizedCase(caseId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Sessão expirada. Entre novamente.");
  if (!canAccessSection(profile, "gestao-pnr")) throw new Error("Seu perfil não possui permissão para acessar a Gestão PNR.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pnr_case_center_cases")
    .select("case_id,base_key,sigla,detail_sync_status,timeline_synced_at,claim_id,pre_invoice_number,billing_period,reviewed_status,raw_snapshot_jsonb")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(`pnr_case_center_cases: ${error.message}`);
  if (!data) throw new Error("Caso PNR não encontrado.");

  const scope = await getUserAccessScope(profile);
  if (!canAccessScopedRecord(scope, { baseKey: data.base_key, sigla: data.sigla })) {
    throw new Error("Caso PNR fora do escopo autorizado.");
  }
  return { admin, profile, record: data };
}

export async function GET(request: Request) {
  try {
    const parsed = caseIdSchema.safeParse(new URL(request.url).searchParams.get("caseId"));
    if (!parsed.success) return json({ error: "Caso PNR inválido." }, 400);
    const { admin, record } = await authorizedCase(parsed.data);
    const { data, error } = await admin
      .from("pnr_case_events")
      .select("event_id,event_type,date_created,operational_label,actor_name,actor_user_id,cached_at")
      .eq("case_id", parsed.data)
      .order("date_created", { ascending: true })
      .order("event_id", { ascending: true });
    if (error) throw new Error(`pnr_case_events: ${error.message}`);
    return json({
      caseId: parsed.data,
      cached: record.detail_sync_status === "COMPLETE" && !caseCenterTimelineNeedsRefresh(record.raw_snapshot_jsonb),
      detailSyncStatus: record.detail_sync_status,
      timelineSyncedAt: record.timeline_synced_at,
      events: (data ?? []).map((event) => ({
        eventId: event.event_id,
        eventType: event.event_type,
        dateCreated: event.date_created,
        label: caseCenterEventLabel(event.event_type, event.actor_name || "", record.reviewed_status || ""),
        actorName: event.actor_name || undefined,
        actorUserId: event.actor_user_id || undefined,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar timeline PNR.";
    return json({ error: message }, errorStatus(message));
  }
}

export async function POST(request: Request) {
  try {
    const parsed = timelineSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Timeline PNR inválida.", issues: parsed.error.issues }, 400);
    const { admin, profile, record } = await authorizedCase(parsed.data.caseId);
    const now = new Date().toISOString();
    if (parsed.data.status === "ERROR") {
      const { error } = await admin.from("pnr_case_center_cases").update({
        detail_sync_status: "ERROR",
        updated_at: now,
      }).eq("case_id", parsed.data.caseId);
      if (error) throw new Error(`pnr_case_center_cases: ${error.message}`);
      return json({ caseId: parsed.data.caseId, cached: false, events: [] });
    }

    const events = dedupeCaseTimelineEvents(parsed.data.events);
    const eventIds = events.map((event) => event.eventId);
    const existingEvents = new Map<string, Record<string, unknown>>();
    if (eventIds.length) {
      const { data, error } = await admin
        .from("pnr_case_events")
        .select("event_id,actor_name,actor_user_id,first_captured_at")
        .eq("case_id", parsed.data.caseId)
        .in("event_id", eventIds);
      if (error) throw new Error(`pnr_case_events: ${error.message}`);
      for (const event of data ?? []) existingEvents.set(event.event_id, event);
    }
    const rows = events.map((event) => ({
      case_id: parsed.data.caseId,
      event_id: event.eventId,
      event_type: event.eventType,
      date_created: event.dateCreated,
      operational_label: caseCenterEventLabel(event.eventType, event.actorName, record.reviewed_status || ""),
      actor_name: event.actorName || String(existingEvents.get(event.eventId)?.actor_name || "") || null,
      actor_user_id: event.actorUserId || String(existingEvents.get(event.eventId)?.actor_user_id || "") || null,
      cached_by: profile.id,
      first_captured_at: String(existingEvents.get(event.eventId)?.first_captured_at || now),
      last_captured_at: now,
      cached_at: now,
    }));
    if (rows.length) {
      const { error } = await admin.from("pnr_case_events").upsert(rows, { onConflict: "case_id,event_id" });
      if (error) throw new Error(`pnr_case_events: ${error.message}`);
      if (rows.some((row) => row.event_id.startsWith("0:"))) {
        const { error: legacyEventError } = await admin
          .from("pnr_case_events")
          .delete()
          .eq("case_id", parsed.data.caseId)
          .eq("event_id", "0");
        if (legacyEventError) throw new Error(`pnr_case_events: ${legacyEventError.message}`);
      }
    }

    const detail = parsed.data.detail;
    const detailPatch: Record<string, unknown> = {
      case_capture_status: "COMPLETE",
      detail_sync_status: "COMPLETE",
      timeline_synced_at: now,
      raw_snapshot_jsonb: {
        ...(record.raw_snapshot_jsonb && typeof record.raw_snapshot_jsonb === "object" ? record.raw_snapshot_jsonb : {}),
        timelineParserVersion: CASE_CENTER_TIMELINE_PARSER_VERSION,
      },
      updated_at: now,
    };
    if (detail?.claimId) detailPatch.claim_id = detail.claimId;
    if (detail?.preInvoiceNumber) detailPatch.pre_invoice_number = detail.preInvoiceNumber;
    if (detail?.billingPeriod) detailPatch.billing_period = detail.billingPeriod;
    if (detail?.driverId) detailPatch.driver_id = detail.driverId;
    const { error: caseUpdateError } = await admin
      .from("pnr_case_center_cases")
      .update(detailPatch)
      .eq("case_id", parsed.data.caseId);
    if (caseUpdateError) throw new Error(`pnr_case_center_cases: ${caseUpdateError.message}`);

    const { error: auditError } = await admin.from("audit_events").insert({
      actor_id: profile.id,
      action: "case_center_pnr_timeline_archived",
      entity_table: "pnr_case_events",
      after_data: { caseId: parsed.data.caseId, eventCount: rows.length },
    });
    if (auditError) throw new Error(`audit_events: ${auditError.message}`);

    const { data: historicalEvents, error: historyError } = await admin
      .from("pnr_case_events")
      .select("event_id,event_type,date_created,operational_label,actor_name,actor_user_id")
      .eq("case_id", parsed.data.caseId)
      .order("date_created", { ascending: true })
      .order("event_id", { ascending: true });
    if (historyError) throw new Error(`pnr_case_events: ${historyError.message}`);

    return json({
      caseId: parsed.data.caseId,
      cached: true,
      events: (historicalEvents ?? []).map((event) => ({
        eventId: event.event_id,
        eventType: event.event_type,
        dateCreated: event.date_created,
        label: caseCenterEventLabel(event.event_type, event.actor_name || "", record.reviewed_status || ""),
        actorName: event.actor_name || undefined,
        actorUserId: event.actor_user_id || undefined,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar timeline PNR.";
    return json({ error: message }, errorStatus(message));
  }
}
