import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const RAILWAY_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_ENV_FILE = path.resolve(process.cwd(), '.env.staging.railway');
export const DEFAULT_EXPORTS_DIR = path.resolve(RAILWAY_ROOT, 'exports');

export const REQUIRED_TABLES = [
  'pre_fatura_records',
  'gestao_pacotes_records',
  'desvios_pnr_records',
  'gestao_desvios_pacotes_faltantes',
  'dashboard_files',
  'processed_dashboard_files',
];

export const CANONICAL_MODULES = [
  {
    moduleKey: 'pre_fatura',
    table: 'pre_fatura_records',
    fileColumn: 'file_id',
  },
  {
    moduleKey: 'gestao_pacotes',
    table: 'gestao_pacotes_records',
    fileColumn: 'file_id',
  },
  {
    moduleKey: 'desvios_pnr',
    table: 'desvios_pnr_records',
    fileColumn: 'file_id',
  },
  {
    moduleKey: 'pacotes_faltantes',
    table: 'gestao_desvios_pacotes_faltantes',
    fileColumn: 'source_file_id',
  },
];

export const LEGACY_MODULE_KEYS = [
  'pre-fatura',
  'gestao-pacotes',
  'gestao-desvios-pnr',
  'desvios-pnr',
  'pacotes-faltantes',
];

export const EXPORT_TABLES = [
  {
    key: 'auth_users',
    schema: 'auth',
    table: 'users',
    fullName: 'auth.users',
    primaryKey: 'id',
    orderBy: 'id',
    optional: true,
    columns: ['id', 'email', 'raw_user_meta_data', 'created_at', 'updated_at'],
  },
  {
    key: 'profiles',
    schema: 'public',
    table: 'profiles',
    fullName: 'public.profiles',
    primaryKey: 'id',
    orderBy: 'id',
    optional: true,
  },
  {
    key: 'dashboard_settings',
    schema: 'public',
    table: 'dashboard_settings',
    fullName: 'public.dashboard_settings',
    primaryKey: 'key',
    orderBy: 'key',
    optional: true,
  },
  {
    key: 'dashboard_files',
    schema: 'public',
    table: 'dashboard_files',
    fullName: 'public.dashboard_files',
    primaryKey: 'id',
    orderBy: 'created_at, id',
  },
  {
    key: 'processed_dashboard_files',
    schema: 'public',
    table: 'processed_dashboard_files',
    fullName: 'public.processed_dashboard_files',
    primaryKey: 'id',
    orderBy: 'processed_at, id',
  },
  {
    key: 'pre_fatura_records',
    schema: 'public',
    table: 'pre_fatura_records',
    fullName: 'public.pre_fatura_records',
    primaryKey: 'id',
    orderBy: 'created_at, id',
    rawDataOptional: true,
  },
  {
    key: 'gestao_pacotes_records',
    schema: 'public',
    table: 'gestao_pacotes_records',
    fullName: 'public.gestao_pacotes_records',
    primaryKey: 'id',
    orderBy: 'created_at, id',
    rawDataOptional: true,
  },
  {
    key: 'desvios_pnr_records',
    schema: 'public',
    table: 'desvios_pnr_records',
    fullName: 'public.desvios_pnr_records',
    primaryKey: 'id',
    orderBy: 'created_at, id',
  },
  {
    key: 'gestao_desvios_pacotes_faltantes',
    schema: 'public',
    table: 'gestao_desvios_pacotes_faltantes',
    fullName: 'public.gestao_desvios_pacotes_faltantes',
    primaryKey: 'id',
    orderBy: 'imported_at, id',
  },
];

export const MODULE_TABLE_BY_KEY = new Map(
  CANONICAL_MODULES.map((module) => [module.moduleKey, module.table]),
);

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const values = new Map();

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }

    const [name, ...valueParts] = arg.slice(2).split('=');
    if (valueParts.length === 0) {
      flags.add(name);
      continue;
    }

    flags.add(name);
    values.set(name, valueParts.join('='));
  }

  return {
    flags,
    values,
    has(name) {
      return flags.has(name);
    },
    get(name, fallback = undefined) {
      return values.has(name) ? values.get(name) : fallback;
    },
    int(name, fallback) {
      const value = values.has(name) ? Number(values.get(name)) : fallback;
      return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
    },
  };
}

export function printHelp(scriptName, lines = []) {
  console.log(`Uso: node scripts/railway/${scriptName} [opcoes]`);
  console.log('');
  console.log('Opcoes comuns:');
  console.log('  --env-file=<arquivo>          Usa arquivo de ambiente separado. Padrao: .env.staging.railway');
  console.log('  --dry-run                     Simula a operacao quando houver escrita ou exportacao local');
  console.log('  --allow-non-railway-host      Permite alvo Railway com host customizado para teste local');
  console.log('  --help                        Mostra esta ajuda');

  if (lines.length > 0) {
    console.log('');
    for (const line of lines) {
      console.log(line);
    }
  }
}

