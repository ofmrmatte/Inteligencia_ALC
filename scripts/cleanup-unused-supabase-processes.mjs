import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = !apply || args.has("--dry-run");
const generatedAt = new Date().toISOString();
const bucket = process.env.DASHBOARD_BUCKET || "dashboard-files";
const staleHours = Number(process.env.CLEANUP_STALE_HOURS || 24);

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || (!serviceKey && !anonKey)) {
  console.error("[Supabase Cleanup] Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey || anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const MODULE_TABLES = {
  "pre-fatura": "pre_fatura_records",
  "gestao-pacotes": "gestao_pacotes_records",
  "gestao-desvios-pnr": "desvios_pnr_records",
};

const FILE_TYPE_MODULES = {
  PRE_FATURA: "pre-fatura",
  GESTAO_PACOTES: "gestao-pacotes",
  DESVIOS_PNR: "gestao-desvios-pnr",
};

const VALID_FILE_TYPES = new Set(Object.keys(FILE_TYPE_MODULES));
const STALE_STATUSES = new Set(["processing", "pending", "uploading", "failed"]);
const report = {
  mode: dryRun ? "dry-run" : "apply",
  generatedAt,
  staleHours,
  tablesAnalyzed: [],
  tableCounts: {},
  relationSizes: [],
  candidates: {
    dashboardFilesRemove: [],
    dashboardFilesStatusFix: [],
    processedDashboardFilesRemove: [],
    processedDashboardFilesStatusFix: [],
    storageRemove: [],
    rawPayloadCompact: [],
    aggregateRefresh: [],
    analyzeTables: [],
    vacuumFullCandidates: [],
  },
  diagnostics: {
    dashboardFilesByStatus: {},
    processedDashboardFilesByStatus: {},
    duplicateDashboardFilesByHash: [],
    duplicateDashboardFilesByName: [],
    duplicateProcessedByModuleHash: [],
    orphanProcessedControls: [],
    storageObjects: [],
    storageOrphans: [],
    heavyFields: {},
    aggregateConsistency: {},
    skipped: [],
  },
  applyBlocked: dryRun,
};

function log(message, details) {
  if (details === undefined) {
    console.log(`[Supabase Cleanup] ${message}`);
    return;
  }
  console.log(`[Supabase Cleanup] ${message}`, details);
}

function ageHours(value) {
  const ts = value ? new Date(value).getTime() : 0;
  if (!ts || Number.isNaN(ts)) return Infinity;
  return (Date.now() - ts) / 36e5;
}

function isProcessedOnlyPath(storagePath = "") {
  return String(storagePath || "").startsWith("processed-only/");
}

function isRawDeleted(record) {
  return record?.metadata?.raw_file_deleted === true || record?.raw_file_deleted === true || isProcessedOnlyPath(record?.storage_path || record?.metadata?.storage_path || "");
}

function moduleKeyFromDashboardFile(record) {
  return FILE_TYPE_MODULES[record?.file_type] || FILE_TYPE_MODULES[record?.metadata?.file_category] || "";
}

function fileHash(record) {
  return record?.file_hash || record?.metadata?.file_hash || "";
}

function fileName(record) {
  return record?.file_name || record?.metadata?.original_name || "";
}

async function fetchAll(table, select = "*") {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function countTable(table) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) return { error: error.message };
  return { count: Number(count || 0) };
}

async function countRowsForFile(table, fileId) {
  if (!table || !fileId) return 0;
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("file_id", fileId);
  if (error) return 0;
  return Number(count || 0);
}

async function countRowsByFileIds(table, ids) {
  const result = new Map();
  for (const id of ids) result.set(id, await countRowsForFile(table, id));
  return result;
}

async function listStorageRecursive(prefix = "") {
  const objects = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      report.diagnostics.skipped.push({ scope: "storage", reason: error.message });
      return objects;
    }
    const page = Array.isArray(data) ? data : [];
    for (const item of page) {
      const objectPath = [prefix, item.name].filter(Boolean).join("/");
      if (item.id || item.metadata?.size != null) {
        objects.push({
          name: item.name,
          path: objectPath,
          size: Number(item.metadata?.size || 0),
          updated_at: item.updated_at || item.created_at || "",
        });
      } else {
        objects.push(...await listStorageRecursive(objectPath));
      }
    }
    if (page.length < pageSize) break;
  }
  return objects;
}

