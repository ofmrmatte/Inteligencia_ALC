import { NextResponse } from "next/server";
import { hasFullAccess, isUserRole, type AuthProfile } from "@/lib/auth";
import { fortnightFromDate, monthFromFortnight, normalizeFortnight } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";
import type {
  DashboardData,
  DriverRecord,
  HierarchyRecord,
  ImportEntry,
  ParsedBatch,
  PnrRecord,
  PrefaturaRecord,
  RiskRecord,
  SourceKind,
} from "@/lib/types";
import { EMPTY_DATA } from "@/lib/types";

export const dynamic = "force-dynamic";

const IMPORT_BUCKET = "alc-imports";
const CHILD_TABLES = ["hierarchy_scopes", "prefatura_records", "pnr_records", "risk_lm_records", "driver_records"] as const;

interface UploadedFilePayload {
  batchId: string;
  originalName: string;
  storagePath: string;
  fileSize: number;
  fileHash: string;
  workbookCount: number;
}

interface PersistRequest {
  batches: ParsedBatch[];
  files: UploadedFilePayload[];
}

type DbRow = Record<string, unknown>;
type ServerClient = Awaited<ReturnType<typeof createClient>>;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function toNumberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toIntegerValue(value: unknown) {
  return Math.trunc(toNumberValue(value));
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(toStringValue).filter(Boolean) : [];
}

function toDateString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sourceTrace(row: DbRow) {
  return {
    batchId: toStringValue(row.batch_id),
    sourceFile: toStringValue(row.source_file),
    sourceSheet: toStringValue(row.source_sheet),
    rowNumber: toIntegerValue(row.source_row),
  };
}

function rowFortnight(period: string | null | undefined, date: string | null) {
  const normalized = normalizeFortnight(period);
  return monthFromFortnight(normalized) ? normalized : fortnightFromDate(date);
}

function firstBatchFortnight(batch: ParsedBatch) {
  const candidates = [
    ...batch.prefatura.map((row) => rowFortnight(row.period, row.routeDate)),
    ...batch.pnr.map((row) => rowFortnight(row.billingPeriod, row.caseDate)),
    ...batch.risk.map((row) => rowFortnight(undefined, row.failureDate)),
  ].filter((fortnight) => Boolean(fortnight && monthFromFortnight(fortnight)));
  return candidates[0] ?? null;
}

function isSourceKindArray(value: unknown): value is SourceKind[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function metadataEntry(row: DbRow): Partial<ImportEntry> {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const entry = (metadata as { entry?: unknown }).entry;
  return entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as Partial<ImportEntry>) : {};
}

function mapImportEntry(row: DbRow): ImportEntry {
  const entry = metadataEntry(row);
  const issues = Array.isArray(entry.issues) ? entry.issues.map(toStringValue) : [];
  const kinds = isSourceKindArray(entry.kinds) ? entry.kinds : [];
  const status = entry.status === "com-alertas" || entry.status === "erro" || entry.status === "demonstração" ? entry.status : "concluído";
  return {
    id: toStringValue(entry.id || row.id),
    batchId: toStringValue(entry.batchId || row.id),
    name: toStringValue(entry.name || row.name),
    importedAt: toStringValue(entry.importedAt || row.finished_at || row.started_at || new Date().toISOString()),
    fortnight: toStringValue(entry.fortnight || row.fortnight),
    month: toStringValue(entry.month || row.month || row.competence),
    size: toNumberValue(entry.size),
    status,
    kinds,
    workbookCount: toIntegerValue(entry.workbookCount),
    rowCount: toIntegerValue(row.row_count || entry.rowCount),
    issues,
  };
}

function mapHierarchy(row: DbRow): HierarchyRecord {
  return {
    ...sourceTrace(row),
    coordinator: toStringValue(row.coordinator_name),
    supervisor: toStringValue(row.supervisor_name),
    sigla: toStringValue(row.sigla),
    base: toStringValue(row.base_name),
    baseKey: toStringValue(row.base_key),
  };
}

