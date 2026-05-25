#!/usr/bin/env node
import {
  CANONICAL_MODULES,
  EXPORT_TABLES,
  LEGACY_MODULE_KEYS,
  REQUIRED_TABLES,
  assertRailwayWriteTarget,
  assertSupabaseReadOnlyTarget,
  closeSql,
  countRows,
  createSql,
  databaseSize,
  duplicateDedupeCount,
  hasUniqueDedupeIndex,
  legacyModuleKeyCount,
  loadRailwayEnv,
  parseArgs,
  printCheck,
  printHelp,
  qualifyName,
  requireEnv,
  scriptHeader,
  statusCounts,
  tableColumns,
  tableExists,
  tableSize,
} from './lib/railway-utils.mjs';

const args = parseArgs();

if (args.has('help')) {
  printHelp('05-compare-supabase-railway.mjs', [
    'Compara Supabase producao contra Railway staging, somente leitura em ambos.',
    'O script falha se totais, dedupe, module_key, mistura ou indices obrigatorios divergirem.',
  ]);
  process.exit(0);
}

const envInfo = loadRailwayEnv(args);

scriptHeader('Supabase x Railway compare', [
  `Env file: ${envInfo.loaded ? envInfo.envFile : '(nao encontrado; usando ambiente atual)'}`,
  'Modo: somente leitura comparativa; nao altera Supabase, Railway ou Vercel.',
]);

function stableJson(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((entry) => stableJson(entry)).sort());
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(
      Object.keys(value)
        .sort()
        .reduce((acc, key) => {
          acc[key] = value[key];
          return acc;
        }, {}),
    );
  }
  return JSON.stringify(value);
}