function groupBy(rows, keyFn) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function summarizeRecord(record, extra = {}) {
  return {
    id: record.id,
    file_name: fileName(record),
    file_type: record.file_type || record.module_key || "",
    status: record.status || "",
    storage_path: record.storage_path || record.metadata?.storage_path || "",
    file_hash: fileHash(record),
    row_count: Number(record.row_count || record.metadata?.parsed_rows || record.metadata?.record_count || 0),
    raw_file_deleted: isRawDeleted(record),
    updated_at: record.updated_at || record.processed_at || record.created_at || "",
    ...extra,
  };
}

function addCandidate(kind, record, reason, extra = {}) {
  report.candidates[kind].push({
    ...summarizeRecord(record, extra),
    reason,
  });
}

async function collectOptionalRelationSizes() {
  const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    report.diagnostics.skipped.push({ scope: "relationSizes", reason: "SUPABASE_DB_URL/DATABASE_URL não configurado" });
    return;
  }
  try {
    const postgres = (await import("postgres")).default;
    const sql = postgres(databaseUrl, { max: 1, ssl: "require" });
    try {
      report.relationSizes = await sql`
        select
          c.relname as table_name,
          pg_total_relation_size(c.oid)::bigint as total_bytes,
          pg_relation_size(c.oid)::bigint as table_bytes,
          pg_indexes_size(c.oid)::bigint as index_bytes,
          coalesce(s.n_live_tup, 0)::bigint as estimated_live_rows,
          coalesce(s.n_dead_tup, 0)::bigint as estimated_dead_rows
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_stat_user_tables s on s.relid = c.oid
        where n.nspname = 'public'
          and c.relkind in ('r','p')
          and c.relname in (
            'dashboard_files',
            'processed_dashboard_files',
            'pre_fatura_records',
            'gestao_pacotes_records',
            'desvios_pnr_records',
            'desvios_pnr_metrics_summary'
          )
        order by pg_total_relation_size(c.oid) desc
      `;
    } finally {
      await sql.end();
    }
  } catch (error) {
    report.diagnostics.skipped.push({ scope: "relationSizes", reason: error.message });
  }
}

async function collectHeavyFieldDiagnostics() {
  const checks = [
    {
      table: "desvios_pnr_records",
      rawColumn: "raw_data",
      produtosColumn: "produtos",
    },
    {
      table: "pre_fatura_records",
      rawColumn: "raw_data",
    },
    {
      table: "gestao_pacotes_records",
      rawColumn: "raw_data",
    },
  ];

  for (const check of checks) {
    const rawRows = [];
    const { data, error } = await supabase
      .from(check.table)
      .select(`id,file_id,${check.rawColumn}${check.produtosColumn ? `,${check.produtosColumn}` : ""}`)
      .limit(1000);
    if (error) {
      report.diagnostics.heavyFields[check.table] = { error: error.message };
      continue;
    }
    for (const row of data || []) {
      const rawText = JSON.stringify(row[check.rawColumn] || {});
      const produtosText = check.produtosColumn ? String(row[check.produtosColumn] || "") : "";
      if (rawText !== "{}" || produtosText) {
        rawRows.push({
          id: row.id,
          file_id: row.file_id,
          raw_bytes: Buffer.byteLength(rawText),
          produtos_bytes: Buffer.byteLength(produtosText),
        });
      }
    }
  report.diagnostics.heavyFields[check.table] = {
      sampledRows: (data || []).length,
      sampledHeavyRows: rawRows.length,
      sample: rawRows.slice(0, 20),
    };
    if (rawRows.length) {
      report.candidates.rawPayloadCompact.push({
        table: check.table,
        reason: "Amostra encontrou raw_data/produtos preenchidos; compactação deve zerar apenas payload bruto não usado.",
        sampledHeavyRows: rawRows.length,
        sample: rawRows.slice(0, 10),
      });
    }
  }
}

function uniqueCandidatesById(candidates) {
  const unique = new Map();
  for (const candidate of candidates || []) {
    if (!candidate?.id) continue;
    if (!unique.has(candidate.id)) {
      unique.set(candidate.id, { ...candidate, reasons: [candidate.reason].filter(Boolean) });
      continue;
    }
    const current = unique.get(candidate.id);
    if (candidate.reason && !current.reasons.includes(candidate.reason)) current.reasons.push(candidate.reason);
  }
  return [...unique.values()];
}

function mergeMetadata(record, extra = {}) {
  return {
    ...(record.metadata || {}),
    ...extra,
  };
}

