import { CANONICAL_MODULES, LEGACY_MODULE_KEY_MAP, createSql, printSection, writeAuditReport } from "./audit-utils.mjs";

const sql = createSql();
const canonicalKeys = CANONICAL_MODULES.map((moduleConfig) => moduleConfig.moduleKey);
const legacyKeys = Object.keys(LEGACY_MODULE_KEY_MAP);

try {
  const report = {
    generatedAt: new Date().toISOString(),
    canonicalKeys,
    recordTables: [],
    dashboardFiles: [],
    processedDashboardFiles: [],
    metadataLegacyKeys: [],
  };

  for (const moduleConfig of CANONICAL_MODULES) {
    const { tableName, moduleKey } = moduleConfig;
    const rows = await sql.unsafe(`
      select
        '${tableName}' as table_name,
        module_key,
        count(*)::bigint as rows,
        coalesce(sum(case when module_key = '${moduleKey}' then 0 else 1 end), 0)::bigint as wrong_module_rows
      from public.${tableName}
      group by module_key
      order by module_key
    `);
    report.recordTables.push(...rows);
  }

  report.dashboardFiles = await sql.unsafe(`
    select
      file_type,
      coalesce(metadata->>'module_key', '') as metadata_module_key,
      coalesce(metadata->>'dashboard_module_key', '') as metadata_dashboard_module_key,
      count(*)::bigint as files,
      coalesce(sum(case when storage_path like 'processed-only/%' then 0 else 1 end), 0)::bigint as non_processed_only_paths
    from public.dashboard_files
    group by file_type, metadata->>'module_key', metadata->>'dashboard_module_key'
    order by file_type, metadata_module_key
  `);

  report.processedDashboardFiles = await sql.unsafe(`
    select module_key, status, count(*)::bigint as files, coalesce(sum(row_count), 0)::bigint as rows
    from public.processed_dashboard_files
    group by module_key, status
    order by module_key, status
  `);

  report.metadataLegacyKeys = await sql.unsafe(`
    select 'processed_dashboard_files' as table_name, module_key as legacy_key, count(*)::bigint as rows
    from public.processed_dashboard_files
    where module_key in (${legacyKeys.map((key) => `'${key}'`).join(",")})
    group by module_key
    union all
    select 'dashboard_files.metadata.module_key', metadata->>'module_key', count(*)::bigint
    from public.dashboard_files
    where metadata->>'module_key' in (${legacyKeys.map((key) => `'${key}'`).join(",")})
    group by metadata->>'module_key'
    union all
    select 'dashboard_files.metadata.dashboard_module_key', metadata->>'dashboard_module_key', count(*)::bigint
    from public.dashboard_files
    where metadata->>'dashboard_module_key' in (${legacyKeys.map((key) => `'${key}'`).join(",")})
    group by metadata->>'dashboard_module_key'
  `);

  report.storagePathMismatches = await sql.unsafe(`
    select id, file_name, file_type, storage_path
    from public.dashboard_files
    where (file_type = 'PRE_FATURA' and storage_path not like 'processed-only/pre-fatura/%')
       or (file_type = 'GESTAO_PACOTES' and storage_path not like 'processed-only/gestao-pacotes/%')
       or (file_type = 'DESVIOS_PNR' and storage_path not like 'processed-only/gestao-desvios/pnrs/%')
       or (file_type = 'PACOTES_FALTANTES' and storage_path not like 'processed-only/gestao-desvios/pacotes-faltantes/%')
    order by file_type, file_name
  `);

  const reportPath = await writeAuditReport("module-isolation", report);

  printSection("Module isolation");
  console.log("Canonical keys:", canonicalKeys.join(", "));
  console.table(report.recordTables.map((row) => ({
    table: row.table_name,
    module_key: row.module_key,
    rows: row.rows,
    wrong: row.wrong_module_rows,
  })));
  console.log(`Legacy key rows: ${report.metadataLegacyKeys.length}`);
  console.log(`Storage path mismatches: ${report.storagePathMismatches.length}`);
  console.log(`Relatorio: ${reportPath}`);

  const hasIssue = report.recordTables.some((row) => Number(row.wrong_module_rows || 0) > 0) ||
    report.metadataLegacyKeys.length > 0 ||
    report.storagePathMismatches.length > 0;
  if (hasIssue) process.exitCode = 2;
} finally {
  await sql.end();
}
