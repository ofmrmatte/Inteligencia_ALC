import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = !apply || args.has("--dry-run");
const generatedAt = new Date().toISOString();
const bucket = process.env.DASHBOARD_BUCKET || "dashboard-files";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || (!serviceKey && !anonKey)) {
  console.error("[Dashboard Reset] Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey || anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const TABLES_TO_CLEAR = [
  { table: "desvios_pnr_metrics_summary", category: "aggregate", reason: "agregado derivado de PNR" },
  { table: "dashboard_metrics_cache", category: "aggregate", reason: "cache/agregado derivado do painel" },
  { table: "desvios_pnr_records", category: "records", reason: "registros importados de Gestão de Desvios / PNRs" },
  { table: "pre_fatura_records", category: "records", reason: "registros importados de Pré-Fatura" },
  { table: "gestao_pacotes_records", category: "records", reason: "registros importados de Gestão de Pacotes" },
  { table: "registros_pnr_distribuidos", category: "legacy-records", reason: "tabela legado/importada de PNR distribuído, se existir" },
  { table: "processed_dashboard_files", category: "file-control", reason: "controle de arquivos processados e hashes antigos" },
  { table: "dashboard_files", category: "file-control", reason: "metadados de uploads/Storage antigos" },
];

const PRESERVED_STRUCTURE = [
  "tabelas",
  "RPCs/funções",
  "índices",
  "constraints",
  "policies/RLS",
  "grants",
  "migrações",
  "código de upload",
  "normalizadores XLSX/CSV",
  "layout do painel",
];

const report = {
  mode: dryRun ? "dry-run" : "apply",
  generatedAt,
  bucket,
  preservedStructure: PRESERVED_STRUCTURE,
  tablesPlanned: TABLES_TO_CLEAR,
  tables: [],
  storage: {
    objects: [],
    deleteResults: [],
  },
  localCacheReset: {
    note: "Caches do navegador são invalidados pelo dashboardCacheService.js no próximo carregamento do painel.",
    version: "dashboard-reset-2026-05-19-v1",
    keys: [
      "alc-dashboard-module-cache-v1",
      "alc-pnr-dashboard-light-cache-v1",
      "alc-pre-fatura-dashboard-state-v1",
      "alc-pre-fatura-dashboard-library-v1",
      "evolutionPeriodView",
      "comparisonPeriodView",
    ],
  },
  actions: [],
  skipped: [],
  errors: [],
};

function log(message, details) {
  if (details === undefined) {
    console.log(`[Dashboard Reset] ${message}`);
    return;
  }
  console.log(`[Dashboard Reset] ${message}`, details);
}

async function tableExists(table) {
  const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (!error) return true;
  if (error.code === "42P01" || /does not exist|Could not find/i.test(error.message || "")) return false;
  report.errors.push({ scope: table, action: "exists", error: error.message });
  return false;
}

async function countTable(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return { count: null, error: error.message };
  return { count: Number(count || 0) };
}

async function sampleColumns(table) {
  const { data, error } = await supabase.from(table).select("*").limit(1);
  if (error) return { columns: [], sampleError: error.message };
  const row = Array.isArray(data) && data.length ? data[0] : null;
  return { columns: row ? Object.keys(row) : [] };
}

async function deleteAllRows(table, columns) {
  if (!columns.includes("id")) {
    return { table, action: "skipped", reason: "sem coluna id para delete seguro via Data API" };
  }
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .not("id", "is", null);
  if (error) return { table, action: "error", error: error.message };
  return { table, action: "deleted", rows: Number(count || 0) };
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
      report.errors.push({ scope: "storage", action: "list", prefix, error: error.message });
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

async function removeStorageObjects(objects) {
  const paths = objects.map((object) => object.path).filter(Boolean);
  const results = [];
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      results.push({ paths: chunk, action: "error", error: error.message });
    } else {
      results.push({ paths: chunk, action: "deleted", count: chunk.length });
    }
  }
  return results;
}