async function updateDashboardFileStatus(candidate) {
  const { data: current, error: readError } = await supabase
    .from("dashboard_files")
    .select("*")
    .eq("id", candidate.id)
    .maybeSingle();
  if (readError) throw new Error(`dashboard_files ${candidate.id}: ${readError.message}`);
  if (!current) return { id: candidate.id, action: "skip", reason: "registro não encontrado" };

  const persistedRows = Number(candidate.persisted_rows || 0);
  if (persistedRows <= 0) return { id: candidate.id, action: "skip", reason: "sem registros persistidos" };

  const metadata = mergeMetadata(current, {
    raw_file_deleted: true,
    parsed_rows: persistedRows,
    record_count: persistedRows,
    cleanup_fixed_at: generatedAt,
  });

  const { error } = await supabase
    .from("dashboard_files")
    .update({
      status: "processed",
      metadata,
      updated_at: generatedAt,
    })
    .eq("id", candidate.id);
  if (error) throw new Error(`dashboard_files update ${candidate.id}: ${error.message}`);
  return { id: candidate.id, action: "updated", persisted_rows: persistedRows };
}

async function removeDashboardFile(candidate) {
  const { data: current, error: readError } = await supabase
    .from("dashboard_files")
    .select("*")
    .eq("id", candidate.id)
    .maybeSingle();
  if (readError) throw new Error(`dashboard_files ${candidate.id}: ${readError.message}`);
  if (!current) return { id: candidate.id, action: "skip", reason: "registro não encontrado" };

  const moduleKey = moduleKeyFromDashboardFile(current);
  const table = MODULE_TABLES[moduleKey];
  const persistedRows = table ? await countRowsForFile(table, current.id) : 0;
  if (persistedRows > 0) {
    return { id: candidate.id, action: "skip", reason: "tem registros persistidos", persisted_rows: persistedRows };
  }

  const { error } = await supabase.from("dashboard_files").delete().eq("id", candidate.id);
  if (error) throw new Error(`dashboard_files delete ${candidate.id}: ${error.message}`);
  return { id: candidate.id, action: "deleted", persisted_rows: persistedRows };
}

async function updateProcessedDashboardFile(candidate) {
  const { data: current, error: readError } = await supabase
    .from("processed_dashboard_files")
    .select("*")
    .eq("id", candidate.id)
    .maybeSingle();
  if (readError) throw new Error(`processed_dashboard_files ${candidate.id}: ${readError.message}`);
  if (!current) return { id: candidate.id, action: "skip", reason: "registro não encontrado" };

  const persistedRows = Number(candidate.persisted_rows || candidate.declared_rows || current.row_count || 0);
  if (persistedRows <= 0) return { id: candidate.id, action: "skip", reason: "sem registros persistidos" };

  const metadata = {
    ...(current.metadata || {}),
    raw_file_deleted: true,
    cleanup_fixed_at: generatedAt,
  };

  const { error } = await supabase
    .from("processed_dashboard_files")
    .update({
      status: "processed",
      row_count: persistedRows,
      raw_file_deleted: true,
      metadata,
      processed_at: current.processed_at || generatedAt,
    })
    .eq("id", candidate.id);
  if (error) throw new Error(`processed_dashboard_files update ${candidate.id}: ${error.message}`);
  return { id: candidate.id, action: "updated", persisted_rows: persistedRows };
}

async function removeStorageObject(candidate) {
  if (!candidate.path) return { path: "", action: "skip", reason: "sem path" };
  const { error } = await supabase.storage.from(bucket).remove([candidate.path]);
  if (error) throw new Error(`storage remove ${candidate.path}: ${error.message}`);
  return { path: candidate.path, action: "deleted" };
}

