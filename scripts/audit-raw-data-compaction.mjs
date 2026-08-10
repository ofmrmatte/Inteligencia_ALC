import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { bytesToHuman, createSql, printSection, writeAuditReport } from "./audit-utils.mjs";

const ROOT = process.cwd();
const sql = createSql();

async function listFiles(dir) {
  const entries = await readdir(path.join(ROOT, dir), { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(relative));
    else if (entry.isFile() && /\.(ts|tsx|mjs)$/.test(entry.name)) output.push(relative.replace(/\\/g, "/"));
  }
  return output;
}

async function relationStats(tableName) {
  const [row] = await sql`
    select
      ${tableName}::text as table_name,
      count(*)::bigint as rows,
      count(*) filter (where raw_data <> '{}'::jsonb)::bigint as rows_with_raw_data,
      coalesce(sum(pg_column_size(raw_data)), 0)::bigint as raw_data_bytes,
      coalesce(sum(greatest(pg_column_size(raw_data) - pg_column_size('{}'::jsonb), 0)), 0)::bigint as estimated_recoverable_bytes,
      round(avg(pg_column_size(raw_data))::numeric, 1) as avg_raw_data_bytes,
      max(pg_column_size(raw_data))::bigint as max_raw_data_bytes
    from ${sql(tableName)}
  `;
  const sample = await sql`
    select id, file_id, pg_column_size(raw_data)::bigint as raw_data_bytes, jsonb_object_keys(raw_data) as key
    from ${sql(tableName)}
    where raw_data <> '{}'::jsonb
    limit 40
  `;
  return {
    ...row,
    raw_data_size: bytesToHuman(row.raw_data_bytes),
    estimated_recoverable_size: bytesToHuman(row.estimated_recoverable_bytes),
    sample_keys: [...new Set(sample.map((item) => item.key).filter(Boolean))].sort(),
  };
}

try {
  const scannedFiles = [];
  for (const dir of ["app", "features", "lib", "scripts"]) {
    for (const file of await listFiles(dir)) {
      if (file.startsWith("scripts/audit-raw-data-compaction")) continue;
      scannedFiles.push({ file, content: await readFile(path.join(ROOT, file), "utf8") });
    }
  }
  const rawDataReaders = scannedFiles
    .filter((item) => /raw_data/.test(item.content))
    .map((item) => item.file);
  const usageSignals = {
    runtime_reads_raw_data: rawDataReaders.some((file) => file.startsWith("app/") || file.startsWith("features/") || file.startsWith("lib/")),
    export_reads_raw_data: rawDataReaders.some((file) => file.startsWith("app/api/exports/") || file.startsWith("lib/export/")),
    import_persists_raw_data: rawDataReaders.some((file) => file.includes("/validate/route.ts")),
    raw_data_readers: rawDataReaders,
  };
  const tables = [
    await relationStats("pre_fatura_records"),
    await relationStats("gestao_pacotes_records"),
  ];
  const totalRecoverable = tables.reduce((sum, table) => sum + Number(table.estimated_recoverable_bytes || 0), 0);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "audit-only",
    actionTaken: "Nenhuma compactacao foi aplicada.",
    recommendation: usageSignals.runtime_reads_raw_data
      ? "Manter raw_data ate teste funcional provar que importacao, relatórios e telas nao dependem do campo."
      : "Pode compactar em janela controlada apos teste funcional completo.",
    totalEstimatedRecoverableBytes: totalRecoverable,
    totalEstimatedRecoverableSize: bytesToHuman(totalRecoverable),
    usageSignals,
    tables,
  };
  const reportPath = await writeAuditReport("raw-data-compaction", report);

  printSection("Raw data compaction audit");
  console.table(tables.map((table) => ({
    table_name: table.table_name,
    rows: table.rows,
    rows_with_raw_data: table.rows_with_raw_data,
    raw_data_size: table.raw_data_size,
    estimated_recoverable_size: table.estimated_recoverable_size,
  })));
  console.log(`Recuperavel estimado: ${bytesToHuman(totalRecoverable)}`);
  console.log(`Ação aplicada: nenhuma`);
  console.log(`Relatorio: ${reportPath}`);
} catch (error) {
  console.error("[Raw Data] Falha:", error);
  process.exit(1);
} finally {
  await sql.end();
}
