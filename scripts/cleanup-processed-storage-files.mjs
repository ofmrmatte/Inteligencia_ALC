import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SUPABASE_USER_EMAIL;
const password = process.env.SUPABASE_USER_PASSWORD;
const applyCleanup = process.env.APPLY_STORAGE_CLEANUP === "1";
const bucket = "dashboard-files";

if (!supabaseUrl || (!serviceKey && (!email || !password))) {
  console.error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_USER_EMAIL/SUPABASE_USER_PASSWORD.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey || process.env.SUPABASE_ANON_KEY);

if (!serviceKey) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

const MODULE_TABLES = {
  pre_fatura: "pre_fatura_records",
  "pre-fatura": "pre_fatura_records",
  gestao_pacotes: "gestao_pacotes_records",
  "gestao-pacotes": "gestao_pacotes_records",
  desvios_pnr: "desvios_pnr_records",
  "desvios-pnr": "desvios_pnr_records",
  "gestao-desvios-pnr": "desvios_pnr_records",
  pacotes_faltantes: "gestao_desvios_pacotes_faltantes",
  "pacotes-faltantes": "gestao_desvios_pacotes_faltantes",
};

async function countPersistedRows(moduleKey, storagePath) {
  const tableName = MODULE_TABLES[moduleKey];
  if (!tableName) return 0;

  const { data: fileRows, error: fileError } = await supabase
    .from("dashboard_files")
    .select("id")
    .eq("storage_path", storagePath)
    .limit(1);
  if (fileError) throw fileError;
  const fileId = fileRows?.[0]?.id;
  if (!fileId) return 0;

  const { count, error } = await supabase
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq("file_id", fileId);
  if (error) throw error;
  return Number(count || 0);
}

const { data: processedFiles, error: processedError } = await supabase
  .from("processed_dashboard_files")
  .select("*")
  .eq("status", "processed")
  .gt("row_count", 0)
  .or("raw_file_deleted.is.false,raw_file_deleted.is.null");
if (processedError) throw processedError;

const candidates = [];
for (const file of processedFiles || []) {
  const storagePath = file.storage_path || file.metadata?.storage_path || "";
  if (!storagePath || storagePath.startsWith("processed-only/")) continue;
  const persistedRows = await countPersistedRows(file.module_key, storagePath);
  candidates.push({
    id: file.id,
    module_key: file.module_key,
    file_name: file.file_name,
    storage_path: storagePath,
    row_count: file.row_count,
    persisted_rows: persistedRows,
    can_delete: persistedRows > 0 && persistedRows >= Number(file.row_count || 0),
  });
}

const deletable = candidates.filter((item) => item.can_delete);

if (applyCleanup && deletable.length) {
  const { error: removeError } = await supabase.storage
    .from(bucket)
    .remove(deletable.map((item) => item.storage_path));
  if (removeError) throw removeError;

  for (const item of deletable) {
    const { error } = await supabase
      .from("processed_dashboard_files")
      .update({
        raw_file_deleted: true,
        metadata: {
          ...(processedFiles.find((file) => file.id === item.id)?.metadata || {}),
          raw_file_deleted: true,
          raw_file_deleted_at: new Date().toISOString(),
        },
      })
      .eq("id", item.id);
    if (error) throw error;
  }
}

console.log(JSON.stringify({
  applied: applyCleanup,
  candidates,
  deleted: applyCleanup ? deletable : [],
  generatedAt: new Date().toISOString(),
}, null, 2));