async function runApply() {
  const actions = {
    dashboardFilesDeleted: [],
    dashboardFilesDeleteSkipped: [],
    dashboardFilesStatusUpdated: [],
    dashboardFilesStatusSkipped: [],
    processedDashboardFilesStatusUpdated: [],
    processedDashboardFilesStatusSkipped: [],
    storageDeleted: [],
    storageSkipped: [],
    aggregateRefresh: [],
    rawPayloadCompactSkipped: report.candidates.rawPayloadCompact.map((candidate) => ({
      table: candidate.table,
      reason: "compactação não aplicada nesta execução; depende de validação de campos estruturados no app",
    })),
    analyzeSkipped: [],
  };

  for (const candidate of uniqueCandidatesById(report.candidates.dashboardFilesRemove)) {
    const result = await removeDashboardFile(candidate);
    if (result.action === "deleted") actions.dashboardFilesDeleted.push(result);
    else actions.dashboardFilesDeleteSkipped.push(result);
  }

  for (const candidate of uniqueCandidatesById(report.candidates.dashboardFilesStatusFix)) {
    const result = await updateDashboardFileStatus(candidate);
    if (result.action === "updated") actions.dashboardFilesStatusUpdated.push(result);
    else actions.dashboardFilesStatusSkipped.push(result);
  }

  for (const candidate of uniqueCandidatesById(report.candidates.processedDashboardFilesStatusFix)) {
    const result = await updateProcessedDashboardFile(candidate);
    if (result.action === "updated") actions.processedDashboardFilesStatusUpdated.push(result);
    else actions.processedDashboardFilesStatusSkipped.push(result);
  }

  for (const candidate of report.candidates.storageRemove || []) {
    const result = await removeStorageObject(candidate);
    if (result.action === "deleted") actions.storageDeleted.push(result);
    else actions.storageSkipped.push(result);
  }

  if ((report.tableCounts.desvios_pnr_records?.count || 0) > 0) {
    const { error } = await supabase.rpc("refresh_desvios_pnr_metrics_summary");
    if (error) actions.aggregateRefresh.push({ table: "desvios_pnr_metrics_summary", action: "error", error: error.message });
    else actions.aggregateRefresh.push({ table: "desvios_pnr_metrics_summary", action: "refreshed" });
  }

  actions.analyzeSkipped.push({
    reason: "ANALYZE/VACUUM exige conexão SQL direta; não executado pela Data API nesta limpeza",
  });

  report.appliedActions = actions;
}

