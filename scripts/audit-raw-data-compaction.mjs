import { readFile } from "node:fs/promises";
import { bytesToHuman, createSql, printSection, writeAuditReport } from "./audit-utils.mjs";

const sql = createSql();

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
  const app = await readFile("app.js", "utf8");
  const usageSignals = {
    pre_fatura_mapper_uses_raw_data: /function mapProcessedPreFaturaRecord[\s\S]+?const raw = record\.raw_data/.test(app),
    gestao_pacotes_mapper_uses_raw_data: /function mapProcessedPackageRecord[\s\S]+?const raw = record\.raw_data/.test(app),
    excel_or_report_direct_raw_data_reads: /download|report|Relat[óo]rio/.test(app) && /raw_data/.test(app),
  };
  const tables = [
    await relationStats("pre_fatura_records"),
    await relationStats("gestao_pacotes_records"),
  ];
  const totalRecoverable = tables.reduce((sum, table) => sum + Number(table.estimated_recoverable_bytes || 0), 0);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "audit-only",
    actionTaken: "Nenhuma compactação foi aplicada.",
    recommendation: usageSignals.pre_fatura_mapper_uses_raw_data || usageSignals.gestao_pacotes_mapper_uses_raw_data
      ? "Manter raw_data até a validação funcional provar que os mapeadores, relatórios e downloads não dependem dele."
      : "Pode compactar em janela controlada após teste funcional completo.",
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
  console.log(`Recuperável estimado: ${bytesToHuman(totalRecoverable)}`);
  console.log(`Ação aplicada: nenhuma`);
  console.log(`Relatorio: ${reportPath}`);
} catch (error) {
  console.error("[Raw Data] Falha:", error);
  process.exit(1);
} finally {
  await sql.end();
}
