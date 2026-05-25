import { CANONICAL_MODULES, createSql, getArgs, printSection, writeAuditReport } from "./audit-utils.mjs";

const args = getArgs();
const apply = args.has("--apply");
const sql = createSql();

function duplicateCleanupSql(tableName, manualOrder = "created_at desc, id desc") {
  return `
    with ranked as (
      select
        id,
        row_number() over (
          partition by module_key, dedupe_key
          order by ${manualOrder}
        ) as rn
      from public.${tableName}
      where nullif(dedupe_key, '') is not null
    )
    delete from public.${tableName} target
    using ranked
    where target.id = ranked.id
      and ranked.rn > 1
    returning target.id
  `;
}

function manualPreservationOrder(tableName) {
  if (tableName === "desvios_pnr_records") {
    return "manual_status_override desc nulls last, status_updated_at desc nulls last, last_seen_at desc nulls last, created_at desc, id desc";
  }
  if (tableName === "gestao_desvios_pacotes_faltantes") {
    return "status_updated_at desc nulls last, contato_updated_at desc nulls last, updated_at desc nulls last, imported_at desc nulls last, id desc";
  }
  return "created_at desc, id desc";
}

async function tableReport(moduleConfig) {
  const { tableName, moduleKey, fileIdColumn } = moduleConfig;
  const summary = await sql.unsafe(`
    select
      '${tableName}' as table_name,
      '${moduleKey}' as expected_module_key,
      count(*)::bigint as total_rows,
      count(dedupe_key)::bigint as dedupe_rows,
      count(distinct dedupe_key)::bigint as distinct_dedupe_keys,
      coalesce(sum(case when nullif(dedupe_key, '') is null then 1 else 0 end), 0)::bigint as missing_dedupe_keys,
      coalesce(sum(case when module_key is distinct from '${moduleKey}' then 1 else 0 end), 0)::bigint as wrong_module_rows,
      (
        select count(*)::bigint
        from (
          select module_key, dedupe_key
          from public.${tableName}
          where nullif(dedupe_key, '') is not null
          group by module_key, dedupe_key
          having count(*) > 1
        ) duplicated
      ) as duplicate_dedupe_keys
    from public.${tableName}
  `);

  const duplicateSamples = await sql.unsafe(`
    select module_key, dedupe_key, count(*)::bigint as rows, count(distinct ${fileIdColumn})::bigint as file_refs
    from public.${tableName}
    where nullif(dedupe_key, '') is not null
    group by module_key, dedupe_key
    having count(*) > 1
    order by rows desc, dedupe_key
    limit 20
  `);

  const idEnvioDuplicates = await sql.unsafe(`
    select module_key, id_envio, count(*)::bigint as rows, count(distinct dedupe_key)::bigint as dedupe_keys
    from public.${tableName}
    where nullif(id_envio, '') is not null
    group by module_key, id_envio
    having count(*) > 1
    order by rows desc, id_envio
    limit 20
  `);

  const fileDistribution = await sql.unsafe(`
    select coalesce(${fileIdColumn}::text, 'sem_file_id') as file_ref, count(*)::bigint as rows
    from public.${tableName}
    group by ${fileIdColumn}
    order by rows desc
    limit 20
  `);

  const indexes = await sql.unsafe(`
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename = '${tableName}'
      and indexdef ilike '%dedupe%'
    order by indexname
  `);

  return {
    ...summary[0],
    duplicateSamples,
    idEnvioDuplicates,
    fileDistribution,
    indexes,
    hasModuleDedupeUniqueIndex: indexes.some((index) =>
      /unique index/i.test(index.indexdef) &&
      /module_key/i.test(index.indexdef) &&
      /dedupe_key/i.test(index.indexdef)
    ),
  };
}

try {
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    mode: apply ? "apply" : "dry-run",
    tables: [],
    cleanup: [],
  };

  for (const moduleConfig of CANONICAL_MODULES) {
    const before = await tableReport(moduleConfig);
    report.tables.push(before);
    if (apply && Number(before.duplicate_dedupe_keys || 0) > 0) {
      const removed = await sql.unsafe(duplicateCleanupSql(moduleConfig.tableName, manualPreservationOrder(moduleConfig.tableName)));
      report.cleanup.push({
        tableName: moduleConfig.tableName,
        removedRows: removed.length,
      });
    }
  }

  const reportPath = await writeAuditReport("dedupe-integrity", report);

  printSection("Dedupe integrity");
  for (const table of report.tables) {
    console.log(`${table.table_name}: rows=${table.total_rows}, dedupe=${table.dedupe_rows}, duplicate_keys=${table.duplicate_dedupe_keys}, missing=${table.missing_dedupe_keys}, module_unique_index=${table.hasModuleDedupeUniqueIndex}`);
  }
  if (report.cleanup.length) console.log("Cleanup:", JSON.stringify(report.cleanup, null, 2));
  console.log(`Relatorio: ${reportPath}`);

  const hasCriticalIssue = report.tables.some((table) =>
    Number(table.duplicate_dedupe_keys || 0) > 0 ||
    Number(table.missing_dedupe_keys || 0) > 0 ||
    Number(table.wrong_module_rows || 0) > 0 ||
    !table.hasModuleDedupeUniqueIndex
  );
  if (hasCriticalIssue && !apply) process.exitCode = 2;
} finally {
  await sql.end();
}