async function main() {
  log(`Iniciando relatório em modo ${dryRun ? "dry-run" : "apply"}.${dryRun ? " Nenhuma exclusão será executada neste run." : " Ações seguras aprovadas serão aplicadas."}`);

  const analyzedTables = [
    "dashboard_files",
    "processed_dashboard_files",
    "pre_fatura_records",
    "gestao_pacotes_records",
    "desvios_pnr_records",
    "desvios_pnr_metrics_summary",
  ];
  report.tablesAnalyzed = analyzedTables;
  for (const table of analyzedTables) {
    report.tableCounts[table] = await countTable(table);
  }

  const [dashboardFiles, processedFiles, storageObjects] = await Promise.all([
    fetchAll("dashboard_files"),
    fetchAll("processed_dashboard_files"),
    listStorageRecursive(""),
  ]);
  report.diagnostics.storageObjects = storageObjects;

  const dashboardByHash = groupBy(dashboardFiles, (record) => `${record.file_type || ""}:${fileHash(record) || ""}`);
  const dashboardByName = groupBy(dashboardFiles, (record) => `${record.file_type || ""}:${fileName(record).toLowerCase()}`);
  const processedByHash = groupBy(processedFiles, (record) => `${record.module_key || ""}:${fileHash(record) || ""}`);
  const dashboardByStoragePath = new Map(dashboardFiles.filter((record) => record.storage_path).map((record) => [record.storage_path, record]));
  const processedByStoragePath = new Map(processedFiles.filter((record) => record.storage_path).map((record) => [record.storage_path, record]));
  const dashboardByModuleHash = new Map(dashboardFiles.map((record) => [`${moduleKeyFromDashboardFile(record)}:${fileHash(record)}`, record]));

  for (const [key, rows] of dashboardByHash.entries()) {
    if (!key.endsWith(":") && rows.length > 1) report.diagnostics.duplicateDashboardFilesByHash.push({ key, records: rows.map(summarizeRecord) });
  }
  for (const [key, rows] of dashboardByName.entries()) {
    if (rows.length > 1) report.diagnostics.duplicateDashboardFilesByName.push({ key, records: rows.map(summarizeRecord) });
  }
  for (const [key, rows] of processedByHash.entries()) {
    if (!key.endsWith(":") && rows.length > 1) report.diagnostics.duplicateProcessedByModuleHash.push({ key, records: rows.map(summarizeRecord) });
  }

  const persistedCountCache = new Map();
  for (const fileType of Object.keys(FILE_TYPE_MODULES)) {
    const moduleKey = FILE_TYPE_MODULES[fileType];
    const table = MODULE_TABLES[moduleKey];
    const ids = dashboardFiles.filter((record) => record.file_type === fileType).map((record) => record.id);
    const counts = await countRowsByFileIds(table, ids);
    for (const [id, count] of counts.entries()) persistedCountCache.set(id, count);
  }

  for (const file of dashboardFiles) {
    const moduleKey = moduleKeyFromDashboardFile(file);
    const persistedRows = persistedCountCache.get(file.id) || 0;
    const declaredRows = Number(file.metadata?.parsed_rows || file.metadata?.record_count || 0);
    const stale = ageHours(file.updated_at || file.created_at) >= staleHours;
    const validModule = Boolean(moduleKey && MODULE_TABLES[moduleKey]);
    const hash = fileHash(file);
    const hasProcessedControl = processedFiles.some((processed) =>
      processed.module_key === moduleKey &&
      ((hash && processed.file_hash === hash) || (fileName(processed).toLowerCase() === fileName(file).toLowerCase())),
    );

    const statusKey = `${file.file_type || "sem_tipo"}:${file.status || "sem_status"}:${isRawDeleted(file) ? "raw_deleted" : "raw_kept"}`;
    report.diagnostics.dashboardFilesByStatus[statusKey] = (report.diagnostics.dashboardFilesByStatus[statusKey] || 0) + 1;

    if (!validModule) {
      addCandidate("dashboardFilesRemove", file, "file_type/module_key não reconhecido", { persisted_rows: persistedRows });
      continue;
    }
    if (STALE_STATUSES.has(file.status) && stale && persistedRows <= 0) {
      addCandidate("dashboardFilesRemove", file, "processo antigo travado sem registros persistidos", { persisted_rows: persistedRows, age_hours: Math.round(ageHours(file.updated_at || file.created_at)) });
    } else if (STALE_STATUSES.has(file.status) && persistedRows > 0) {
      addCandidate("dashboardFilesStatusFix", file, "status travado, mas há registros persistidos; corrigir para processed", { persisted_rows: persistedRows });
    }
    if (file.status === "processed" && persistedRows <= 0) {
      addCandidate("dashboardFilesRemove", file, "status processed sem registros na tabela final", { persisted_rows: persistedRows });
    }
    if (file.status === "missing_storage" && persistedRows <= 0 && isRawDeleted(file)) {
      addCandidate("dashboardFilesRemove", file, "missing_storage sem dados persistidos e sem arquivo bruto", { persisted_rows: persistedRows });
    }
    if (!hasProcessedControl && persistedRows <= 0 && isRawDeleted(file)) {
      addCandidate("dashboardFilesRemove", file, "sem processed_dashboard_files correspondente, sem registros persistidos e sem bruto", { persisted_rows: persistedRows });
    }
    if (persistedRows > 0 && (file.status !== "processed" || declaredRows !== persistedRows)) {
      addCandidate("dashboardFilesStatusFix", file, "metadados/status divergentes dos registros persistidos", { persisted_rows: persistedRows, declared_rows: declaredRows });
    }
  }

  for (const file of processedFiles) {
    const moduleKey = file.module_key;
    const table = MODULE_TABLES[moduleKey];
    const hash = fileHash(file);
    const matchedDashboard = dashboardByModuleHash.get(`${moduleKey}:${hash}`) ||
      dashboardFiles.find((record) => moduleKeyFromDashboardFile(record) === moduleKey && fileName(record).toLowerCase() === fileName(file).toLowerCase());
    const persistedRows = matchedDashboard ? persistedCountCache.get(matchedDashboard.id) || 0 : 0;
    const rowCount = Number(file.row_count || 0);
    const stale = ageHours(file.processed_at || file.created_at) >= staleHours;
    const statusKey = `${moduleKey || "sem_modulo"}:${file.status || "sem_status"}:${isRawDeleted(file) ? "raw_deleted" : "raw_kept"}`;
    report.diagnostics.processedDashboardFilesByStatus[statusKey] = (report.diagnostics.processedDashboardFilesByStatus[statusKey] || 0) + 1;

    if (!table) {
      addCandidate("processedDashboardFilesRemove", file, "module_key sem tabela final correspondente", { persisted_rows: persistedRows });
      continue;
    }
    if (STALE_STATUSES.has(file.status) && stale && persistedRows <= 0) {
      addCandidate("processedDashboardFilesRemove", file, "controle travado antigo sem registros persistidos", { persisted_rows: persistedRows, age_hours: Math.round(ageHours(file.processed_at || file.created_at)) });
    } else if (STALE_STATUSES.has(file.status) && persistedRows > 0) {
      addCandidate("processedDashboardFilesStatusFix", file, "controle travado, mas há registros persistidos", { persisted_rows: persistedRows });
    }
    if (file.status === "processed" && rowCount <= 0 && persistedRows <= 0) {
      addCandidate("processedDashboardFilesRemove", file, "processed com row_count zero e sem registros persistidos", { persisted_rows: persistedRows });
    }
    if (file.status === "processed" && rowCount > 0 && persistedRows <= 0 && !matchedDashboard) {
      report.diagnostics.orphanProcessedControls.push({
        ...summarizeRecord(file),
        reason: "controle processed sem dashboard_file correspondente; revisar antes de remover",
      });
    }
    if (persistedRows > 0 && (file.status !== "processed" || rowCount !== persistedRows || !isRawDeleted(file))) {
      addCandidate("processedDashboardFilesStatusFix", file, "controle diverge da tabela final ou raw_file_deleted", { persisted_rows: persistedRows, declared_rows: rowCount });
    }
  }

  for (const object of storageObjects) {
    const dashboardRecord = dashboardByStoragePath.get(object.path);
    const processedRecord = processedByStoragePath.get(object.path);
    if (!dashboardRecord && !processedRecord) {
      report.diagnostics.storageOrphans.push({ ...object, reason: "objeto no Storage sem dashboard_files/processed_dashboard_files correspondente" });
      report.candidates.storageRemove.push({ ...object, reason: "órfão no Storage sem metadados correspondentes" });
      continue;
    }
    const sourceRecord = dashboardRecord || processedRecord;
    const moduleKey = dashboardRecord ? moduleKeyFromDashboardFile(dashboardRecord) : processedRecord.module_key;
    const table = MODULE_TABLES[moduleKey];
    const persistedRows = dashboardRecord ? persistedCountCache.get(dashboardRecord.id) || 0 : 0;
    if (!isProcessedOnlyPath(object.path) && table && persistedRows > 0) {
      report.candidates.storageRemove.push({
        ...object,
        reason: "arquivo bruto com dados já persistidos; pode remover do Storage",
        file_name: fileName(sourceRecord),
        persisted_rows: persistedRows,
      });
    }
  }

  await collectHeavyFieldDiagnostics();

  const pnrMetricsRows = await countTable("desvios_pnr_metrics_summary");
  report.diagnostics.aggregateConsistency.desvios_pnr_metrics_summary = {
    metric_groups: pnrMetricsRows.count || 0,
    pnr_records: report.tableCounts.desvios_pnr_records?.count || 0,
    recommendation: "Recalcular via refresh_desvios_pnr_metrics_summary() após limpeza aplicada.",
  };
  if ((report.tableCounts.desvios_pnr_records?.count || 0) > 0) {
    report.candidates.aggregateRefresh.push({
      table: "desvios_pnr_metrics_summary",
      reason: "recalcular após remoções/compactações para garantir consistência",
      action: "select public.refresh_desvios_pnr_metrics_summary();",
    });
  }

  for (const table of analyzedTables) {
    report.candidates.analyzeTables.push({ table, reason: "atualizar estatísticas após limpeza apply" });
  }
  for (const size of report.relationSizes) {
    if (Number(size.estimated_dead_rows || 0) > 10000) {
      report.candidates.vacuumFullCandidates.push({ table: size.table_name, estimated_dead_rows: Number(size.estimated_dead_rows), reason: "muitos dead rows estimados" });
    }
  }

  await collectOptionalRelationSizes();

  if (apply) {
    await runApply();
  }

  const reportDir = path.resolve("scripts", "logs");
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `supabase-cleanup-${dryRun ? "dry-run" : "apply"}-${generatedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  log(`Relatório ${dryRun ? "dry-run" : "apply"} gerado.`);
  log(`Arquivo: ${reportPath}`);
  log("Resumo de candidatos", {
    dashboardFilesRemove: report.candidates.dashboardFilesRemove.length,
    dashboardFilesStatusFix: report.candidates.dashboardFilesStatusFix.length,
    processedDashboardFilesRemove: report.candidates.processedDashboardFilesRemove.length,
    processedDashboardFilesStatusFix: report.candidates.processedDashboardFilesStatusFix.length,
    storageRemove: report.candidates.storageRemove.length,
    rawPayloadCompact: report.candidates.rawPayloadCompact.length,
    aggregateRefresh: report.candidates.aggregateRefresh.length,
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("[Supabase Cleanup] Falha no relatório:", error);
  process.exit(1);
});
