import { z } from "zod";
import { normalizeText } from "@/lib/normalize";
import {
  CASE_CENTER_TIMELINE_PARSER_VERSION,
  caseCenterStatusLabel,
  caseCenterTimelineNeedsRefresh,
  dedupeCaseCenterCases,
  parseCaseCenterCompetence,
  type NormalizedCaseCenterPnrCase,
} from "@/lib/pnr-case-center";

const limitedText = (max: number) => z.string().trim().max(max);
const caseDate = limitedText(64).refine(
  (value) => /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value)),
  "Data do caso inválida.",
);

export const normalizedCaseCenterPnrSchema = z.object({
  caseId: limitedText(80).min(1),
  caseDate,
  routeCode: limitedText(120),
  routeId: limitedText(120),
  originStation: limitedText(120),
  driverName: limitedText(180),
  shipmentId: limitedText(120).min(1),
  purchaseValue: z.number().finite().nonnegative(),
  currency: limitedText(8),
  mainStatus: limitedText(80),
  subStatus: limitedText(80),
  reviewedStatus: limitedText(80),
  caseType: limitedText(80),
  routeStatus: limitedText(80),
  priority: limitedText(40),
}).strict();

export const caseCenterImportSchema = z.object({
  syncId: z.string().uuid(),
  competence: z.string().regex(/^20\d{2}(0[1-9]|1[0-2])Q[12]$/),
  page: z.number().int().min(1).max(500),
  totalPages: z.number().int().min(0).max(500),
  totalElements: z.number().int().min(0).max(100_000),
  completed: z.boolean(),
  processed: z.number().int().min(0).max(100_000),
  errorCount: z.number().int().min(0).max(100_000),
  records: z.array(normalizedCaseCenterPnrSchema).max(300),
}).strict();

export type CaseCenterImportPayload = z.infer<typeof caseCenterImportSchema>;

type StoredCase = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function keepText(incoming: string, existing: unknown) {
  return incoming || text(existing);
}

export function mergeCaseCenterCase(
  existing: StoredCase | null,
  record: NormalizedCaseCenterPnrCase,
  context: { batchId: string; competence: string; capturedAt: string },
) {
  const station = normalizeText(keepText(record.originStation, existing?.svc_name));
  const mainStatus = keepText(record.mainStatus, existing?.main_status);
  const subStatus = keepText(record.subStatus, existing?.sub_status);
  const competence = parseCaseCenterCompetence(context.competence);
  if (!competence) throw new Error("Competência inválida.");
  const merged = {
    case_id: record.caseId,
    shipment_id: keepText(record.shipmentId, existing?.shipment_id),
    competence: context.competence,
    case_date: keepText(record.caseDate.slice(0, 10), existing?.case_date),
    route_id: keepText(record.routeId, existing?.route_id),
    route_code: keepText(record.routeCode, existing?.route_code),
    svc_name: keepText(record.originStation, existing?.svc_name),
    driver_id: text(existing?.driver_id),
    driver_name: keepText(record.driverName, existing?.driver_name),
    purchase_value: record.purchaseValue,
    currency: keepText(record.currency, existing?.currency),
    main_status: mainStatus,
    sub_status: subStatus,
    reviewed_status: keepText(record.reviewedStatus, existing?.reviewed_status),
    case_type: keepText(record.caseType, existing?.case_type),
    route_status: keepText(record.routeStatus, existing?.route_status),
    priority: keepText(record.priority, existing?.priority),
    billing_period: competence.fortnight,
    claim_id: text(existing?.claim_id),
    pre_invoice_number: text(existing?.pre_invoice_number),
    base_key: station || text(existing?.base_key),
    sigla: station || text(existing?.sigla),
    case_capture_status: text(existing?.case_capture_status) === "COMPLETE" ? "COMPLETE" : "LIST_ONLY",
    detail_sync_status: "DETAIL_PENDING",
    timeline_synced_at: existing?.timeline_synced_at ?? null,
    first_captured_at: text(existing?.first_captured_at) || context.capturedAt,
    last_captured_at: context.capturedAt,
    source_last_seen_at: context.capturedAt,
    latest_batch_id: context.batchId,
    source_system: "case_center",
    raw_snapshot_jsonb: { ...record, timelineParserVersion: CASE_CENTER_TIMELINE_PARSER_VERSION },
    updated_at: context.capturedAt,
  };
  const comparable = [
    "shipment_id", "competence", "case_date", "route_id", "route_code", "svc_name", "driver_name",
    "purchase_value", "currency", "main_status", "sub_status", "reviewed_status", "case_type", "route_status", "priority",
  ];
  const changed = Boolean(existing) && comparable.some((key) => text(existing?.[key]) !== text(merged[key as keyof typeof merged]));
  merged.detail_sync_status = text(existing?.detail_sync_status) === "COMPLETE"
    && !changed
    && !caseCenterTimelineNeedsRefresh(existing?.raw_snapshot_jsonb)
    ? "COMPLETE"
    : "DETAIL_PENDING";
  return { row: merged, change: existing ? (changed ? "updated" : "unchanged") : "new" } as const;
}

export function caseCenterPnrDatabaseRows(payload: CaseCenterImportPayload) {
  const competence = parseCaseCenterCompetence(payload.competence);
  if (!competence) throw new Error("Competência inválida.");
  const records = dedupeCaseCenterCases(payload.records as NormalizedCaseCenterPnrCase[]);

  return records.map((record, index) => {
    const station = normalizeText(record.originStation);
    return {
      batch_id: payload.syncId,
      case_id: record.caseId,
      shipment_id: record.shipmentId,
      case_date: record.caseDate.slice(0, 10),
      status: caseCenterStatusLabel(record.mainStatus, record.subStatus),
      billing_period: competence.fortnight,
      fortnight: competence.fortnight,
      month: competence.month,
      products: "",
      purchase_value: record.purchaseValue,
      carrier: "",
      origin_station: record.originStation,
      base_key: station,
      sigla: station,
      route_code: record.routeCode,
      route_id: record.routeId,
      driver_id: "",
      driver_name: record.driverName,
      currency: record.currency,
      main_status: record.mainStatus,
      sub_status: record.subStatus,
      reviewed_status: record.reviewedStatus,
      case_type: record.caseType,
      route_status: record.routeStatus,
      priority: record.priority,
      source_system: "case_center",
      custom: "",
      billing_type: "",
      cancellation_type: "",
      classification_columns_present: false,
      source_file: `Bandeja PNR — ${payload.competence}`,
      source_sheet: "Case Center API",
      source_row: (payload.page - 1) * 30 + index + 1,
      original_payload: record,
    };
  });
}