export function loadRailwayEnv(args = parseArgs()) {
  const envFile = path.resolve(args.get('env-file', process.env.RAILWAY_ENV_FILE || DEFAULT_ENV_FILE));

  if (!fs.existsSync(envFile)) {
    return {
      envFile,
      loaded: false,
      keys: [],
    };
  }

  const keys = [];
  const content = fs.readFileSync(envFile, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
    keys.push(key);
  }

  return {
    envFile,
    loaded: true,
    keys,
  };
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel obrigatoria ausente: ${name}`);
  }
  return value;
}

export function createSql(connectionString, options = {}) {
  return postgres(connectionString, {
    max: options.max ?? 3,
    idle_timeout: options.idleTimeout ?? 20,
    connect_timeout: options.connectTimeout ?? 20,
    ssl: options.ssl ?? 'require',
    transform: {
      undefined: null,
    },
  });
}

export function databaseHost(connectionString) {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return '';
  }
}

export function databaseName(connectionString) {
  try {
    const parsed = new URL(connectionString);
    return decodeURIComponent(parsed.pathname.replace(/^\//, '')) || '(sem nome)';
  } catch {
    return '(url invalida)';
  }
}

export function redactConnectionString(connectionString) {
  try {
    const parsed = new URL(connectionString);
    parsed.username = parsed.username ? '***' : '';
    parsed.password = parsed.password ? '***' : '';
    return parsed.toString();
  } catch {
    return '(url invalida)';
  }
}

export function isSupabaseHost(host) {
  return /supabase\.(co|com)$/i.test(host) || /pooler\.supabase\./i.test(host);
}

export function isRailwayHost(host) {
  return /railway/i.test(host) || /rlwy/i.test(host);
}

export function assertRailwayWriteTarget(connectionString, args = parseArgs()) {
  if (!connectionString) {
    throw new Error('RAILWAY_DATABASE_URL esta vazio. Escritas em staging foram bloqueadas.');
  }

  const host = databaseHost(connectionString);

  if (isSupabaseHost(host)) {
    throw new Error(`RAILWAY_DATABASE_URL aponta para Supabase (${host}). Escrita bloqueada.`);
  }

  if (process.env.SUPABASE_DB_URL && connectionString === process.env.SUPABASE_DB_URL) {
    throw new Error('RAILWAY_DATABASE_URL e SUPABASE_DB_URL sao iguais. Escrita bloqueada.');
  }

  if (!isRailwayHost(host) && !args.has('allow-non-railway-host')) {
    throw new Error(
      `Host alvo nao parece Railway (${host}). Use --allow-non-railway-host somente para teste local controlado.`,
    );
  }

  return {
    host,
    database: databaseName(connectionString),
  };
}

export function assertSupabaseReadOnlyTarget(connectionString) {
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL esta vazio.');
  }

  const host = databaseHost(connectionString);
  if (!isSupabaseHost(host)) {
    console.warn(`[aviso] SUPABASE_DB_URL nao parece host Supabase: ${host}`);
  }

  return {
    host,
    database: databaseName(connectionString),
  };
}

export function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

export function qualifyName(schema, table) {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

export function splitFullName(fullName) {
  const parts = fullName.split('.');
  if (parts.length === 1) {
    return {
      schema: 'public',
      table: parts[0],
    };
  }
  return {
    schema: parts[0],
    table: parts[1],
  };
}

export async function tableExists(sql, schema, table) {
  const rows = await sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = ${schema}
        and table_name = ${table}
    ) as exists
  `;

  return Boolean(rows[0]?.exists);
}

export async function tableColumns(sql, schema, table) {
  const rows = await sql`
    select column_name, data_type, udt_name, is_nullable
    from information_schema.columns
    where table_schema = ${schema}
      and table_name = ${table}
    order by ordinal_position
  `;

  return rows.map((row) => ({
    name: row.column_name,
    dataType: row.data_type,
    udtName: row.udt_name,
    nullable: row.is_nullable === 'YES',
  }));
}

export async function countRows(sql, schema, table) {
  if (!(await tableExists(sql, schema, table))) {
    return null;
  }

  const qualified = qualifyName(schema, table);
  const rows = await sql.unsafe(`select count(*)::bigint as total from ${qualified}`);
  return Number(rows[0]?.total ?? 0);
}

export async function moduleCounts(sql, schema, table) {
  const columns = await tableColumns(sql, schema, table);
  if (!columns.some((column) => column.name === 'module_key')) {
    return [];
  }

  const qualified = qualifyName(schema, table);
  return sql.unsafe(`
    select module_key, count(*)::bigint as total
    from ${qualified}
    group by module_key
    order by module_key
  `);
}

