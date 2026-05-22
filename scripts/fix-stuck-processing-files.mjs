import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = !apply || args.has("--dry-run");
const staleMinutes = Number(process.env.PNR_PROCESSING_STALE_MINUTES || 30);
const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || (!serviceKey && !anonKey)) {
  console.error("[PNR Stuck Processing Fix] Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey || anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizePnrMasterCandidateName(fileName = "") {
  const withoutPath = String(fileName || "").split(/[\\/]/).pop() || "";
  const withoutExtension = withoutPath.replace(/\.(xlsx|xls|xltx|csv)$/i, "");
  return normalizeText(withoutExtension);
}

function isPnrMasterFile(fileName = "") {
  return normalizePnrMasterCandidateName(fileName) === "pnr mestre 2024 2025";
}

async function countRowsByFileId(fileId) {
  if (!fileId) return 0;
  const { count, error } = await supabase
    .from("desvios_pnr_records")
    .select("id", { count: "exact", head: true })
    .eq("file_id", fileId);
  if (error) throw error;
  return Number(count || 0);
}

async function updateDashboardFile(record, status, rowCount, reason) {
  const metadata = {
    ...(record.metadata || {}),
    processing_recovered_at: new Date().toISOString(),
    processing_recovery_reason: reason,
    row_count: rowCount,
    record_count: rowCount,
    parsed_rows: rowCount,
    raw_file_deleted: record.metadata?.raw_file_deleted === true || String(record.storage_path || "").startsWith("processed-only/"),
  };
  if (dryRun) return;
  const { error } = await supabase
    .from("dashboard_files")
    .update({
      status,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", record.id);
  if (error) throw error;
}

async function updateProcessedFile(record, status, rowCount, reason) {
  const metadata = {
    ...(record.metadata || {}),
    processing_recovered_at: new Date().toISOString(),
    processing_recovery_reason: reason,
    row_count: rowCount,
    record_count: rowCount,
    parsed_rows: rowCount,
    raw_file_deleted: record.raw_file_deleted === true || record.metadata?.raw_file_deleted === true,
  };
  if (dryRun) return;
  const { error } = await supabase
    .from("processed_dashboard_files")
    .update({
      status,
      row_count: rowCount,
      processed_at: new Date().toISOString(),
      raw_file_deleted: metadata.raw_file_deleted,
      metadata,
    })
    .eq("id", record.id);
  if (error) throw error;
}

async function fetchStuckDashboardFiles() {
  const { data, error } = await supabase
    .from("dashboard_files")
    .select("*")
    .eq("file_type", "DESVIOS_PNR")
    .in("status", ["processing", "pending"])
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function fetchStuckProcessedFiles() {
  const { data, error } = await supabase
    .from("processed_dashboard_files")
    .select("*")
    .in("module_key", ["desvios_pnr", "desvios-pnr", "gestao-desvios-pnr"])
    .in("status", ["processing", "pending"])
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function main() {
  console.log("[PNR Stuck Processing Fix]", {
    mode: dryRun ? "dry-run" : "apply",
    staleMinutes,
    cutoff,
  });

  const dashboardFiles = await fetchStuckDashboardFiles();
  for (const file of dashboardFiles) {
    const rowCount = await countRowsByFileId(file.id);
    const status = rowCount > 0 ? "processed" : "failed";
    const reason = rowCount > 0 ? "registros persistidos encontrados" : "sem registros persistidos";
    console.log("[PNR Stuck Processing Fix]", {
      table: "dashboard_files",
      fileName: file.file_name,
      fileRole: isPnrMasterFile(file.file_name) ? "master" : "incremental",
      oldStatus: file.status,
      newStatus: status,
      rowCount,
      reason,
    });
    await updateDashboardFile(file, status, rowCount, reason);
  }

  const processedFiles = await fetchStuckProcessedFiles();
  for (const file of processedFiles) {
    const dashboardFileId = file.metadata?.dashboard_file_id || file.metadata?.file_id || "";
    const rowCount = await countRowsByFileId(dashboardFileId);
    const status = rowCount > 0 ? "processed" : "failed";
    const reason = rowCount > 0 ? "registros persistidos encontrados" : "sem registros persistidos";
    console.log("[PNR Stuck Processing Fix]", {
      table: "processed_dashboard_files",
      fileName: file.file_name,
      fileRole: isPnrMasterFile(file.file_name) ? "master" : "incremental",
      oldStatus: file.status,
      newStatus: status,
      rowCount,
      reason,
    });
    await updateProcessedFile(file, status, rowCount, reason);
  }

  console.log("[PNR Stuck Processing Fix] concluído.", {
    dashboardFiles: dashboardFiles.length,
    processedFiles: processedFiles.length,
    mode: dryRun ? "dry-run" : "apply",
  });
}

main().catch((error) => {
  console.error("[PNR Stuck Processing Fix] falhou.", error);
  process.exit(1);
});
