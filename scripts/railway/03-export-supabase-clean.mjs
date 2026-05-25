#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  EXPORT_TABLES,
  appendJsonLines,
  assertSupabaseReadOnlyTarget,
  bytesToHuman,
  closeSql,
  createSql,
  ensureDirectory,
  formatCount,
  loadRailwayEnv,
  manifestPath,
  parseArgs,
  printCheck,
  printHelp,
  printWarn,
  qualifyName,
  requireEnv,
  resolveExportsDir,
  scriptHeader,
  tableColumns,
  tableExists,
  writeJsonFile,
} from './lib/railway-utils.mjs';

const args = parseArgs();

if (args.has('help')) {
  printHelp('03-export-supabase-clean.mjs', [
    'Exporta dados persistidos limpos do Supabase para scripts/railway/exports.',
    'Nao exporta Storage bruto, caches descartaveis ou logs temporarios.',
    'Opcoes especificas:',
    '  --batch-size=<n>              Tamanho do lote de exportacao. Padrao: 5000',
    '  --exports-dir=<dir>           Diretorio local de exportacao',
    '  --drop-raw-data               Omite raw_data em pre_fatura_records e gestao_pacotes_records',
  ]);
  process.exit(0);
}

const envInfo = loadRailwayEnv(args);
const dryRun = args.has('dry-run');
const batchSize = args.int('batch-size', 5000);
const exportsDir = resolveExportsDir(args);
const dropRawData = args.has('drop-raw-data');

scriptHeader('Supabase clean export', [
  `Modo: ${dryRun ? 'DRY-RUN' : 'EXPORT'}`,
  `Env file: ${envInfo.loaded ? envInfo.envFile : '(nao encontrado; usando ambiente atual)'}`,
  `Exports dir: ${exportsDir}`,
  `Raw data: ${dropRawData ? 'omitido por flag --drop-raw-data' : 'preservado'}`,
  'Producao: somente leitura no Supabase; Storage bruto nao e exportado.',
]);

function buildSelectList(config, columns) {
  const existingColumns = new Set(columns.map((column) => column.name));
  let selectedColumns = config.columns
    ? config.columns.filter((column) => existingColumns.has(column))
    : columns.map((column) => column.name);

  if (dropRawData && config.rawDataOptional) {
    selectedColumns = selectedColumns.filter((column) => column !== 'raw_data');
  }

  return selectedColumns;
}

async function countTable(sql, config) {
  const exists = await tableExists(sql, config.schema, config.table);
  if (!exists) {
    if (config.optional) {
      return {
        exists,
        total: 0,
      };
    }
    throw new Error(`Tabela obrigatoria ausente no Supabase: ${config.fullName}`);
  }

  const rows = await sql.unsafe(`select count(*)::bigint as total from ${qualifyName(config.schema, config.table)}`);
  return {
    exists,
    total: Number(rows[0]?.total ?? 0),
  };
}

async function exportTable(sql, config) {
  const count = await countTable(sql, config);
  if (!count.exists) {
    printWarn(`${config.fullName}`, 'tabela opcional ausente; ignorada');
    return {
      table: config.fullName,
      key: config.key,
      exported: false,
      rows: 0,
      checksum: null,
      bytes: 0,
      file: null,
      note: 'optional table not found',
    };
  }

  const columns = await tableColumns(sql, config.schema, config.table);
  const selectedColumns = buildSelectList(config, columns);
  if (selectedColumns.length === 0) {
    throw new Error(`Nenhuma coluna exportavel em ${config.fullName}`);
  }

  const fileName = `${config.key}.jsonl`;
  const filePath = path.join(exportsDir, fileName);
  const qualified = qualifyName(config.schema, config.table);
  const selectList = selectedColumns.map((column) => `"${column.replace(/"/g, '""')}"`).join(', ');
  const orderBy = config.orderBy || config.primaryKey || selectedColumns[0];

  if (dryRun) {
    printCheck(`${config.fullName}`, true, `${formatCount(count.total)} linha(s) seriam exportadas`);
    return {
      table: config.fullName,
      key: config.key,
      exported: false,
      rows: count.total,
      checksum: null,
      bytes: 0,
      file: fileName,
      columns: selectedColumns,
      dryRun: true,
    };
  }

  fs.rmSync(filePath, {
    force: true,
  });

  const hash = crypto.createHash('sha256');
  let exportedRows = 0;
  let bytes = 0;

  for (let offset = 0; offset < count.total; offset += batchSize) {
    const rows = await sql.unsafe(
      `
        select ${selectList}
        from ${qualified}
        order by ${orderBy}
        limit $1 offset $2
      `,
      [batchSize, offset],
    );

    for (const row of rows) {
      hash.update(JSON.stringify(row));
      hash.update('\n');
    }

    bytes += appendJsonLines(filePath, rows);
    exportedRows += rows.length;
    printCheck(
      `${config.fullName}`,
      true,
      `${formatCount(exportedRows)}/${formatCount(count.total)} linha(s)`,
    );
  }

  return {
    table: config.fullName,
    key: config.key,
    exported: true,
    rows: exportedRows,
    checksum: hash.digest('hex'),
    bytes,
    humanBytes: bytesToHuman(bytes),
    file: fileName,
    columns: selectedColumns,
    rawDataPolicy: dropRawData && config.rawDataOptional ? 'omitted_by_flag' : 'preserved',
  };
}

let sql;

try {
  const supabaseUrl = requireEnv('SUPABASE_DB_URL');
  const target = assertSupabaseReadOnlyTarget(supabaseUrl);
  console.log(`Origem Supabase: ${target.host}/${target.database}`);

  if (!dryRun) {
    ensureDirectory(exportsDir);
  }

  sql = createSql(supabaseUrl, {
    max: 1,
  });

  const tables = [];
  for (const config of EXPORT_TABLES) {
    tables.push(await exportTable(sql, config));
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    source: {
      type: 'supabase',
      host: target.host,
      database: target.database,
    },
    destination: {
      expected: 'railway staging postgres',
    },
    batchSize,
    rawDataPolicy: dropRawData
      ? 'raw_data omitted only for tables marked rawDataOptional'
      : 'raw_data preserved for audit/download parity',
    excludes: [
      'storage raw files',
      'dashboard_metrics_cache',
      'audit_logs',
      'temporary logs',
      'local cache artifacts',
    ],
    tables,
  };

  if (!dryRun) {
    writeJsonFile(manifestPath(exportsDir), manifest);
    printCheck('Manifesto gerado', true, manifestPath(exportsDir));
  } else {
    printWarn('Dry-run ativo', 'nenhum arquivo local foi criado');
  }

  const exportedRows = tables.reduce((sum, table) => sum + Number(table.rows || 0), 0);
  printCheck('Resultado final', true, `${formatCount(exportedRows)} linha(s) consideradas`);
} catch (error) {
  process.exitCode = 1;
  printCheck('Export Supabase', false, error.message);
} finally {
  await closeSql(sql);
}