export async function statusCounts(sql, schema, table) {
  const columns = await tableColumns(sql, schema, table);
  const statusColumns = [
    'status',
    'status_current',
    'status_normalizado',
    'manual_status',
    'status_caso',
    'status_contato_meli',
  ].filter((column) => columns.some((entry) => entry.name === column));

  const qualified = qualifyName(schema, table);
  const result = {};

  for (const column of statusColumns) {
    result[column] = await sql.unsafe(`
      select ${quoteIdent(column)} as value, count(*)::bigint as total
      from ${qualified}
      group by ${quoteIdent(column)}
      order by total desc, value
      limit 50
    `);
  }

  return result;
}

export async function legacyModuleKeyCount(sql, schema, table) {
  const columns = await tableColumns(sql, schema, table);
  if (!columns.some((column) => column.name === 'module_key')) {
    return 0;
  }

  const qualified = qualifyName(schema, table);
  const rows = await sql.unsafe(
    `
      select count(*)::bigint as total
      from ${qualified}
      where module_key = any($1::text[])
    `,
    [LEGACY_MODULE_KEYS],
  );

  return Number(rows[0]?.total ?? 0);
}

export async function duplicateDedupeCount(sql, schema, table) {
  const columns = await tableColumns(sql, schema, table);
  if (
    !columns.some((column) => column.name === 'module_key') ||
    !columns.some((column) => column.name === 'dedupe_key')
  ) {
    return 0;
  }

  const qualified = qualifyName(schema, table);
  const rows = await sql.unsafe(`
    select count(*)::bigint as duplicated_keys
    from (
      select module_key, dedupe_key
      from ${qualified}
      where dedupe_key is not null
      group by module_key, dedupe_key
      having count(*) > 1
    ) duplicated
  `);

  return Number(rows[0]?.duplicated_keys ?? 0);
}

export async function hasUniqueDedupeIndex(sql, table) {
  const rows = await sql`
    select count(*)::int as total
    from pg_indexes
    where schemaname = 'public'
      and tablename = ${table}
      and indexdef ilike '%unique%'
      and indexdef ilike '%module_key%'
      and indexdef ilike '%dedupe_key%'
  `;

  return Number(rows[0]?.total ?? 0) > 0;
}

export async function databaseSize(sql) {
  const rows = await sql`
    select pg_database_size(current_database())::bigint as bytes,
           pg_size_pretty(pg_database_size(current_database())) as pretty
  `;

  return rows[0] ?? {
    bytes: 0,
    pretty: '0 bytes',
  };
}

export async function tableSize(sql, schema, table) {
  if (!(await tableExists(sql, schema, table))) {
    return null;
  }

  const rows = await sql`
    select pg_total_relation_size(to_regclass(${`${schema}.${table}`}))::bigint as bytes,
           pg_size_pretty(pg_total_relation_size(to_regclass(${`${schema}.${table}`}))) as pretty
  `;

  return rows[0] ?? null;
}

export function ensureDirectory(directory) {
  fs.mkdirSync(directory, {
    recursive: true,
  });
}

export function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) {
    return [];
  }

  return content.split(/\r?\n/).map((line) => JSON.parse(line));
}

export function appendJsonLines(filePath, rows) {
  if (rows.length === 0) {
    return 0;
  }

  const payload = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  fs.appendFileSync(filePath, payload, 'utf8');
  return Buffer.byteLength(payload);
}

export function checksumRows(rows, hash = crypto.createHash('sha256')) {
  for (const row of rows) {
    hash.update(JSON.stringify(row));
    hash.update('\n');
  }
  return hash;
}

export function checksumFile(filePath) {
  const hash = crypto.createHash('sha256');
  if (!fs.existsSync(filePath)) {
    return hash.digest('hex');
  }
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function bytesToHuman(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
}

export function formatCount(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

export function writeJsonFile(filePath, data) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function scriptHeader(title, details = []) {
  console.log('');
  console.log(`== ${title} ==`);
  for (const detail of details) {
    console.log(detail);
  }
  console.log('');
}

export function printCheck(label, ok, detail = '') {
  const prefix = ok ? '[OK]' : '[ERRO]';
  console.log(`${prefix} ${label}${detail ? ` - ${detail}` : ''}`);
}

export function printWarn(label, detail = '') {
  console.log(`[AVISO] ${label}${detail ? ` - ${detail}` : ''}`);
}

export async function closeSql(sql) {
  if (!sql) {
    return;
  }

  await sql.end({
    timeout: 5,
  });
}

export async function runReadOnly(sql, callback) {
  return sql.begin(async (transaction) => {
    await transaction`set transaction read only`;
    return callback(transaction);
  });
}

export function resolveExportsDir(args = parseArgs()) {
  return path.resolve(args.get('exports-dir', DEFAULT_EXPORTS_DIR));
}

export function manifestPath(exportsDir) {
  return path.join(exportsDir, 'migration_manifest.json');
}
