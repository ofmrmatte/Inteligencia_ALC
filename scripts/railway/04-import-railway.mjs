#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import {
  EXPORT_TABLES,
  assertRailwayWriteTarget,
  closeSql,
  countRows,
  createSql,
  duplicateDedupeCount,
  formatCount,
  loadRailwayEnv,
  manifestPath,
  parseArgs,
  printCheck,
  printHelp,
  printWarn,
  qualifyName,
  readJsonFile,
  requireEnv,
  resolveExportsDir,
  scriptHeader,
  tableColumns,
  tableExists,
} from './lib/railway-utils.mjs';

const args = parseArgs();

if (args.has('help')) {
  printHelp('04-import-railway.mjs', [
    'Importa dados exportados para o Postgres Railway staging.',
    'Por seguranca, o padrao e dry-run. Use --apply para executar.',
    'Opcoes especificas:',
    '  --apply                       Executa importacao no Railway',
    '  --batch-size=<n>              Tamanho do lote de importacao. Padrao: 1000',
    '  --exports-dir=<dir>           Diretorio com migration_manifest.json',
    '  --truncate-railway            Limpa tabelas importaveis no Railway antes de importar',
  ]);
  process.exit(0);
}

const envInfo = loadRailwayEnv(args);
const apply = args.has('apply') && !args.has('dry-run');
const batchSize = args.int('batch-size', 1000);
const exportsDir = resolveExportsDir(args);
const manifestFile = manifestPath(exportsDir);
const truncateRailway = args.has('truncate-railway');
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase', 'migrations');
const POST_IMPORT_MIGRATIONS = [
  '20260522_finalize_processed_only_before_railway.sql',
  '20260525130000_audit_processed_only_hardening.sql',
  '20260525143000_document_row_count_reconciliation.sql',
];

scriptHeader('Railway import', [
  `Modo: ${apply ? 'APPLY' : 'DRY-RUN'}`,
  `Env file: ${envInfo.loaded ? envInfo.envFile : '(nao encontrado; usando ambiente atual)'}`,
  `Exports dir: ${exportsDir}`,
  `Truncate Railway: ${truncateRailway ? 'sim, somente staging validado' : 'nao'}`,
  'Producao: nenhuma escrita no Supabase; Vercel nao e alterada.',
]);

function getConfigByKey(key) {
  return EXPORT_TABLES.find((config) => config.key === key);
}

async function* readBatches(filePath, size) {
  const stream = fs.createReadStream(filePath, {
    encoding: 'utf8',
  });
  const lines = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let batch = [];
  for await (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    batch.push(JSON.parse(line));
    if (batch.length >= size) {
      yield batch;
      batch = [];
    }
  }

  if (batch.length > 0) {
    yield batch;
  }
}

async function truncateImportTables(sql, manifest) {
  const names = [];
  for (const table of manifest.tables) {
    const config = getConfigByKey(table.key);
    if (!config || !table.file) {
      continue;
    }

    if (await tableExists(sql, config.schema, config.table)) {
      names.push(qualifyName(config.schema, config.table));
    }
  }

  if (names.length === 0) {
    return;
  }

  await sql.unsafe(`truncate table ${names.join(', ')} restart identity cascade`);
  printCheck('Truncate Railway staging', true, `${names.length} tabela(s)`);
}

async function upsertBatch(sql, config, rows) {
  if (rows.length === 0) {
    return;
  }

  const columns = await tableColumns(sql, config.schema, config.table);
  const existingColumns = new Set(columns.map((column) => column.name));
  const rowColumns = Object.keys(rows[0]).filter((column) => existingColumns.has(column));
  const primaryKey = config.primaryKey;

  if (!rowColumns.includes(primaryKey)) {
    throw new Error(`Coluna primaria ${primaryKey} ausente em lote de ${config.fullName}`);
  }

  const qualified = qualifyName(config.schema, config.table);
  const columnList = rowColumns.map((column) => `"${column.replace(/"/g, '""')}"`).join(', ');
  const updates = rowColumns
    .filter((column) => column !== primaryKey)
    .map((column) => `"${column.replace(/"/g, '""')}" = excluded."${column.replace(/"/g, '""')}"`)
    .join(', ');

  const conflictClause = updates
    ? `on conflict ("${primaryKey.replace(/"/g, '""')}") do update set ${updates}`
    : `on conflict ("${primaryKey.replace(/"/g, '""')}") do nothing`;

  await sql.unsafe(
    `
      insert into ${qualified} (${columnList})
      select ${columnList}
      from jsonb_populate_recordset(null::${qualified}, $1::jsonb)
      ${conflictClause}
    `,
    [sql.json(rows)],
  );
}