function mapPrefatura(row: DbRow): PrefaturaRecord {
  const operation = toStringValue(row.operation);
  return {
    ...sourceTrace(row),
    period: toStringValue(row.period),
    baseLabel: toStringValue(row.base_label),
    baseName: toStringValue(row.base_name),
    baseKey: toStringValue(row.base_key),
    sigla: toStringValue(row.sigla),
    driverName: toStringValue(row.driver_name),
    plate: toStringValue(row.plate),
    description: toStringValue(row.description),
    routeDate: toDateString(row.route_date),
    shipmentId: toStringValue(row.shipment_id),
    routeId: toStringValue(row.route_id),
    value: toNumberValue(row.value),
    operation: operation === "XPT" || operation === "PNR" ? operation : "SVC",
  };
}

function mapPnr(row: DbRow): PnrRecord {
  return {
    ...sourceTrace(row),
    caseDate: toDateString(row.case_date),
    status: toStringValue(row.status),
    billingPeriod: toStringValue(row.billing_period),
    shipmentId: toStringValue(row.shipment_id),
    products: toStringValue(row.products),
    purchaseValue: toNumberValue(row.purchase_value),
    carrier: toStringValue(row.carrier),
    originStation: toStringValue(row.origin_station),
    baseKey: toStringValue(row.base_key),
    sigla: toStringValue(row.sigla),
    routeId: toStringValue(row.route_id),
    driverId: toStringValue(row.driver_id),
    custom: toStringValue(row.custom),
  };
}

function mapRisk(row: DbRow): RiskRecord {
  return {
    ...sourceTrace(row),
    failureDate: toDateString(row.failure_date),
    shipmentId: toStringValue(row.shipment_id),
    itemDescription: toStringValue(row.item_description),
    driverId: toStringValue(row.driver_id),
    facilityId: toStringValue(row.facility_id),
    destinationType: toStringValue(row.destination_type),
    carrierName: toStringValue(row.carrier_name),
    failureReason: toStringValue(row.failure_reason),
    lastSubstatus: toStringValue(row.last_substatus),
    routeId: toStringValue(row.route_id),
    routeStatus: toStringValue(row.route_status),
    destinationFacilityId: toStringValue(row.destination_facility_id),
    vehicleType: toStringValue(row.vehicle_type),
    quantity: toIntegerValue(row.quantity),
    stoppedDays: toIntegerValue(row.stopped_days),
    gmvUsd: toNumberValue(row.gmv_usd),
    gmvBrl: toNumberValue(row.gmv_brl),
    baseKey: toStringValue(row.base_key),
    sigla: toStringValue(row.sigla),
  };
}

function mapDriver(row: DbRow): DriverRecord {
  return {
    ...sourceTrace(row),
    driverId: toStringValue(row.driver_id),
    name: toStringValue(row.name),
    experience: toStringValue(row.experience),
    incidents: toIntegerValue(row.incidents),
    lastUpdated: toDateString(row.last_updated),
    state: toStringValue(row.state),
    shipped: toIntegerValue(row.shipped),
    delivered: toIntegerValue(row.delivered),
    undelivered: toIntegerValue(row.undelivered),
    unvisited: toIntegerValue(row.unvisited),
    penalized: toIntegerValue(row.penalized),
    contradictoryPnr: toIntegerValue(row.contradictory_pnr),
    emptyBoxes: toIntegerValue(row.empty_boxes),
    lost: toIntegerValue(row.lost),
    stolen: toIntegerValue(row.stolen),
  };
}

async function requireProfile(supabase: ServerClient): Promise<AuthProfile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,global_access,base_scope,sigla_scope")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  const row = (profile ?? {}) as DbRow;
  const role = isUserRole(row.role) ? row.role : "coordinator";

  return {
    id: userData.user.id,
    email: toStringValue(row.email || userData.user.email),
    fullName: toStringValue(row.full_name || userData.user.email || "Usuário ALC"),
    role,
    globalAccess: Boolean(row.global_access),
    baseScope: toStringArray(row.base_scope),
    siglaScope: toStringArray(row.sigla_scope),
  };
}

async function readTable(supabase: ServerClient, table: string, select = "*", orderColumn = "created_at") {
  const { data, error } = await supabase.from(table).select(select).order(orderColumn, { ascending: false });
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as unknown as DbRow[];
}