async function collectOptionalRelationSizes() {
  const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    report.skipped.push({ scope: "relationSizes", reason: "SUPABASE_DB_URL/DATABASE_URL não configurado" });
    return;
  }
  try {
    const postgres = (await import("postgres")).default;
    const sql = postgres(databaseUrl, { max: 1, ssl: "require" });
    try {
      const names = TABLES_TO_CLEAR.map((item) => item.table);
      const rows = await sql`
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
          and c.relname = any(${names})
        order by pg_total_relation_size(c.oid) desc
      `;
      for (const row of rows) {
        const target = report.tables.find((item) => item.table === row.table_name);
        if (target) target.size = row;
      }
    } finally {
      await sql.end();
    }
  } catch (error) {
    report.skipped.push({ scope: "relationSizes", reason: error.message });
  }
}

async function runAnalyzeAndVacuum() {
  const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    report.skipped.push({ scope: "maintenance", reason: "ANALYZE/VACUUM exige SUPABASE_DB_URL/DATABASE_URL; não executado" });
    return;
  }
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1, ssl: "require" });
  try {
    for (const item of report.tables.filter((table) => table.exists)) {
      await sql.unsafe(`analyze public.${item.table}`);
      report.actions.push({ table: item.table, action: "analyze" });
      if (Number(item.beforeCount || 0) > 10000) {
        await sql.unsafe(`vacuum full analyze public.${item.table}`);
        report.actions.push({ table: item.table, action: "vacuum full analyze" });
      }
    }
  } finally {
    await sql.end();
  }
}

async function main() {
  log(`Iniciando reset em modo ${dryRun ? "dry-run" : "apply"}.`);

  for (const target of TABLES_TO_CLEAR) {
    const exists = await tableExists(target.table);
    if (!exists) {
      report.tables.push({ ...target, exists: false, beforeCount: 0, afterCount: 0, columns: [] });
      continue;
    }

    const before = await countTable(target.table);
    const sample = await sampleColumns(target.table);
    const entry = {
      ...target,
      exists: true,
      beforeCount: before.count,
      beforeError: before.error,
      columns: sample.columns,
      sampleError: sample.sampleError,
      afterCount: null,
      resetAction: dryRun ? "would-delete-rows" : "pending",
    };
    report.tables.push(entry);
  }

  report.storage.objects = await listStorageRecursive("");
  await collectOptionalRelationSizes();

  if (apply) {
    for (const entry of report.tables.filter((table) => table.exists)) {
      const result = await deleteAllRows(entry.table, entry.columns);
      entry.resetAction = result.action;
      entry.resetResult = result;
      if (result.action === "error") report.errors.push({ scope: entry.table, action: "delete", error: result.error });
      else report.actions.push(result);
    }

    if (report.storage.objects.length) {
      report.storage.deleteResults = await removeStorageObjects(report.storage.objects);
      report.actions.push(...report.storage.deleteResults.map((result) => ({ scope: "storage", ...result })));
    }

    for (const entry of report.tables.filter((table) => table.exists)) {
      const after = await countTable(entry.table);
      entry.afterCount = after.count;
      entry.afterError = after.error;
    }

    report.storage.afterObjects = await listStorageRecursive("");
    await runAnalyzeAndVacuum();
  }

  const reportDir = path.resolve("scripts", "logs");
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `dashboard-reset-${dryRun ? "dry-run" : "apply"}-${generatedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  log(`Relatório ${dryRun ? "dry-run" : "apply"} gerado.`);
  log(`Arquivo: ${reportPath}`);
  log("Resumo", {
    mode: report.mode,
    tables: report.tables.map((table) => ({
      table: table.table,
      exists: table.exists,
      beforeCount: table.beforeCount,
      afterCount: table.afterCount,
      action: table.resetAction,
    })),
    storageObjects: report.storage.objects.length,
    storageAfterObjects: report.storage.afterObjects?.length,
    errors: report.errors.length,
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("[Dashboard Reset] Falha no reset:", error);
  process.exit(1);
});