async function importTable(sql, manifestTable) {
  const config = getConfigByKey(manifestTable.key);
  if (!config) {
    printWarn(manifestTable.table, 'sem configuracao de importacao; ignorada');
    return {
      imported: 0,
      skipped: true,
    };
  }

  if (!manifestTable.file) {
    printWarn(config.fullName, manifestTable.note || 'sem arquivo exportado; ignorada');
    return {
      imported: 0,
      skipped: true,
    };
  }

  if (!(await tableExists(sql, config.schema, config.table))) {
    throw new Error(`Tabela ausente no Railway: ${config.fullName}. Rode railway:schema primeiro.`);
  }

  const filePath = path.join(exportsDir, manifestTable.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de exportacao ausente: ${filePath}`);
  }

  let imported = 0;
  for await (const batch of readBatches(filePath, batchSize)) {
    await sql.begin(async (transaction) => {
      await upsertBatch(transaction, config, batch);
    });
    imported += batch.length;
    printCheck(config.fullName, true, `${formatCount(imported)}/${formatCount(manifestTable.rows)} linha(s)`);
  }

  await sql.unsafe(`analyze ${qualifyName(config.schema, config.table)}`);
  const total = await countRows(sql, config.schema, config.table);
  printCheck(`Contagem Railway ${config.fullName}`, total >= manifestTable.rows, `${formatCount(total)} linha(s)`);

  return {
    imported,
    skipped: false,
  };
}

async function validatePostImport(sql) {
  let failures = 0;

  for (const config of EXPORT_TABLES.filter((table) => table.table.endsWith('_records') || table.table.includes('pacotes_faltantes'))) {
    if (!(await tableExists(sql, config.schema, config.table))) {
      continue;
    }

    const duplicatedKeys = await duplicateDedupeCount(sql, config.schema, config.table);
    const ok = duplicatedKeys === 0;
    printCheck(`Dedupe ${config.fullName}`, ok, `${duplicatedKeys} chave(s) duplicada(s)`);
    if (!ok) {
      failures += 1;
    }
  }

  return failures;
}

async function refreshDerivedData(sql) {
  const functions = await sql`
    select count(*)::int as total
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'refresh_desvios_pnr_metrics_summary'
  `;

  if (Number(functions[0]?.total ?? 0) === 0) {
    printWarn('Metricas derivadas de PNR', 'RPC refresh_desvios_pnr_metrics_summary ausente; nada recalculado');
    return;
  }

  const before = await sql`
    select count(*)::int as total,
           coalesce(sum(row_count), 0)::int as rows
    from public.desvios_pnr_metrics_summary
  `;
  const refreshed = await sql`select public.refresh_desvios_pnr_metrics_summary() as affected`;
  const after = await sql`
    select count(*)::int as total,
           coalesce(sum(row_count), 0)::int as rows
    from public.desvios_pnr_metrics_summary
  `;
  await sql`analyze public.desvios_pnr_metrics_summary`;

  printCheck(
    'Metricas derivadas de PNR recalculadas',
    true,
    `antes=${before[0].total}/${before[0].rows} depois=${after[0].total}/${after[0].rows} affected=${refreshed[0].affected}`,
  );
}

async function runPostImportHardening(sql) {
  for (const fileName of POST_IMPORT_MIGRATIONS) {
    const fullPath = path.join(MIGRATIONS_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      printWarn('Hardening pos-import', `migration ausente: ${fileName}`);
      continue;
    }

    const migrationSql = fs.readFileSync(fullPath, 'utf8');
    await sql.unsafe(migrationSql);
    printCheck('Hardening pos-import aplicado', true, fileName);
  }
}

let sql;

try {
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`Manifesto nao encontrado: ${manifestFile}. Rode railway:export primeiro.`);
  }

  const manifest = readJsonFile(manifestFile);
  const manifestTables = manifest.tables || [];
  const plannedRows = manifestTables.reduce((sum, table) => sum + Number(table.rows || 0), 0);

  console.log(`Manifesto: ${manifestFile}`);
  console.log(`Exportado em: ${manifest.exportedAt || '(sem data)'}`);
  console.log(`Linhas planejadas: ${formatCount(plannedRows)}`);

  if (!apply) {
    printWarn('Dry-run ativo', 'use --apply para importar no Railway staging');
    const railwayUrl = process.env.RAILWAY_DATABASE_URL;
    if (railwayUrl) {
      const target = assertRailwayWriteTarget(railwayUrl, args);
      console.log(`Alvo validado: ${target.host}/${target.database}`);
    } else {
      printWarn('RAILWAY_DATABASE_URL ausente', 'dry-run validou somente manifesto local');
    }
    process.exit(0);
  }

  const railwayUrl = requireEnv('RAILWAY_DATABASE_URL');
  const target = assertRailwayWriteTarget(railwayUrl, args);
  console.log(`Alvo Railway: ${target.host}/${target.database}`);

  sql = createSql(railwayUrl, {
    max: 1,
  });

  if (truncateRailway) {
    await truncateImportTables(sql, manifest);
  }

  let importedRows = 0;
  for (const table of manifestTables) {
    const result = await importTable(sql, table);
    importedRows += result.imported;
  }

  await runPostImportHardening(sql);
  await refreshDerivedData(sql);
  const failures = await validatePostImport(sql);
  console.log(`Linhas importadas: ${formatCount(importedRows)}`);

  if (failures > 0) {
    process.exitCode = 1;
    printCheck('Resultado final', false, `${failures} validacao(oes) falharam`);
  } else {
    printCheck('Resultado final', true, 'Dados importados no Railway staging');
  }
} catch (error) {
  process.exitCode = 1;
  printCheck('Import Railway', false, error.message);
} finally {
  await closeSql(sql);
}