async function loadDashboardData(supabase: ServerClient): Promise<DashboardData> {
  const [imports, hierarchy, prefatura, pnr, risk, drivers] = await Promise.all([
    readTable(supabase, "import_batches", "*", "started_at"),
    readTable(supabase, "hierarchy_scopes"),
    readTable(supabase, "prefatura_records"),
    readTable(supabase, "pnr_records"),
    readTable(supabase, "risk_lm_records"),
    readTable(supabase, "driver_records"),
  ]);

  return {
    hierarchy: hierarchy.map(mapHierarchy),
    prefatura: prefatura.map(mapPrefatura),
    pnr: pnr.map(mapPnr),
    risk: risk.map(mapRisk),
    drivers: drivers.map(mapDriver),
    imports: imports.map(mapImportEntry),
    isDemo: false,
  };
}

async function insertRows(supabase: ServerClient, table: string, rows: DbRow[]) {
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    if (chunk.length === 0) continue;
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

function traceColumns(row: { sourceFile: string; sourceSheet: string; rowNumber: number }) {
  return {
    source_file: row.sourceFile,
    source_sheet: row.sourceSheet,
    source_row: row.rowNumber,
  };
}

async function persistBatch(supabase: ServerClient, profile: AuthProfile, batch: ParsedBatch, files: UploadedFilePayload[]) {
  const batchId = batch.entry.batchId;
  const fortnight = firstBatchFortnight(batch);
  const month = fortnight ? monthFromFortnight(fortnight) : null;
  const fileHash = files.map((file) => file.fileHash).join(",");

  for (const table of CHILD_TABLES) {
    const { error } = await supabase.from(table).delete().eq("batch_id", batchId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  await supabase.from("imported_files").delete().eq("batch_id", batchId);
  await supabase.from("import_batches").delete().eq("id", batchId);

  const { error: batchError } = await supabase.from("import_batches").insert({
    id: batchId,
    imported_by: profile.id,
    name: batch.entry.name,
    module: batch.entry.kinds.join(",") || "painel",
    competence: month,
    fortnight,
    month,
    status: batch.entry.status,
    file_hash: fileHash || null,
    row_count: batch.entry.rowCount,
    valid_count: batch.entry.rowCount,
    persisted_count: batch.entry.rowCount,
    ignored_count: 0,
    error_count: batch.entry.issues.length,
    started_at: batch.entry.importedAt,
    finished_at: new Date().toISOString(),
    metadata: { entry: batch.entry },
  });
  if (batchError) throw new Error(`import_batches: ${batchError.message}`);

  await insertRows(
    supabase,
    "imported_files",
    files.map((file) => ({
      batch_id: batchId,
      original_name: file.originalName,
      storage_path: file.storagePath,
      file_size: file.fileSize,
      file_hash: file.fileHash,
      workbook_count: file.workbookCount,
    })),
  );

  await insertRows(
    supabase,
    "hierarchy_scopes",
    batch.hierarchy.map((row) => ({
      batch_id: batchId,
      coordinator_name: row.coordinator,
      supervisor_name: row.supervisor,
      sigla: row.sigla,
      base_name: row.base,
      base_key: row.baseKey,
      ...traceColumns(row),
    })),
  );

  await insertRows(
    supabase,
    "prefatura_records",
    batch.prefatura.map((row) => {
      const rowFt = rowFortnight(row.period, row.routeDate);
      return {
        batch_id: batchId,
        shipment_id: row.shipmentId,
        route_id: row.routeId,
        operation: row.operation,
        period: row.period,
        fortnight: rowFt,
        month: monthFromFortnight(rowFt),
        route_date: row.routeDate,
        base_label: row.baseLabel,
        base_name: row.baseName,
        base_key: row.baseKey,
        sigla: row.sigla,
        driver_name: row.driverName,
        plate: row.plate,
        description: row.description,
        value: row.value,
        original_payload: row,
        ...traceColumns(row),
      };
    }),
  );

  await insertRows(
    supabase,
    "pnr_records",
    batch.pnr.map((row) => {
      const rowFt = rowFortnight(row.billingPeriod, row.caseDate);
      return {
        batch_id: batchId,
        shipment_id: row.shipmentId,
        case_date: row.caseDate,
        status: row.status,
        billing_period: row.billingPeriod,
        fortnight: rowFt,
        month: monthFromFortnight(rowFt),
        products: row.products,
        purchase_value: row.purchaseValue,
        carrier: row.carrier,
        origin_station: row.originStation,
        base_key: row.baseKey,
        sigla: row.sigla,
        route_id: row.routeId,
        driver_id: row.driverId,
        custom: row.custom,
        original_payload: row,
        ...traceColumns(row),
      };
    }),
  );

  await insertRows(
    supabase,
    "risk_lm_records",
    batch.risk.map((row) => {
      const rowFt = rowFortnight(undefined, row.failureDate);
      return {
        batch_id: batchId,
        shipment_id: row.shipmentId,
        failure_date: row.failureDate,
        fortnight: rowFt,
        month: monthFromFortnight(rowFt),
        item_description: row.itemDescription,
        driver_id: row.driverId,
        facility_id: row.facilityId,
        destination_type: row.destinationType,
        carrier_name: row.carrierName,
        failure_reason: row.failureReason,
        last_substatus: row.lastSubstatus,
        route_id: row.routeId,
        route_status: row.routeStatus,
        destination_facility_id: row.destinationFacilityId,
        vehicle_type: row.vehicleType,
        quantity: row.quantity,
        stopped_days: row.stoppedDays,
        gmv_usd: row.gmvUsd,
        gmv_brl: row.gmvBrl,
        base_key: row.baseKey,
        sigla: row.sigla,
        original_payload: row,
        ...traceColumns(row),
      };
    }),
  );

  await insertRows(
    supabase,
    "driver_records",
    batch.drivers.map((row) => ({
      batch_id: batchId,
      driver_id: row.driverId,
      name: row.name,
      experience: row.experience,
      incidents: row.incidents,
      last_updated: row.lastUpdated,
      state: row.state,
      shipped: row.shipped,
      delivered: row.delivered,
      undelivered: row.undelivered,
      unvisited: row.unvisited,
      penalized: row.penalized,
      contradictory_pnr: row.contradictoryPnr,
      empty_boxes: row.emptyBoxes,
      lost: row.lost,
      stolen: row.stolen,
      original_payload: row,
      ...traceColumns(row),
    })),
  );
}

export async function GET() {
  try {
    const supabase = await createClient();
    await requireProfile(supabase);
    return NextResponse.json(await loadDashboardData(supabase));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao carregar dados online.", 401);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const profile = await requireProfile(supabase);
    if (!hasFullAccess(profile)) return jsonError("Importação restrita a Diretor, ADM ou Desenvolvedor.", 403);

    const payload = (await request.json()) as Partial<PersistRequest>;
    const batches = Array.isArray(payload.batches) ? payload.batches : [];
    const files = Array.isArray(payload.files) ? payload.files : [];
    if (batches.length === 0) return jsonError("Nenhum lote recebido para persistência.");

    for (const batch of batches) {
      const batchFiles = files.filter((file) => file.batchId === batch.entry.batchId);
      await persistBatch(supabase, profile, batch, batchFiles);
    }

    return NextResponse.json(await loadDashboardData(supabase));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao salvar dados online.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const profile = await requireProfile(supabase);
    if (!hasFullAccess(profile)) return jsonError("Exclusão restrita a Diretor, ADM ou Desenvolvedor.", 403);

    const url = new URL(request.url);
    const batchId = url.searchParams.get("batchId");
    const filesQuery = batchId
      ? supabase.from("imported_files").select("storage_path").eq("batch_id", batchId)
      : supabase.from("imported_files").select("storage_path");
    const { data: fileRows, error: fileError } = await filesQuery;
    if (fileError) throw new Error(`imported_files: ${fileError.message}`);

    const paths = ((fileRows ?? []) as DbRow[]).map((row) => toStringValue(row.storage_path)).filter(Boolean);
    if (paths.length > 0) await supabase.storage.from(IMPORT_BUCKET).remove(paths);

    const deleteQuery = batchId
      ? supabase.from("import_batches").delete().eq("id", batchId)
      : supabase.from("import_batches").delete().gte("started_at", "1900-01-01");
    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw new Error(`import_batches: ${deleteError.message}`);

    return NextResponse.json(batchId ? await loadDashboardData(supabase) : EMPTY_DATA);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao excluir dados online.", 500);
  }
}