function normalizeRows(rows, keyColumn = 'value') {
  return rows
    .map((row) => ({
      key: String(row[keyColumn] ?? ''),
      total: Number(row.total ?? 0),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function rowsEqual(left, right) {
  return stableJson(left) === stableJson(right);
}

async function groupByColumn(sql, config, column) {
  const columns = await tableColumns(sql, config.schema, config.table);
  if (!columns.some((entry) => entry.name === column)) {
    return null;
  }

  const qualified = qualifyName(config.schema, config.table);
  return sql.unsafe(`
    select ${column}::text as value, count(*)::bigint as total
    from ${qualified}
    group by ${column}
    order by ${column}
  `);
}

async function groupByCompetencia(sql, config) {
  const columns = await tableColumns(sql, config.schema, config.table);
  const qualified = qualifyName(config.schema, config.table);

  if (columns.some((entry) => entry.name === 'competencia')) {
    return sql.unsafe(`
      select competencia::text as value, count(*)::bigint as total
      from ${qualified}
      group by competencia
      order by competencia
    `);
  }

  if (config.table === 'dashboard_files' && columns.some((entry) => entry.name === 'metadata')) {
    return sql.unsafe(`
      select coalesce(metadata->>'competencia', '') as value, count(*)::bigint as total
      from ${qualified}
      group by coalesce(metadata->>'competencia', '')
      order by value
    `);
  }

  return null;
}

async function statusSummary(sql, config) {
  const counts = await statusCounts(sql, config.schema, config.table);
  return Object.fromEntries(
    Object.entries(counts).map(([column, rows]) => [column, normalizeRows(rows)]),
  );
}

async function dashboardMetadataLegacyCount(sql) {
  if (!(await tableExists(sql, 'public', 'dashboard_files'))) {
    return 0;
  }

  const rows = await sql.unsafe(
    `
      select count(*)::bigint as total
      from public.dashboard_files
      where metadata->>'module_key' = any($1::text[])
         or metadata->>'dashboard_module_key' = any($1::text[])
    `,
    [LEGACY_MODULE_KEYS],
  );

  return Number(rows[0]?.total ?? 0);
}

async function dashboardMetadataMixingCount(sql) {
  if (!(await tableExists(sql, 'public', 'dashboard_files'))) {
    return 0;
  }

  const rows = await sql`
    with expected as (
      select id,
             case file_type
               when 'PRE_FATURA' then 'pre_fatura'
               when 'GESTAO_PACOTES' then 'gestao_pacotes'
               when 'DESVIOS_PNR' then 'desvios_pnr'
               when 'PACOTES_FALTANTES' then 'pacotes_faltantes'
               else ''
             end as expected_module,
             metadata
      from public.dashboard_files
    )
    select count(*)::bigint as total
    from expected
    where expected_module <> ''
      and (
        coalesce(metadata->>'module_key', expected_module) <> expected_module
        or coalesce(metadata->>'dashboard_module_key', expected_module) <> expected_module
      )
  `;

  return Number(rows[0]?.total ?? 0);
}

async function moduleMixingCount(sql) {
  let total = 0;

  for (const module of CANONICAL_MODULES) {
    if (!(await tableExists(sql, 'public', module.table))) {
      total += 1;
      continue;
    }

    const columns = await tableColumns(sql, 'public', module.table);
    if (!columns.some((column) => column.name === 'module_key')) {
      total += 1;
      continue;
    }

    const rows = await sql.unsafe(
      `
        select count(*)::bigint as total
        from ${qualifyName('public', module.table)}
        where module_key is distinct from $1
      `,
      [module.moduleKey],
    );
    total += Number(rows[0]?.total ?? 0);
  }

  if (await tableExists(sql, 'public', 'processed_dashboard_files')) {
    const rows = await sql.unsafe(
      `
        select count(*)::bigint as total
        from public.processed_dashboard_files
        where module_key <> all($1::text[])
      `,
      [CANONICAL_MODULES.map((module) => module.moduleKey)],
    );
    total += Number(rows[0]?.total ?? 0);
  }

  total += await dashboardMetadataMixingCount(sql);
  return total;
}

async function compareGroup(sqlLeft, sqlRight, config, label, getter) {
  const [left, right] = await Promise.all([getter(sqlLeft, config), getter(sqlRight, config)]);
  if (left === null && right === null) {
    return true;
  }

  const normalizedLeft = Array.isArray(left) ? normalizeRows(left) : left;
  const normalizedRight = Array.isArray(right) ? normalizeRows(right) : right;
  const ok = rowsEqual(normalizedLeft, normalizedRight);
  printCheck(`${label} ${config.fullName}`, ok);
  return ok;
}

async function compareTable(sqlSupabase, sqlRailway, config) {
  let failures = 0;
  const [supabaseExists, railwayExists] = await Promise.all([
    tableExists(sqlSupabase, config.schema, config.table),
    tableExists(sqlRailway, config.schema, config.table),
  ]);

  if (!supabaseExists && !railwayExists && config.optional) {
    printCheck(`${config.fullName}`, true, 'opcional ausente nos dois bancos');
    return failures;
  }

  if (supabaseExists !== railwayExists) {
    printCheck(`${config.fullName}`, false, `Supabase=${supabaseExists} Railway=${railwayExists}`);
    return failures + 1;
  }

  const [supabaseTotal, railwayTotal] = await Promise.all([
    countRows(sqlSupabase, config.schema, config.table),
    countRows(sqlRailway, config.schema, config.table),
  ]);
  const totalOk = supabaseTotal === railwayTotal;
  printCheck(
    `Total ${config.fullName}`,
    totalOk,
    `Supabase=${supabaseTotal} Railway=${railwayTotal}`,
  );
  if (!totalOk) failures += 1;

  const moduleOk = await compareGroup(sqlSupabase, sqlRailway, config, 'Module_key', (sql, table) =>
    groupByColumn(sql, table, 'module_key'),
  );
  if (!moduleOk) failures += 1;

  const statusOk = await compareGroup(sqlSupabase, sqlRailway, config, 'Status', statusSummary);
  if (!statusOk) failures += 1;

  const competenciaOk = await compareGroup(sqlSupabase, sqlRailway, config, 'Competencia/mes', groupByCompetencia);
  if (!competenciaOk) failures += 1;

  return failures;
}

async function compareSizes(sqlSupabase, sqlRailway) {
  const [supabaseDb, railwayDb] = await Promise.all([databaseSize(sqlSupabase), databaseSize(sqlRailway)]);
  console.log(`Supabase database size: ${supabaseDb.pretty}`);
  console.log(`Railway database size: ${railwayDb.pretty}`);

  for (const table of REQUIRED_TABLES) {
    const [supabaseTable, railwayTable] = await Promise.all([
      tableSize(sqlSupabase, 'public', table),
      tableSize(sqlRailway, 'public', table),
    ]);
    console.log(
      `Tabela ${table}: Supabase=${supabaseTable?.pretty ?? 'ausente'} Railway=${railwayTable?.pretty ?? 'ausente'}`,
    );
  }
}

let supabaseSql;
let railwaySql;

try {
  const supabaseUrl = requireEnv('SUPABASE_DB_URL');
  const railwayUrl = requireEnv('RAILWAY_DATABASE_URL');
  const supabaseTarget = assertSupabaseReadOnlyTarget(supabaseUrl);
  const railwayTarget = assertRailwayWriteTarget(railwayUrl, args);

  console.log(`Supabase: ${supabaseTarget.host}/${supabaseTarget.database}`);
  console.log(`Railway: ${railwayTarget.host}/${railwayTarget.database}`);

  supabaseSql = createSql(supabaseUrl, {
    max: 2,
  });
  railwaySql = createSql(railwayUrl, {
    max: 2,
  });

  let failures = 0;

  for (const tableName of REQUIRED_TABLES) {
    const exists = await tableExists(railwaySql, 'public', tableName);
    printCheck(`Railway tabela obrigatoria ${tableName}`, exists);
    if (!exists) failures += 1;
  }

  for (const config of EXPORT_TABLES) {
    failures += await compareTable(supabaseSql, railwaySql, config);
  }

  for (const module of CANONICAL_MODULES) {
    const [supabaseDuplicates, railwayDuplicates] = await Promise.all([
      duplicateDedupeCount(supabaseSql, 'public', module.table),
      duplicateDedupeCount(railwaySql, 'public', module.table),
    ]);
    const ok = supabaseDuplicates === 0 && railwayDuplicates === 0;
    printCheck(
      `Dedupe duplicado ${module.table}`,
      ok,
      `Supabase=${supabaseDuplicates} Railway=${railwayDuplicates}`,
    );
    if (!ok) failures += 1;
  }

  for (const table of [
    'pre_fatura_records',
    'gestao_pacotes_records',
    'desvios_pnr_records',
    'gestao_desvios_pacotes_faltantes',
  ]) {
    const ok = await hasUniqueDedupeIndex(railwaySql, table);
    printCheck(`Railway indice unico module_key + dedupe_key ${table}`, ok);
    if (!ok) failures += 1;
  }

  let supabaseLegacy = 0;
  let railwayLegacy = 0;
  for (const config of EXPORT_TABLES.filter((table) => table.schema === 'public')) {
    if (await tableExists(supabaseSql, config.schema, config.table)) {
      supabaseLegacy += await legacyModuleKeyCount(supabaseSql, config.schema, config.table);
    }
    if (await tableExists(railwaySql, config.schema, config.table)) {
      railwayLegacy += await legacyModuleKeyCount(railwaySql, config.schema, config.table);
    }
  }
  supabaseLegacy += await dashboardMetadataLegacyCount(supabaseSql);
  railwayLegacy += await dashboardMetadataLegacyCount(railwaySql);

  const legacyOk = supabaseLegacy === 0 && railwayLegacy === 0;
  printCheck('Module_key legado', legacyOk, `Supabase=${supabaseLegacy} Railway=${railwayLegacy}`);
  if (!legacyOk) failures += 1;

  const [supabaseMixing, railwayMixing] = await Promise.all([
    moduleMixingCount(supabaseSql),
    moduleMixingCount(railwaySql),
  ]);
  const mixingOk = supabaseMixing === 0 && railwayMixing === 0;
  printCheck('Mistura entre modulos', mixingOk, `Supabase=${supabaseMixing} Railway=${railwayMixing}`);
  if (!mixingOk) failures += 1;

  const rowCountOk = await compareGroup(
    supabaseSql,
    railwaySql,
    {
      schema: 'public',
      table: 'processed_dashboard_files',
      fullName: 'public.processed_dashboard_files',
    },
    'Row_count por module_key',
    async (sql) => {
      if (!(await tableExists(sql, 'public', 'processed_dashboard_files'))) {
        return [];
      }
      return sql`
        select module_key as value, coalesce(sum(row_count), 0)::bigint as total
        from public.processed_dashboard_files
        group by module_key
        order by module_key
      `;
    },
  );
  if (!rowCountOk) failures += 1;

  await compareSizes(supabaseSql, railwaySql);

  if (failures > 0) {
    process.exitCode = 1;
    printCheck('Resultado final', false, `${failures} divergencia(s)`);
  } else {
    printCheck('Resultado final', true, 'Railway staging equivalente ao Supabase para criterios de migracao paralela');
  }
} catch (error) {
  process.exitCode = 1;
  printCheck('Compare Supabase x Railway', false, error.message);
} finally {
  await closeSql(supabaseSql);
  await closeSql(railwaySql);
}
