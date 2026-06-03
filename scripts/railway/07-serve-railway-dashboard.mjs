#!/usr/bin/env node
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assertRailwayWriteTarget,
  closeSql,
  createSql,
  loadRailwayEnv,
  parseArgs,
  printCheck,
  printHelp,
  qualifyName,
  quoteIdent,
  requireEnv,
  scriptHeader,
} from './lib/railway-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const API_PREFIX = '/api/railway';
const MODULE_API_PREFIX = '/api';
const DEFAULT_PORT = 8091;
const OPERATIONAL_FREEZE_MESSAGE = 'Painel em janela de manutenção. Consultas seguem disponíveis, mas alterações estão temporariamente bloqueadas.';

const args = parseArgs();

if (args.has('help')) {
  printHelp('07-serve-railway-dashboard.mjs', [
    'Serve o painel localmente com dados no Railway staging e Auth real do Supabase.',
    'Nao altera Vercel e nao aponta producao para Railway.',
    'Opcoes especificas:',
    '  --port=<n>                    Porta local. Padrao: 8091',
  ]);
  process.exit(0);
}

const ALLOWED_TABLES = new Set([
  'audit_logs',
  'dashboard_files',
  'dashboard_settings',
  'processed_dashboard_files',
  'pre_fatura_records',
  'gestao_pacotes_records',
  'desvios_pnr_records',
  'gestao_desvios_pacotes_faltantes',
  'profiles',
]);

const RPC_DEFINITIONS = {
  desvios_pnr_summary: {
    sql: `
      select public.desvios_pnr_summary(
        $1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text
      ) as data
    `,
    params: [
      ['p_file_ids', 'uuidArray'],
      ['p_month_keys', 'textArray'],
      ['p_quinzenas', 'textArray'],
      ['p_statuses', 'textArray'],
      ['p_tipos', 'textArray'],
      ['p_estacoes', 'textArray'],
      ['p_status_motoristas', 'textArray'],
      ['p_fontes', 'textArray'],
      ['p_motoristas', 'textArray'],
      ['p_rotas', 'textArray'],
      ['p_search', 'text'],
    ],
  },
  desvios_pnr_table: {
    sql: `
      select public.desvios_pnr_table(
        $1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text,
        $12::integer, $13::integer, $14::text, $15::text
      ) as data
    `,
    params: [
      ['p_file_ids', 'uuidArray'],
      ['p_month_keys', 'textArray'],
      ['p_quinzenas', 'textArray'],
      ['p_statuses', 'textArray'],
      ['p_tipos', 'textArray'],
      ['p_estacoes', 'textArray'],
      ['p_status_motoristas', 'textArray'],
      ['p_fontes', 'textArray'],
      ['p_motoristas', 'textArray'],
      ['p_rotas', 'textArray'],
      ['p_search', 'text'],
      ['p_page', 'int'],
      ['p_page_size', 'int'],
      ['p_sort_key', 'text'],
      ['p_sort_dir', 'text'],
    ],
  },
  refresh_desvios_pnr_metrics_summary: {
    sql: 'select public.refresh_desvios_pnr_metrics_summary($1::uuid[]) as data',
    params: [['p_file_ids', 'uuidArray']],
  },
  update_desvios_pnr_status: {
    sql: 'select public.update_desvios_pnr_status($1::uuid, $2::text) as data',
    params: [
      ['p_record_id', 'uuid'],
      ['p_status', 'text'],
    ],
    requiresAuthSetting: true,
  },
};

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function readPublicConfig() {
  const configPath = path.join(PROJECT_ROOT, 'config.js');
  const source = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const matchValue = (key) => {
    const match = source.match(new RegExp(`${key}\\s*:\\s*["']([^"']+)["']`));
    return match?.[1] || '';
  };

  return {
    SUPABASE_URL: process.env.SUPABASE_URL || matchValue('SUPABASE_URL'),
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || matchValue('SUPABASE_ANON_KEY'),
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

class OperationalFreezeError extends Error {
  constructor(message = OPERATIONAL_FREEZE_MESSAGE) {
    super(message);
    this.name = 'OperationalFreezeError';
    this.statusCode = 423;
  }
}

function isTruthyEnv(value) {
  return value === true || value === 1 || ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isOperationalFreezeEnabled() {
  return isTruthyEnv(process.env.OPERATIONAL_FREEZE);
}

function assertOperationalWriteAllowed() {
  if (!isOperationalFreezeEnabled()) return;
  throw new OperationalFreezeError();
}

function isGenericWritePayload(payload = {}) {
  return ['insert', 'upsert', 'update', 'delete'].includes(String(payload.action || '').toLowerCase());
}

function isWriteRpcName(name = '') {
  return new Set([
    'refresh_desvios_pnr_metrics_summary',
    'update_desvios_pnr_status',
  ]).has(String(name || '').trim());
}

function isWriteEndpoint(pathname = '') {
  return [
    '/delete',
    '/import',
    '/reprocess',
    '/update-status',
    '/update-contact',
  ].some((suffix) => pathname.endsWith(suffix));
}

function sendText(response, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  response.end(text);
}

function sanitizeIdentifier(identifier, label = 'identificador') {
  const value = String(identifier || '').trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${label} invalido: ${value}`);
  }
  return value;
}

function assertAllowedTable(table) {
  const sanitized = sanitizeIdentifier(table, 'tabela');
  if (!ALLOWED_TABLES.has(sanitized)) {
    throw new Error(`Tabela nao permitida no staging Railway: ${sanitized}`);
  }
  return sanitized;
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => item !== undefined && item !== null && item !== '');
}

function coerceRpcParam(argsObject, [key, type]) {
  const value = argsObject?.[key];
  if (type === 'uuidArray' || type === 'textArray') return normalizeArray(value);
  if (type === 'int') return Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : null;
  if (type === 'text') return value == null ? '' : String(value);
  if (type === 'uuid') return value || null;
  return value ?? null;
}

function buildWhere(filters = [], startIndex = 1) {
  const clauses = [];
  const params = [];
  let index = startIndex;

  for (const filter of filters || []) {
    const column = quoteIdent(sanitizeIdentifier(filter.column, 'coluna de filtro'));
    const op = filter.op;

    if (op === 'in') {
      const values = Array.isArray(filter.value) ? filter.value : [];
      if (values.length === 0) {
        clauses.push('false');
        continue;
      }
      const placeholders = values.map(() => `$${index++}`);
      params.push(...values);
      clauses.push(`${column} in (${placeholders.join(', ')})`);
      continue;
    }

    if (op === 'is') {
      if (filter.value === null) {
        clauses.push(`${column} is null`);
      } else {
        clauses.push(`${column} is not distinct from $${index++}`);
        params.push(filter.value);
      }
      continue;
    }

    if (op === 'contains') {
      clauses.push(`${column} @> $${index++}::jsonb`);
      params.push(JSON.stringify(filter.value || {}));
      continue;
    }

    const operatorByOp = {
      eq: '=',
      neq: '<>',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      like: 'like',
      ilike: 'ilike',
    };
    const operator = operatorByOp[op];
    if (!operator) {
      throw new Error(`Operador de filtro nao suportado: ${op}`);
    }
    clauses.push(`${column} ${operator} $${index++}`);
    params.push(filter.value);
  }

  return {
    text: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
    nextIndex: index,
  };
}

function buildOrder(orders = []) {
  if (!orders.length) {
    return '';
  }

  const parts = orders.map((order) => {
    const column = quoteIdent(sanitizeIdentifier(order.column, 'coluna de ordenacao'));
    const direction = order.ascending === false ? 'desc' : 'asc';
    const nulls = order.nullsFirst ? 'nulls first' : 'nulls last';
    return `${column} ${direction} ${nulls}`;
  });

  return `order by ${parts.join(', ')}`;
}

function buildLimit(payload, params, startIndex) {
  if (Array.isArray(payload.range) && payload.range.length === 2) {
    const from = Math.max(Number(payload.range[0]) || 0, 0);
    const to = Math.max(Number(payload.range[1]) || from, from);
    params.push(to - from + 1, from);
    return `limit $${startIndex} offset $${startIndex + 1}`;
  }

  if (payload.limit !== null && payload.limit !== undefined && payload.limit !== '' && Number.isFinite(Number(payload.limit))) {
    params.push(Math.max(Math.trunc(Number(payload.limit)), 0));
    return `limit $${startIndex}`;
  }

  return '';
}

function normalizeResultRows(rows, payload) {
  if (payload.head) {
    return null;
  }

  if (payload.single || payload.maybeSingle) {
    if (rows.length === 0 && payload.maybeSingle) return null;
    if (rows.length === 1) return rows[0];
    if (rows.length === 0) throw new Error('Nenhum registro encontrado para single().');
    throw new Error(`single() retornou ${rows.length} registros.`);
  }

  return rows;
}

async function executeSelect(sql, payload, table) {
  const qualified = qualifyName('public', table);
  const where = buildWhere(payload.filters);
  const order = buildOrder(payload.orders);
  const queryParams = [...where.params];
  const limit = buildLimit(payload, queryParams, queryParams.length + 1);

  let count = null;
  if (payload.count === 'exact') {
    const countRows = await sql.unsafe(
      `select count(*)::bigint as total from ${qualified} ${where.text}`,
      where.params,
    );
    count = Number(countRows[0]?.total ?? 0);
  }

  if (payload.head) {
    return { data: null, error: null, count };
  }

  const rows = await sql.unsafe(
    `select * from ${qualified} ${where.text} ${order} ${limit}`,
    queryParams,
  );

  return {
    data: normalizeResultRows(rows, payload),
    error: null,
    count,
  };
}

function rowsFromValues(values) {
  if (Array.isArray(values)) return values;
  if (values && typeof values === 'object') return [values];
  return [];
}

function collectColumns(rows) {
  const columns = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      columns.add(sanitizeIdentifier(key, 'coluna'));
    }
  }
  return Array.from(columns);
}

async function executeInsertLike(sql, payload, table) {
  const rows = rowsFromValues(payload.values);
  if (rows.length === 0) {
    return { data: payload.returning ? [] : null, error: null, count: 0 };
  }

  const qualified = qualifyName('public', table);
  const columns = collectColumns(rows);
  const columnList = columns.map((column) => quoteIdent(column)).join(', ');
  let conflictClause = '';

  if (payload.action === 'upsert') {
    const conflictColumns = String(payload.onConflict || 'id')
      .split(',')
      .map((column) => sanitizeIdentifier(column.trim(), 'coluna de conflito'))
      .filter(Boolean);
    const updates = columns
      .filter((column) => !conflictColumns.includes(column))
      .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
      .join(', ');
    conflictClause = updates
      ? `on conflict (${conflictColumns.map(quoteIdent).join(', ')}) do update set ${updates}`
      : `on conflict (${conflictColumns.map(quoteIdent).join(', ')}) do nothing`;
  }

  const result = await sql.unsafe(
    `
      insert into ${qualified} (${columnList})
      select ${columnList}
      from jsonb_populate_recordset(null::${qualified}, $1::jsonb)
      ${conflictClause}
      returning *
    `,
    [sql.json(rows)],
  );

  return {
    data: payload.returning || payload.single || payload.maybeSingle ? normalizeResultRows(result, payload) : null,
    error: null,
    count: result.length,
  };
}

async function executeUpdate(sql, payload, table) {
  const values = payload.values || {};
  const columns = collectColumns([values]);
  if (columns.length === 0) {
    throw new Error('Update sem campos.');
  }
  if (!payload.filters?.length) {
    throw new Error('Update sem filtro bloqueado no staging.');
  }

  const qualified = qualifyName('public', table);
  const params = columns.map((column) => values[column]);
  const setClause = columns.map((column, index) => `${quoteIdent(column)} = $${index + 1}`).join(', ');
  const where = buildWhere(payload.filters, params.length + 1);
  const result = await sql.unsafe(
    `update ${qualified} set ${setClause} ${where.text} returning *`,
    [...params, ...where.params],
  );

  return {
    data: payload.returning || payload.single || payload.maybeSingle ? normalizeResultRows(result, payload) : null,
    error: null,
    count: result.length,
  };
}

async function executeDelete(sql, payload, table) {
  if (!payload.filters?.length) {
    throw new Error('Delete sem filtro bloqueado no staging.');
  }

  const qualified = qualifyName('public', table);
  const where = buildWhere(payload.filters);
  const result = await sql.unsafe(`delete from ${qualified} ${where.text} returning *`, where.params);

  return {
    data: payload.returning || payload.single || payload.maybeSingle ? normalizeResultRows(result, payload) : null,
    error: null,
    count: result.length,
  };
}

async function handleQuery(sql, payload) {
  const table = assertAllowedTable(payload.table);
  if (isGenericWritePayload(payload)) assertOperationalWriteAllowed();
  if (payload.action === 'select') return executeSelect(sql, payload, table);
  if (payload.action === 'insert' || payload.action === 'upsert') return executeInsertLike(sql, payload, table);
  if (payload.action === 'update') return executeUpdate(sql, payload, table);
  if (payload.action === 'delete') return executeDelete(sql, payload, table);
  throw new Error(`Acao nao suportada: ${payload.action}`);
}

async function handleRpc(sql, payload, authUser) {
  const name = sanitizeIdentifier(payload.name, 'rpc');
  if (isWriteRpcName(name)) assertOperationalWriteAllowed();
  const definition = RPC_DEFINITIONS[name];
  if (!definition) {
    throw new Error(`RPC nao permitida no staging Railway: ${name}`);
  }

  const params = definition.params.map((entry) => coerceRpcParam(payload.args || {}, entry));

  if (definition.requiresAuthSetting) {
    if (!authUser?.id) {
      throw new Error('RPC exige usuario autenticado.');
    }

    const result = await sql.begin(async (transaction) => {
      await transaction`select set_config('request.jwt.claim.sub', ${authUser.id}, true)`;
      const rows = await transaction.unsafe(definition.sql, params);
      return rows[0]?.data ?? null;
    });

    return { data: result, error: null };
  }

  const rows = await sql.unsafe(definition.sql, params);
  return { data: rows[0]?.data ?? null, error: null };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function verifyAuthUser(request, publicConfig) {
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const response = await fetch(`${publicConfig.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: publicConfig.SUPABASE_ANON_KEY,
      authorization,
    },
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return user?.id ? user : null;
}

async function loadProfile(sql, authUser) {
  if (!authUser?.id) return null;
  const rows = await sql`
    select id, email, name, role, is_admin, cargo, setor
    from public.profiles
    where id = ${authUser.id}
    limit 1
  `;
  return rows[0] || null;
}

function canMutate(profile) {
  return profile?.is_admin === true || String(profile?.role || '').toLowerCase() === 'admin';
}

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizeMissingPackageCaseStatus(value = '') {
  const normalized = normalizeText(value);
  if (normalized.includes('ROTA')) return 'Em rota';
  if (normalized === 'RESOLVIDO' || normalized === 'CONCLUIDO') return 'Concluído';
  return 'Pendente';
}

function normalizeMissingPackageMeliStatus(value = '') {
  const normalized = normalizeText(value);
  if (normalized === 'CONCLUIDO') return 'Concluído';
  if (normalized.includes('AGUARDANDO')) return 'Aguardando MELI';
  return 'E-mail Enviado';
}

function normalizeIdList(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)));
}

const PRE_FATURA_MODULE_KEY = 'pre_fatura';
const PRE_FATURA_FILE_TYPE = 'PRE_FATURA';
const GESTAO_PACOTES_MODULE_KEY = 'gestao_pacotes';
const GESTAO_PACOTES_FILE_TYPE = 'GESTAO_PACOTES';
const DESVIOS_PNR_MODULE_KEY = 'desvios_pnr';
const DESVIOS_PNR_FILE_TYPE = 'DESVIOS_PNR';
const PNR_EXPORT_MAX_ROWS = 200000;
const PACKAGE_CATEGORY_LABELS = {
  ALC: 'ALC',
  DRIVER: 'Driver',
  DISPATCHER: 'Dispatcher',
  MERCADO_LIVRE: 'Mercado Livre',
  INDEFINIDO: 'Indefinido',
};
const PACKAGE_MONTHS = new Map([
  ['JAN', '01'], ['JANEIRO', '01'],
  ['FEV', '02'], ['FEVEREIRO', '02'],
  ['MAR', '03'], ['MARCO', '03'], ['MARÇO', '03'],
  ['ABR', '04'], ['ABRIL', '04'],
  ['MAI', '05'], ['MAIO', '05'],
  ['JUN', '06'], ['JUNHO', '06'],
  ['JUL', '07'], ['JULHO', '07'],
  ['AGO', '08'], ['AGOSTO', '08'],
  ['SET', '09'], ['SETEMBRO', '09'],
  ['OUT', '10'], ['OUTUBRO', '10'],
  ['NOV', '11'], ['NOVEMBRO', '11'],
  ['DEZ', '12'], ['DEZEMBRO', '12'],
]);

function packageCategoryLabel(category = '') {
  return PACKAGE_CATEGORY_LABELS[String(category || '').toUpperCase()] || 'Indefinido';
}

function normalizePackagePeriod(value = '') {
  const normalized = normalizeText(value);
  if (normalized === 'Q1' || normalized.includes('1') || normalized.includes('PRIMEIRA')) return 'q1';
  if (normalized === 'Q2' || normalized.includes('2') || normalized.includes('SEGUNDA')) return 'q2';
  return 'month';
}

function parsePackageMonthKey(row = {}) {
  const directMonth = String(row.reference_month || row.raw_data?.reference_month || '').trim().padStart(2, '0');
  const directYear = String(row.reference_year || row.raw_data?.reference_year || '').trim();
  if (/^\d{2}$/.test(directMonth) && /^\d{4}$/.test(directYear)) {
    return `${directYear}-${directMonth}`;
  }

  const competencia = String(row.competencia || '').trim();
  const parts = competencia.split('/');
  if (parts.length >= 2) {
    const monthText = normalizeText(parts[0]).replace(/[^A-Z]/g, '');
    const month = PACKAGE_MONTHS.get(monthText);
    const rawYear = String(parts[1] || '').replace(/\D/g, '');
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    if (month && /^\d{4}$/.test(year)) return `${year}-${month}`;
  }

  const date = row.data ? new Date(row.data) : null;
  if (date && !Number.isNaN(date.getTime())) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  return '';
}

function normalizePrefaturaType(value = '') {
  const normalized = normalizeText(value);
  if (normalized.includes('PNR')) return 'PNR';
  if (normalized.includes('SVC')) return 'SVC';
  if (normalized.includes('XPT')) return 'XPT';
  return normalized;
}

function normalizePreFaturaFilters(payload = {}) {
  const filters = payload.filters && typeof payload.filters === 'object' ? payload.filters : payload;
  const rawPageSize = Number(payload.pageSize || filters.pageSize || 25);
  const rawPage = Number(payload.page || filters.page || 1);
  return {
    months: new Set(normalizeIdList(filters.months || filters.monthKeys || [])),
    period: normalizePackagePeriod(filters.period || filters.period_type || 'month'),
    types: new Set(normalizeIdList(filters.types || filters.tipos || []).map(normalizePrefaturaType)),
    bases: new Set(normalizeIdList(filters.bases || filters.base || []).map((base) => normalizeText(base))),
    drivers: new Set(normalizeIdList(filters.drivers || filters.motoristas || []).map((driver) => normalizeText(driver))),
    query: normalizeText(filters.query || filters.search || ''),
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : 1,
    pageSize: Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(Math.trunc(rawPageSize), 10000) : 25,
    sortKey: String(filters.sortKey || payload.sortKey || '').trim(),
    sortDir: String(filters.sortDir || payload.sortDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc',
  };
}

function getPreFaturaRowType(row = {}) {
  return normalizePrefaturaType(row.tipo || row.aba_origem || row.tipo_registro || row.raw_data?.tipo_registro || row.raw_data?.tipo_desconto);
}

function buildPreFaturaSearchText(row = {}) {
  return normalizeText([
    row.competencia,
    row.quinzena,
    row.tipo,
    row.aba_origem,
    row.base,
    row.codigo_base,
    row.driver,
    row.driver_normalizado,
    row.placa,
    row.id_envio,
    row.id_pacote,
    row.rota,
    row.arquivo_origem,
    row.raw_data?.descricao,
  ].filter(Boolean).join(' '));
}

function filterPreFaturaRows(rows = [], filters = normalizePreFaturaFilters()) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (String(row.module_key || '') !== PRE_FATURA_MODULE_KEY) return false;
    if (filters.months.size && !filters.months.has(parsePackageMonthKey(row))) return false;
    if (filters.period !== 'month' && normalizePackagePeriod(row.period_type || row.quinzena) !== filters.period) return false;
    if (filters.types.size && !filters.types.has(getPreFaturaRowType(row))) return false;
    if (filters.bases.size && !filters.bases.has(normalizeText(row.codigo_base || row.base))) return false;
    if (filters.drivers.size && !filters.drivers.has(normalizeText(row.driver_normalizado || row.driver))) return false;
    if (filters.query && !buildPreFaturaSearchText(row).includes(filters.query)) return false;
    return true;
  });
}

function sortPreFaturaRows(rows = [], filters = normalizePreFaturaFilters()) {
  const getters = {
    competencia: (row) => parsePackageMonthKey(row),
    quinzena: (row) => normalizePackagePeriod(row.period_type || row.quinzena),
    tipo: (row) => getPreFaturaRowType(row),
    tipo_desconto: (row) => row.raw_data?.tipo_desconto || row.tipo || row.aba_origem || '',
    aba_origem: (row) => row.aba_origem || '',
    base: (row) => row.base || row.codigo_base || '',
    motorista: (row) => row.driver || row.driver_normalizado || '',
    driver: (row) => row.driver || row.driver_normalizado || '',
    placa: (row) => row.placa || '',
    data: (row) => row.data || '',
    data_sort: (row) => row.data || '',
    id_envio: (row) => row.id_envio || row.id_pacote || '',
    id_pacote: (row) => row.id_pacote || row.id_envio || '',
    rota: (row) => row.rota || '',
    n_rota: (row) => row.rota || '',
    valor: (row) => Number(row.valor_numerico || row.valor || 0),
    valor_numerico: (row) => Number(row.valor_numerico || row.valor || 0),
    created_at: (row) => row.created_at || '',
  };
  const getter = getters[filters.sortKey];
  if (!getter) return rows;
  const direction = filters.sortDir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = getter(a);
    const right = getter(b);
    if (typeof left === 'number' || typeof right === 'number') return (Number(left || 0) - Number(right || 0)) * direction;
    return String(left || '').localeCompare(String(right || ''), 'pt-BR', { numeric: true, sensitivity: 'base' }) * direction;
  });
}

function paginatePreFaturaRows(rows = [], filters = normalizePreFaturaFilters()) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pageCount);
  const start = (page - 1) * filters.pageSize;
  return {
    rows: rows.slice(start, start + filters.pageSize),
    page,
    pageSize: filters.pageSize,
    total,
    pageCount,
  };
}

function buildPreFaturaSummary(rows = []) {
  const totals = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    acc.count += 1;
    acc.totalValue += Number(row.valor_numerico || row.valor || 0);
    if (getPreFaturaRowType(row) === 'PNR') acc.pnrCount += 1;
    else acc.packageCount += 1;
    const base = normalizeText(row.codigo_base || row.base);
    const driver = normalizeText(row.driver_normalizado || row.driver);
    const route = String(row.rota || '').trim();
    if (base) acc.bases.add(base);
    if (driver) acc.drivers.add(driver);
    if (route) acc.routes.add(route);
    return acc;
  }, {
    count: 0,
    totalValue: 0,
    packageCount: 0,
    pnrCount: 0,
    bases: new Set(),
    drivers: new Set(),
    routes: new Set(),
  });
  return {
    count: totals.count,
    totalValue: Number(totals.totalValue.toFixed(2)),
    packageCount: totals.packageCount,
    pnrCount: totals.pnrCount,
    baseCount: totals.bases.size,
    driverCount: totals.drivers.size,
    routeCount: totals.routes.size,
    packageShare: totals.count ? Number(((totals.packageCount / totals.count) * 100).toFixed(1)) : 0,
    pnrShare: totals.count ? Number(((totals.pnrCount / totals.count) * 100).toFixed(1)) : 0,
  };
}

async function fetchPreFaturaRows(sql) {
  return sql`
    select
      r.*,
      r.valor as valor_numerico,
      coalesce(r.raw_data->>'arquivo_origem', df.file_name, '') as arquivo_origem,
      coalesce(r.raw_data->>'cidade_base', '') as cidade_base,
      coalesce(r.raw_data->>'sigla_base', r.codigo_base, '') as sigla_base,
      coalesce(nullif(r.id_envio, ''), r.raw_data->>'id_pacote') as id_pacote,
      coalesce(r.raw_data->>'tipo_desconto', r.tipo, r.aba_origem, '') as tipo_desconto,
      coalesce(r.raw_data->>'canal', '') as canal,
      coalesce(r.raw_data->>'reference_month', df.reference_month, '') as reference_month,
      coalesce(r.raw_data->>'reference_year', df.reference_year, '') as reference_year,
      coalesce(
        r.raw_data->>'period_type',
        df.period_type,
        case
          when r.quinzena ilike '1%' then 'q1'
          when r.quinzena ilike '2%' then 'q2'
          else 'month'
        end
      ) as period_type,
      coalesce(r.raw_data->>'period_label', df.period_label, r.quinzena, '') as period_label,
      case
        when coalesce(r.tipo, r.aba_origem, r.raw_data->>'tipo_registro', r.raw_data->>'tipo_desconto') ilike '%PNR%' then 'PNR'
        else 'PACOTE PERDIDO'
      end as tipo_registro
    from public.pre_fatura_records r
    left join public.dashboard_files df
      on df.id = r.file_id
     and (
       df.file_type = ${PRE_FATURA_FILE_TYPE}
       or coalesce(df.metadata->>'module_key', df.metadata->>'dashboard_module_key') = ${PRE_FATURA_MODULE_KEY}
     )
    where r.module_key = ${PRE_FATURA_MODULE_KEY}
    order by r.created_at desc nulls last, r.data desc nulls last, r.id desc
  `;
}

function buildPreFaturaFilterOptions(rows = []) {
  const months = new Map();
  const values = {
    periods: new Set(),
    types: new Set(),
    bases: new Set(),
    drivers: new Set(),
  };
  for (const row of rows) {
    const monthKey = parsePackageMonthKey(row);
    if (monthKey && !months.has(monthKey)) months.set(monthKey, { key: monthKey, label: row.competencia || monthKey });
    const period = normalizePackagePeriod(row.period_type || row.quinzena);
    if (period !== 'month') values.periods.add(period);
    const type = getPreFaturaRowType(row);
    if (type) values.types.add(type);
    if (row.base || row.codigo_base) values.bases.add(row.base || row.codigo_base);
    if (row.driver || row.driver_normalizado) values.drivers.add(row.driver || row.driver_normalizado);
  }
  const toOptions = (set) => Array.from(set).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  return {
    months: Array.from(months.values()).sort((a, b) => a.key.localeCompare(b.key)),
    periods: toOptions(values.periods),
    types: toOptions(values.types),
    bases: toOptions(values.bases),
    drivers: toOptions(values.drivers),
  };
}

async function fetchPreFaturaFiles(sql) {
  const [dashboardRows, processedRows] = await Promise.all([
    sql`
      select *
      from public.dashboard_files
      where file_type = ${PRE_FATURA_FILE_TYPE}
         or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${PRE_FATURA_MODULE_KEY}
      order by created_at desc nulls last, id desc
    `,
    sql`
      select *
      from public.processed_dashboard_files
      where module_key = ${PRE_FATURA_MODULE_KEY}
      order by processed_at desc nulls last, created_at desc nulls last, id desc
    `,
  ]);
  return { dashboardRows, processedRows };
}

async function handlePreFaturaDelete(sql, payload, profile) {
  if (!canMutate(profile)) throw new Error('Apenas administradores podem excluir Pré-Fatura.');
  const ids = normalizeIdList(payload.ids);
  if (!ids.length) {
    return {
      data: { removedRows: 0, removedProcessedMetadata: 0, changedDashboardMetadata: 0, ids: [] },
      error: null,
    };
  }
  const isListOnly = payload.mode === 'listOnly' || payload.mode === 'list-only';
  const mode = isListOnly ? 'list-only' : 'with-data';
  const now = new Date().toISOString();
  return sql.begin(async (transaction) => {
    const dashboardRows = await transaction`
      select id, file_name, storage_path, metadata
      from public.dashboard_files
      where id in ${transaction(ids)}
        and (
          file_type = ${PRE_FATURA_FILE_TYPE}
          or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${PRE_FATURA_MODULE_KEY}
        )
    `;
    const fileNames = normalizeIdList(dashboardRows.map((row) => row.file_name || row.metadata?.original_name));
    const fileHashes = normalizeIdList(dashboardRows.map((row) => row.metadata?.file_hash));
    const storagePaths = normalizeIdList(dashboardRows.map((row) => row.storage_path || row.metadata?.storage_path));
    let removedRows = 0;
    let removedProcessedMetadata = 0;
    let changedDashboardMetadata = 0;

    if (!isListOnly) {
      const deletedRows = await transaction`
        delete from public.pre_fatura_records
        where module_key = ${PRE_FATURA_MODULE_KEY}
          and file_id in ${transaction(ids)}
        returning id
      `;
      removedRows = deletedRows.length;

      const deletedProcessed = (fileNames.length || fileHashes.length || storagePaths.length)
        ? await transaction`
          delete from public.processed_dashboard_files
          where module_key = ${PRE_FATURA_MODULE_KEY}
            and (
              (${fileNames.length > 0} and file_name in ${transaction(fileNames.length ? fileNames : ['__none__'])})
              or (${fileHashes.length > 0} and file_hash in ${transaction(fileHashes.length ? fileHashes : ['__none__'])})
              or (${storagePaths.length > 0} and storage_path in ${transaction(storagePaths.length ? storagePaths : ['__none__'])})
            )
          returning id
        `
        : [];
      removedProcessedMetadata = deletedProcessed.length;

      const deletedDashboard = await transaction`
        delete from public.dashboard_files
        where id in ${transaction(ids)}
          and (
            file_type = ${PRE_FATURA_FILE_TYPE}
            or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${PRE_FATURA_MODULE_KEY}
          )
        returning id
      `;
      changedDashboardMetadata = deletedDashboard.length;
    } else {
      const updatedDashboard = await transaction`
        update public.dashboard_files
        set is_active = false,
            status = 'removed_from_history',
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
              'hidden_from_history', true,
              'removed_from_history', true,
              'removed_from_history_at', ${now},
              'removal_mode', ${mode}
            ),
            updated_at = ${now}
        where id in ${transaction(ids)}
          and (
            file_type = ${PRE_FATURA_FILE_TYPE}
            or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${PRE_FATURA_MODULE_KEY}
          )
        returning id
      `;
      changedDashboardMetadata = updatedDashboard.length;

      if (fileNames.length || fileHashes.length || storagePaths.length) {
        const updatedProcessed = await transaction`
          update public.processed_dashboard_files
          set status = 'removed_from_history',
              metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                'hidden_from_history', true,
                'removed_from_history', true,
                'removed_from_history_at', ${now},
                'removal_mode', ${mode}
              )
          where module_key = ${PRE_FATURA_MODULE_KEY}
            and (
              (${fileNames.length > 0} and file_name in ${transaction(fileNames.length ? fileNames : ['__none__'])})
              or (${fileHashes.length > 0} and file_hash in ${transaction(fileHashes.length ? fileHashes : ['__none__'])})
              or (${storagePaths.length > 0} and storage_path in ${transaction(storagePaths.length ? storagePaths : ['__none__'])})
            )
          returning id
        `;
        removedProcessedMetadata = updatedProcessed.length;
      }
    }

    return {
      data: {
        removedRows,
        removedProcessedMetadata,
        changedDashboardMetadata,
        ids: dashboardRows.map((row) => row.id),
      },
      error: null,
    };
  });
}

async function handlePreFaturaApi(sql, pathname, payload, authUser, profile) {
  const filters = normalizePreFaturaFilters(payload);

  if (pathname === '/api/pre-fatura/table') {
    const rows = sortPreFaturaRows(filterPreFaturaRows(await fetchPreFaturaRows(sql), filters), filters);
    const page = paginatePreFaturaRows(rows, filters);
    return { data: { ...page, filtered: rows.length, generated_at: new Date().toISOString() }, error: null };
  }

  if (pathname === '/api/pre-fatura/summary') {
    const rows = filterPreFaturaRows(await fetchPreFaturaRows(sql), filters);
    return { data: { ...buildPreFaturaSummary(rows), totalFiltered: rows.length }, error: null };
  }

  if (pathname === '/api/pre-fatura/filters') {
    const rows = filterPreFaturaRows(await fetchPreFaturaRows(sql), filters);
    return { data: buildPreFaturaFilterOptions(rows), error: null };
  }

  if (pathname === '/api/pre-fatura/export' || pathname === '/api/pre-fatura/report') {
    const rows = sortPreFaturaRows(filterPreFaturaRows(await fetchPreFaturaRows(sql), filters), filters);
    return {
      data: {
        rows,
        total: rows.length,
        summary: buildPreFaturaSummary(rows),
        generated_at: new Date().toISOString(),
      },
      error: null,
    };
  }

  if (pathname === '/api/pre-fatura/files') {
    const { dashboardRows, processedRows } = await fetchPreFaturaFiles(sql);
    return { data: { rows: dashboardRows, dashboard_files: dashboardRows, processed_dashboard_files: processedRows }, error: null };
  }

  if (pathname === '/api/pre-fatura/existing-keys') {
    const keys = normalizeIdList(payload.keys);
    if (!keys.length) return { data: { keys: [] }, error: null };
    const rows = await sql`
      select dedupe_key
      from public.pre_fatura_records
      where module_key = ${PRE_FATURA_MODULE_KEY}
        and dedupe_key in ${sql(keys)}
    `;
    return { data: { keys: rows.map((row) => row.dedupe_key).filter(Boolean) }, error: null };
  }

  if (pathname === '/api/pre-fatura/delete') {
    return handlePreFaturaDelete(sql, payload, profile);
  }

  return null;
}

function normalizePackageFilters(payload = {}) {
  const filters = payload.filters && typeof payload.filters === 'object' ? payload.filters : payload;
  const rawPageSize = Number(payload.pageSize || filters.pageSize || 25);
  const rawPage = Number(payload.page || filters.page || 1);
  return {
    months: new Set(normalizeIdList(filters.months || filters.monthKeys || [])),
    period: normalizePackagePeriod(filters.period || filters.period_type || 'month'),
    types: new Set(normalizeIdList(filters.types || filters.tipos || []).map((type) => normalizeText(type))),
    statuses: new Set(normalizeIdList(filters.statuses || filters.status || []).map((status) => normalizeText(status))),
    categories: new Set(normalizeIdList(filters.categories || filters.categorias || []).map((category) => normalizeText(category))),
    bases: new Set(normalizeIdList(filters.bases || filters.base || []).map((base) => normalizeText(base))),
    drivers: new Set(normalizeIdList(filters.drivers || filters.motoristas || []).map((driver) => normalizeText(driver))),
    query: normalizeText(filters.query || filters.search || ''),
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : 1,
    pageSize: Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(Math.trunc(rawPageSize), 10000) : 25,
    sortKey: String(filters.sortKey || payload.sortKey || '').trim(),
    sortDir: String(filters.sortDir || payload.sortDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc',
  };
}

function buildPackageSearchText(row = {}) {
  return normalizeText([
    row.competencia,
    row.quinzena,
    row.tipo,
    row.desconto,
    row.base,
    row.codigo_base,
    row.driver,
    row.driver_normalizado,
    row.id_envio,
    row.id_pacote,
    row.rota,
    row.decisao_adm,
    row.observacao,
    row.aba_origem,
    row.arquivo_origem,
  ].filter(Boolean).join(' '));
}

function filterGestaoPacotesRows(rows = [], filters = normalizePackageFilters()) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (String(row.module_key || '') !== GESTAO_PACOTES_MODULE_KEY) return false;
    if (filters.months.size && !filters.months.has(parsePackageMonthKey(row))) return false;
    if (filters.period !== 'month' && normalizePackagePeriod(row.period_type || row.quinzena) !== filters.period) return false;
    if (filters.types.size && !filters.types.has(normalizeText(row.tipo_operacional || row.tipo))) return false;
    if (filters.categories.size && !filters.categories.has(normalizeText(row.categoria_final || row.desconto))) return false;
    if (filters.statuses.size && !filters.statuses.has(normalizeText(row.desconto || row.categoria_final))) return false;
    if (filters.bases.size && !filters.bases.has(normalizeText(row.codigo_base || row.base))) return false;
    if (filters.drivers.size && !filters.drivers.has(normalizeText(row.driver_normalizado || row.driver))) return false;
    if (filters.query && !buildPackageSearchText(row).includes(filters.query)) return false;
    return true;
  });
}

function sortGestaoPacotesRows(rows = [], filters = normalizePackageFilters()) {
  const getters = {
    competencia: (row) => parsePackageMonthKey(row),
    quinzena: (row) => normalizePackagePeriod(row.period_type || row.quinzena),
    tipo: (row) => row.tipo_operacional || row.tipo || '',
    desconto: (row) => row.desconto || row.categoria_final || '',
    categoria_final: (row) => row.categoria_final || row.desconto || '',
    base: (row) => row.base || row.codigo_base || '',
    driver: (row) => row.driver || row.driver_normalizado || '',
    data: (row) => row.data || '',
    id_envio: (row) => row.id_envio || row.id_pacote || '',
    id_pacote: (row) => row.id_pacote || row.id_envio || '',
    rota: (row) => row.rota || '',
    valor: (row) => Number(row.valor_numerico || row.valor || 0),
    valor_numerico: (row) => Number(row.valor_numerico || row.valor || 0),
    decisao_adm: (row) => row.decisao_adm || '',
    created_at: (row) => row.created_at || '',
  };
  const getter = getters[filters.sortKey];
  if (!getter) return rows;
  const direction = filters.sortDir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = getter(a);
    const right = getter(b);
    if (typeof left === 'number' || typeof right === 'number') return (Number(left || 0) - Number(right || 0)) * direction;
    return String(left || '').localeCompare(String(right || ''), 'pt-BR', { numeric: true, sensitivity: 'base' }) * direction;
  });
}

function paginatePackageRows(rows = [], filters = normalizePackageFilters()) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pageCount);
  const start = (page - 1) * filters.pageSize;
  return {
    rows: rows.slice(start, start + filters.pageSize),
    page,
    pageSize: filters.pageSize,
    total,
    pageCount,
  };
}

function buildGestaoPacotesSummary(rows = []) {
  const summary = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    acc.count += 1;
    const category = String(row.categoria_final || row.desconto || 'INDEFINIDO').toUpperCase();
    const value = Math.abs(Number(row.valor_numerico || row.valor || 0));
    if (category === 'ALC') acc.alcValue += value;
    else if (category === 'DRIVER') {
      acc.driverValue += value;
      acc.driverErrors += 1;
    } else if (category === 'DISPATCHER') {
      acc.dispatcherValue += value;
      acc.dispatcherErrors += 1;
    } else if (category === 'MERCADO_LIVRE') acc.mercadoLivreErrors += 1;
    else acc.pendingCount += 1;
    return acc;
  }, {
    count: 0,
    alcValue: 0,
    driverValue: 0,
    dispatcherValue: 0,
    driverErrors: 0,
    dispatcherErrors: 0,
    mercadoLivreErrors: 0,
    pendingCount: 0,
  });
  summary.alcValue = Number(summary.alcValue.toFixed(2));
  summary.driverValue = Number(summary.driverValue.toFixed(2));
  summary.dispatcherValue = Number(summary.dispatcherValue.toFixed(2));
  return summary;
}

async function fetchGestaoPacotesRows(sql) {
  return sql`
    select
      r.*,
      r.valor as valor_numerico,
      coalesce(nullif(r.id_envio, ''), r.raw_data->>'id_pacote', r.raw_data->>'id_caso') as id_pacote,
      coalesce(nullif(r.desconto, ''), 'INDEFINIDO') as categoria_final,
      case coalesce(nullif(r.desconto, ''), 'INDEFINIDO')
        when 'ALC' then 'ALC'
        when 'DRIVER' then 'Driver'
        when 'DISPATCHER' then 'Dispatcher'
        when 'MERCADO_LIVRE' then 'Mercado Livre'
        else 'Indefinido'
      end as categoria_label,
      case coalesce(nullif(r.desconto, ''), 'INDEFINIDO')
        when 'ALC' then 'ALC'
        when 'DRIVER' then 'Driver'
        when 'DISPATCHER' then 'Dispatcher'
        when 'MERCADO_LIVRE' then 'Mercado Livre'
        else 'Indefinido'
      end as tipo_desconto,
      coalesce(r.raw_data->>'arquivo_origem', df.file_name, '') as arquivo_origem,
      coalesce(r.raw_data->>'canal', '') as canal,
      coalesce(r.raw_data->>'evidencia_1', r.observacao, '') as evidencia_1,
      coalesce(r.raw_data->>'evidencia_2', '') as evidencia_2,
      coalesce(r.raw_data->>'aba_gestao', r.aba_origem, '') as aba_gestao,
      coalesce(r.raw_data->>'aba_gestao_label', r.aba_origem, '') as aba_gestao_label,
      coalesce(r.raw_data->>'reference_month', df.reference_month, '') as reference_month,
      coalesce(r.raw_data->>'reference_year', df.reference_year, '') as reference_year,
      coalesce(
        r.raw_data->>'period_type',
        df.period_type,
        case
          when r.quinzena ilike '1%' then 'q1'
          when r.quinzena ilike '2%' then 'q2'
          else 'month'
        end
      ) as period_type,
      coalesce(r.raw_data->>'period_label', df.period_label, r.quinzena, '') as period_label,
      r.tipo as tipo_operacional
    from public.gestao_pacotes_records r
    left join public.dashboard_files df
      on df.id = r.file_id
     and (
       df.file_type = ${GESTAO_PACOTES_FILE_TYPE}
       or coalesce(df.metadata->>'module_key', df.metadata->>'dashboard_module_key') = ${GESTAO_PACOTES_MODULE_KEY}
     )
    where r.module_key = ${GESTAO_PACOTES_MODULE_KEY}
    order by r.created_at desc nulls last, r.data desc nulls last, r.id desc
  `;
}

function buildGestaoPacotesFilterOptions(rows = []) {
  const months = new Map();
  const values = {
    periods: new Set(),
    types: new Set(),
    categories: new Set(),
    bases: new Set(),
    drivers: new Set(),
    statuses: new Set(),
  };
  for (const row of rows) {
    const monthKey = parsePackageMonthKey(row);
    if (monthKey && !months.has(monthKey)) months.set(monthKey, { key: monthKey, label: row.competencia || monthKey });
    const period = normalizePackagePeriod(row.period_type || row.quinzena);
    if (period !== 'month') values.periods.add(period);
    if (row.tipo_operacional || row.tipo) values.types.add(row.tipo_operacional || row.tipo);
    if (row.categoria_final || row.desconto) {
      const category = row.categoria_final || row.desconto;
      values.categories.add(category);
      values.statuses.add(category);
    }
    if (row.base || row.codigo_base) values.bases.add(row.base || row.codigo_base);
    if (row.driver || row.driver_normalizado) values.drivers.add(row.driver || row.driver_normalizado);
  }
  const toOptions = (set) => Array.from(set).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  return {
    months: Array.from(months.values()).sort((a, b) => a.key.localeCompare(b.key)),
    periods: toOptions(values.periods),
    types: toOptions(values.types),
    categories: toOptions(values.categories).map((value) => ({ value, label: packageCategoryLabel(value) })),
    statuses: toOptions(values.statuses).map((value) => ({ value, label: packageCategoryLabel(value) })),
    bases: toOptions(values.bases),
    drivers: toOptions(values.drivers),
  };
}

async function fetchGestaoPacotesFiles(sql) {
  const [dashboardRows, processedRows] = await Promise.all([
    sql`
      select *
      from public.dashboard_files
      where file_type = ${GESTAO_PACOTES_FILE_TYPE}
         or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${GESTAO_PACOTES_MODULE_KEY}
      order by created_at desc nulls last, id desc
    `,
    sql`
      select *
      from public.processed_dashboard_files
      where module_key = ${GESTAO_PACOTES_MODULE_KEY}
      order by processed_at desc nulls last, created_at desc nulls last, id desc
    `,
  ]);
  return { dashboardRows, processedRows };
}

async function handleGestaoPacotesDelete(sql, payload, profile) {
  if (!canMutate(profile)) throw new Error('Apenas administradores podem excluir Gestão de Pacotes.');
  const ids = normalizeIdList(payload.ids);
  if (!ids.length) {
    return {
      data: { removedRows: 0, removedProcessedMetadata: 0, changedDashboardMetadata: 0, ids: [] },
      error: null,
    };
  }
  const isListOnly = payload.mode === 'listOnly' || payload.mode === 'list-only';
  const mode = isListOnly ? 'list-only' : 'with-data';
  const now = new Date().toISOString();
  return sql.begin(async (transaction) => {
    const dashboardRows = await transaction`
      select id, file_name, storage_path, metadata
      from public.dashboard_files
      where id in ${transaction(ids)}
        and (
          file_type = ${GESTAO_PACOTES_FILE_TYPE}
          or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${GESTAO_PACOTES_MODULE_KEY}
        )
    `;
    const fileNames = normalizeIdList(dashboardRows.map((row) => row.file_name || row.metadata?.original_name));
    const fileHashes = normalizeIdList(dashboardRows.map((row) => row.metadata?.file_hash));
    const storagePaths = normalizeIdList(dashboardRows.map((row) => row.storage_path || row.metadata?.storage_path));
    let removedRows = 0;
    let removedProcessedMetadata = 0;
    let changedDashboardMetadata = 0;

    if (!isListOnly) {
      const deletedRows = await transaction`
        delete from public.gestao_pacotes_records
        where module_key = ${GESTAO_PACOTES_MODULE_KEY}
          and file_id in ${transaction(ids)}
        returning id
      `;
      removedRows = deletedRows.length;

      const deletedProcessed = (fileNames.length || fileHashes.length || storagePaths.length)
        ? await transaction`
          delete from public.processed_dashboard_files
          where module_key = ${GESTAO_PACOTES_MODULE_KEY}
            and (
              (${fileNames.length > 0} and file_name in ${transaction(fileNames.length ? fileNames : ['__none__'])})
              or (${fileHashes.length > 0} and file_hash in ${transaction(fileHashes.length ? fileHashes : ['__none__'])})
              or (${storagePaths.length > 0} and storage_path in ${transaction(storagePaths.length ? storagePaths : ['__none__'])})
            )
          returning id
        `
        : [];
      removedProcessedMetadata = deletedProcessed.length;

      const deletedDashboard = await transaction`
        delete from public.dashboard_files
        where id in ${transaction(ids)}
          and (
            file_type = ${GESTAO_PACOTES_FILE_TYPE}
            or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${GESTAO_PACOTES_MODULE_KEY}
          )
        returning id
      `;
      changedDashboardMetadata = deletedDashboard.length;
    } else {
      const updatedDashboard = await transaction`
        update public.dashboard_files
        set is_active = false,
            status = 'removed_from_history',
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
              'hidden_from_history', true,
              'removed_from_history', true,
              'removed_from_history_at', ${now},
              'removal_mode', ${mode}
            ),
            updated_at = ${now}
        where id in ${transaction(ids)}
          and (
            file_type = ${GESTAO_PACOTES_FILE_TYPE}
            or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${GESTAO_PACOTES_MODULE_KEY}
          )
        returning id
      `;
      changedDashboardMetadata = updatedDashboard.length;

      if (fileNames.length || fileHashes.length || storagePaths.length) {
        const updatedProcessed = await transaction`
          update public.processed_dashboard_files
          set status = 'removed_from_history',
              metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                'hidden_from_history', true,
                'removed_from_history', true,
                'removed_from_history_at', ${now},
                'removal_mode', ${mode}
              )
          where module_key = ${GESTAO_PACOTES_MODULE_KEY}
            and (
              (${fileNames.length > 0} and file_name in ${transaction(fileNames.length ? fileNames : ['__none__'])})
              or (${fileHashes.length > 0} and file_hash in ${transaction(fileHashes.length ? fileHashes : ['__none__'])})
              or (${storagePaths.length > 0} and storage_path in ${transaction(storagePaths.length ? storagePaths : ['__none__'])})
            )
          returning id
        `;
        removedProcessedMetadata = updatedProcessed.length;
      }
    }

    return {
      data: {
        removedRows,
        removedProcessedMetadata,
        changedDashboardMetadata,
        ids: dashboardRows.map((row) => row.id),
      },
      error: null,
    };
  });
}

async function handleGestaoPacotesApi(sql, pathname, payload, authUser, profile) {
  const filters = normalizePackageFilters(payload);

  if (pathname === '/api/gestao-pacotes/table') {
    const rows = sortGestaoPacotesRows(filterGestaoPacotesRows(await fetchGestaoPacotesRows(sql), filters), filters);
    const page = paginatePackageRows(rows, filters);
    return { data: { ...page, filtered: rows.length, generated_at: new Date().toISOString() }, error: null };
  }

  if (pathname === '/api/gestao-pacotes/summary') {
    const rows = filterGestaoPacotesRows(await fetchGestaoPacotesRows(sql), filters);
    return { data: { ...buildGestaoPacotesSummary(rows), totalFiltered: rows.length }, error: null };
  }

  if (pathname === '/api/gestao-pacotes/filters') {
    const rows = filterGestaoPacotesRows(await fetchGestaoPacotesRows(sql), filters);
    return { data: buildGestaoPacotesFilterOptions(rows), error: null };
  }

  if (pathname === '/api/gestao-pacotes/export' || pathname === '/api/gestao-pacotes/report') {
    const rows = sortGestaoPacotesRows(filterGestaoPacotesRows(await fetchGestaoPacotesRows(sql), filters), filters);
    return {
      data: {
        rows,
        total: rows.length,
        summary: buildGestaoPacotesSummary(rows),
        generated_at: new Date().toISOString(),
      },
      error: null,
    };
  }

  if (pathname === '/api/gestao-pacotes/files') {
    const { dashboardRows, processedRows } = await fetchGestaoPacotesFiles(sql);
    return { data: { rows: dashboardRows, dashboard_files: dashboardRows, processed_dashboard_files: processedRows }, error: null };
  }

  if (pathname === '/api/gestao-pacotes/existing-keys') {
    const keys = normalizeIdList(payload.keys);
    if (!keys.length) return { data: { keys: [] }, error: null };
    const rows = await sql`
      select dedupe_key
      from public.gestao_pacotes_records
      where module_key = ${GESTAO_PACOTES_MODULE_KEY}
        and dedupe_key in ${sql(keys)}
    `;
    return { data: { keys: rows.map((row) => row.dedupe_key).filter(Boolean) }, error: null };
  }

  if (pathname === '/api/gestao-pacotes/delete') {
    return handleGestaoPacotesDelete(sql, payload, profile);
  }

  return null;
}

function normalizePnrApiPayload(payload = {}) {
  const filters = payload.filters && typeof payload.filters === 'object' ? payload.filters : payload;
  const readList = (...keys) => {
    for (const key of keys) {
      if (Array.isArray(filters[key])) return normalizeIdList(filters[key]);
      if (Array.isArray(payload[key])) return normalizeIdList(payload[key]);
    }
    return [];
  };
  const rawPage = Number(filters.p_page || filters.page || payload.page || 1);
  const rawPageSize = Number(filters.p_page_size || filters.pageSize || payload.pageSize || 15);
  return {
    p_file_ids: readList('p_file_ids', 'fileIds', 'file_ids'),
    p_month_keys: readList('p_month_keys', 'monthKeys', 'months'),
    p_quinzenas: readList('p_quinzenas', 'quinzenas', 'periods'),
    p_statuses: readList('p_statuses', 'statuses', 'status'),
    p_tipos: readList('p_tipos', 'tipos', 'types'),
    p_estacoes: readList('p_estacoes', 'estacoes', 'origins', 'bases'),
    p_status_motoristas: readList('p_status_motoristas', 'statusMotoristas', 'status_motoristas'),
    p_fontes: readList('p_fontes', 'fontes', 'fontesCruzamento', 'fontes_cruzamento'),
    p_motoristas: readList('p_motoristas', 'motoristas', 'drivers'),
    p_rotas: readList('p_rotas', 'rotas', 'routes'),
    p_search: String(filters.p_search || filters.search || filters.query || payload.search || '').trim(),
    p_page: Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : 1,
    p_page_size: Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.trunc(rawPageSize) : 15,
    p_sort_key: String(filters.p_sort_key || filters.sortKey || payload.sortKey || '').trim(),
    p_sort_dir: String(filters.p_sort_dir || filters.sortDir || payload.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc',
  };
}

function getPnrOrderClause(args = {}) {
  const direction = args.p_sort_dir === 'asc' ? 'asc' : 'desc';
  const defaultTail = 'r.month_key desc nulls last, r.quinzena_key desc nulls last, r.data_caso desc nulls last, r.id desc';
  const sortClauses = {
    valorCompraNumerico: `r.valor_compra ${direction} nulls last, ${defaultTail}`,
    statusNormalizado: `r.status_normalizado ${direction} nulls last, ${defaultTail}`,
    estacaoOrigem: `r.estacao_origem ${direction} nulls last, ${defaultTail}`,
    dataEncerramentoCaso: `r.data_encerramento_caso ${direction} nulls last, ${defaultTail}`,
    dataEntrega: `r.data_entrega ${direction} nulls last, ${defaultTail}`,
    idEnvio: `r.id_envio ${direction} nulls last, ${defaultTail}`,
  };
  return sortClauses[args.p_sort_key] || defaultTail;
}

async function callDesviosPnrRpc(sql, name, args, authUser) {
  return handleRpc(sql, { name, args }, authUser);
}

function getPnrRecordFilterWhereClause() {
  return `
    r.module_key = $1
    and (coalesce(cardinality($2::uuid[]), 0) = 0 or r.file_id = any($2::uuid[]))
    and (coalesce(cardinality($3::text[]), 0) = 0 or r.month_key = any($3::text[]))
    and (coalesce(cardinality($4::text[]), 0) = 0 or r.quinzena_key = any($4::text[]))
    and (coalesce(cardinality($5::text[]), 0) = 0 or coalesce(nullif(r.status_normalizado, ''), 'Indefinido') = any($5::text[]))
    and (coalesce(cardinality($6::text[]), 0) = 0 or coalesce(nullif(r.tipo_base, ''), nullif(r.tipo_operacional, ''), 'Não identificada') = any($6::text[]))
    and (coalesce(cardinality($7::text[]), 0) = 0 or coalesce(nullif(r.estacao_origem, ''), 'Sem estação') = any($7::text[]))
    and (coalesce(cardinality($8::text[]), 0) = 0 or coalesce(nullif(r.status_motorista, ''), 'Não identificado') = any($8::text[]))
    and (coalesce(cardinality($9::text[]), 0) = 0 or coalesce(nullif(r.fonte_cruzamento, ''), 'Não identificada') = any($9::text[]))
    and (coalesce(cardinality($10::text[]), 0) = 0 or coalesce(nullif(r.motorista_display, ''), nullif(r.nome_motorista, ''), nullif(r.id_motorista, ''), 'Sem motorista') = any($10::text[]))
    and (coalesce(cardinality($11::text[]), 0) = 0 or coalesce(nullif(r.id_rota, ''), 'Sem rota') = any($11::text[]))
    and (
      coalesce(btrim($12::text), '') = ''
      or concat_ws(' ',
        r.competencia,
        r.quinzena,
        r.status_normalizado,
        r.tipo_base,
        r.tipo_operacional,
        r.estacao_origem,
        r.status_motorista,
        r.fonte_cruzamento,
        r.id_envio,
        r.id_motorista,
        r.id_rota,
        r.id_reclamacao,
        r.id::text,
        r.comentario_encerramento,
        r.nome_motorista,
        r.motorista_display
      ) ilike '%' || btrim($12::text) || '%'
    )
  `;
}

function getPnrRecordFilterParams(args = {}) {
  return [
    DESVIOS_PNR_MODULE_KEY,
    args.p_file_ids,
    args.p_month_keys,
    args.p_quinzenas,
    args.p_statuses,
    args.p_tipos,
    args.p_estacoes,
    args.p_status_motoristas,
    args.p_fontes,
    args.p_motoristas,
    args.p_rotas,
    args.p_search,
  ];
}

async function fetchDesviosPnrExportRows(sql, args = {}) {
  const limit = Math.min(Math.max(Number(args.limit || args.pageSize || PNR_EXPORT_MAX_ROWS), 1), PNR_EXPORT_MAX_ROWS);
  const orderClause = getPnrOrderClause(args);
  const whereClause = getPnrRecordFilterWhereClause();
  return sql.unsafe(
    `
      select
        r.id,
        r.file_id,
        r.dedupe_key,
        r.module_key,
        r.competencia,
        r.quinzena,
        r.tipo,
        r.status_original,
        r.status_normalizado,
        r.status_previous,
        r.status_current,
        r.status_updated_at,
        r.status_updated_by,
        r.manual_status_override,
        r.periodo_faturamento,
        r.periodo_faturamento_original,
        r.mes,
        r.ano,
        r.month_key,
        r.quinzena_key,
        r.quinzena_ref,
        r.periodo_label,
        r.source_file_name,
        r.source_periodo,
        r.data_pedido_revisao,
        r.pedido_revisao,
        r.data_encerramento_caso,
        r.rep_assistente,
        r.comentario_encerramento,
        r.numero_pre_fatura,
        r.id_envio,
        r.produtos,
        r.valor_compra,
        r.rep_transportadora,
        r.id_transportadora,
        r.transportadora,
        r.estacao_origem,
        r.tipo_ocorrencia,
        r.tipo_base,
        r.tipo_operacional,
        r.base_identificada,
        r.nome_base_operacao,
        r.id_rota,
        r.id_motorista,
        r.nome_motorista,
        r.motorista_display,
        r.status_motorista,
        r.fonte_cruzamento,
        r.observacao_cruzamento,
        r.motorista_match_source,
        r.data_caso,
        r.data_entrega,
        r.id_reclamacao,
        r.data_reclamacao,
        r.created_at
      from public.desvios_pnr_records r
      where ${whereClause}
      order by ${orderClause}
      limit $13::integer
    `,
    [...getPnrRecordFilterParams(args), limit],
  );
}

async function fetchDesviosPnrRecordCount(sql, args = {}) {
  const rows = await sql.unsafe(
    `
      select count(*)::integer as total
      from public.desvios_pnr_records r
      where ${getPnrRecordFilterWhereClause()}
    `,
    getPnrRecordFilterParams(args),
  );
  return Number(rows[0]?.total || 0);
}

async function fetchDesviosPnrRecordSummary(sql, args = {}) {
  const rows = await sql.unsafe(
    `
      with filtered as not materialized (
        select
          r.*,
          (lower(coalesce(r.status_normalizado, '')) like '%fatur%' or lower(coalesce(r.status_normalizado, '')) like '%cobr%') as is_faturado,
          (lower(coalesce(r.status_normalizado, '')) like '%anulad%' or lower(coalesce(r.status_normalizado, '')) like '%cancel%') as is_anulado,
          coalesce(nullif(r.tipo_base, ''), nullif(r.tipo_operacional, ''), 'Não identificada') as tipo_base_label,
          coalesce(nullif(r.estacao_origem, ''), 'Sem estação') as estacao_label,
          coalesce(nullif(r.motorista_display, ''), nullif(r.nome_motorista, ''), nullif(r.id_motorista, ''), 'Sem motorista') as motorista_label,
          case when nullif(r.id_motorista, '') is not null then 'ID: ' || r.id_motorista else '' end as motorista_detail,
          coalesce(nullif(r.id_rota, ''), 'Sem rota') as rota_label
        from public.desvios_pnr_records r
        where ${getPnrRecordFilterWhereClause()}
      ),
      totals as (
        select
          count(*)::integer as total_count,
          coalesce(sum(valor_compra), 0)::numeric as total_value,
          case when count(*) > 0 then coalesce(sum(valor_compra), 0)::numeric / count(*)::numeric else 0 end as avg_value,
          count(*) filter (where is_anulado)::integer as anulado,
          coalesce(sum(valor_compra) filter (where is_anulado), 0)::numeric as valor_anulado,
          count(*) filter (where is_faturado)::integer as faturamento,
          coalesce(sum(valor_compra) filter (where is_faturado), 0)::numeric as valor_faturado,
          count(*) filter (where not is_anulado and not is_faturado)::integer as aberto_analise,
          coalesce(sum(valor_compra) filter (where not is_anulado and not is_faturado), 0)::numeric as valor_aberto_analise
        from filtered
      ),
      status_rows as (
        select coalesce(nullif(status_normalizado, ''), 'Indefinido') as label, count(*)::integer as count, coalesce(sum(valor_compra), 0)::numeric as total_value
        from filtered
        group by coalesce(nullif(status_normalizado, ''), 'Indefinido')
        order by count(*) desc
      ),
      operation_rows as (
        select tipo_base_label as label, count(*)::integer as count
        from filtered
        group by tipo_base_label
        order by count(*) desc
      ),
      station_rows as (
        select estacao_label as label, count(*)::integer as count, coalesce(sum(valor_compra), 0)::numeric as total_value
        from filtered
        group by estacao_label
        order by count(*) desc, coalesce(sum(valor_compra), 0) desc
        limit 10
      ),
      driver_rows as (
        select motorista_label as label, min(motorista_detail) as detail, count(*)::integer as count, coalesce(sum(valor_compra), 0)::numeric as total_value
        from filtered
        group by motorista_label
        order by count(*) desc, coalesce(sum(valor_compra), 0) desc
        limit 10
      ),
      evolution_source as (
        select
          month_key,
          coalesce(nullif(quinzena_key, ''), 'month') as quinzena_key,
          coalesce(min(competencia), month_key) as label,
          count(*)::integer as count,
          coalesce(sum(valor_compra), 0)::numeric as total_value,
          coalesce(sum(valor_compra) filter (where is_anulado), 0)::numeric as valor_anulado,
          coalesce(sum(valor_compra) filter (where is_faturado), 0)::numeric as valor_faturado
        from filtered
        where month_key ~ '^[0-9]{4}-[0-9]{2}$'
        group by month_key, coalesce(nullif(quinzena_key, ''), 'month')
        order by month_key, coalesce(nullif(quinzena_key, ''), 'month')
      )
      select jsonb_build_object(
        'total', (select total_count from totals),
        'summary', jsonb_build_object(
          'count', (select total_count from totals),
          'totalValue', (select total_value from totals),
          'avgValue', (select avg_value from totals),
          'anulado', (select anulado from totals),
          'valorAnulado', (select valor_anulado from totals),
          'faturamento', (select faturamento from totals),
          'valorFaturado', (select valor_faturado from totals),
          'aberto', (select aberto_analise from totals),
          'valorAberto', (select valor_aberto_analise from totals),
          'ticketMedioGeral', case when (select total_count from totals) > 0 then (select total_value from totals) / (select total_count from totals)::numeric else 0 end,
          'ticketMedioFaturado', case when (select faturamento from totals) > 0 then (select valor_faturado from totals) / (select faturamento from totals)::numeric else 0 end,
          'ticketMedioAnulado', case when (select anulado from totals) > 0 then (select valor_anulado from totals) / (select anulado from totals)::numeric else 0 end
        ),
        'statusRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count, 'totalValue', total_value, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from status_rows), '[]'::jsonb),
        'operationRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from operation_rows), '[]'::jsonb),
        'stationRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count, 'totalValue', total_value, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from station_rows), '[]'::jsonb),
        'driverRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'detail', detail, 'count', count, 'totalValue', total_value, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from driver_rows), '[]'::jsonb),
        'evolutionRows', coalesce((select jsonb_agg(jsonb_build_object(
          'key', month_key || '|' || quinzena_key,
          'label', label || case quinzena_key when 'q1' then ' · 1Q' when 'q2' then ' · 2Q' else '' end,
          'year', substring(month_key from 1 for 4)::integer,
          'month', substring(month_key from 6 for 2)::integer,
          'quinzena', quinzena_key,
          'count', count,
          'totalValue', total_value,
          'valorAnulado', valor_anulado,
          'valorFaturado', valor_faturado,
          'saldoValue', valor_anulado - valor_faturado
        ) order by month_key, quinzena_key) from evolution_source), '[]'::jsonb)
      ) as data
    `,
    getPnrRecordFilterParams(args),
  );
  return rows[0]?.data || { total: 0, summary: {}, statusRows: [], operationRows: [], stationRows: [], driverRows: [], evolutionRows: [] };
}

async function fetchDesviosPnrFiles(sql) {
  const [dashboardRows, processedRows] = await Promise.all([
    sql`
      select *
      from public.dashboard_files
      where file_type = ${DESVIOS_PNR_FILE_TYPE}
         or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${DESVIOS_PNR_MODULE_KEY}
      order by created_at desc nulls last, id desc
    `,
    sql`
      select *
      from public.processed_dashboard_files
      where module_key = ${DESVIOS_PNR_MODULE_KEY}
      order by processed_at desc nulls last, created_at desc nulls last, id desc
    `,
  ]);
  return { dashboardRows, processedRows };
}

async function handleDesviosPnrDelete(sql, payload, profile) {
  if (!canMutate(profile)) throw new Error('Apenas administradores podem excluir PNRs.');
  const ids = normalizeIdList(payload.ids);
  if (!ids.length) {
    return {
      data: { removedRows: 0, removedProcessedMetadata: 0, changedDashboardMetadata: 0, ids: [] },
      error: null,
    };
  }
  const isListOnly = payload.mode === 'listOnly' || payload.mode === 'list-only';
  const mode = isListOnly ? 'list-only' : 'with-data';
  const now = new Date().toISOString();
  return sql.begin(async (transaction) => {
    const dashboardRows = await transaction`
      select id, file_name, storage_path, metadata
      from public.dashboard_files
      where id in ${transaction(ids)}
        and (
          file_type = ${DESVIOS_PNR_FILE_TYPE}
          or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${DESVIOS_PNR_MODULE_KEY}
        )
    `;
    const fileNames = normalizeIdList(dashboardRows.map((row) => row.file_name || row.metadata?.original_name));
    const fileHashes = normalizeIdList(dashboardRows.map((row) => row.metadata?.file_hash));
    const storagePaths = normalizeIdList(dashboardRows.map((row) => row.storage_path || row.metadata?.storage_path));
    let removedRows = 0;
    let removedProcessedMetadata = 0;
    let changedDashboardMetadata = 0;

    if (!isListOnly) {
      const deletedRows = await transaction`
        delete from public.desvios_pnr_records
        where module_key = ${DESVIOS_PNR_MODULE_KEY}
          and (file_id in ${transaction(ids)} or upload_batch_id in ${transaction(ids)})
        returning id
      `;
      removedRows = deletedRows.length;

      const deletedProcessed = (fileNames.length || fileHashes.length || storagePaths.length)
        ? await transaction`
          delete from public.processed_dashboard_files
          where module_key = ${DESVIOS_PNR_MODULE_KEY}
            and (
              (${fileNames.length > 0} and file_name in ${transaction(fileNames.length ? fileNames : ['__none__'])})
              or (${fileHashes.length > 0} and file_hash in ${transaction(fileHashes.length ? fileHashes : ['__none__'])})
              or (${storagePaths.length > 0} and storage_path in ${transaction(storagePaths.length ? storagePaths : ['__none__'])})
            )
          returning id
        `
        : [];
      removedProcessedMetadata = deletedProcessed.length;

      const deletedDashboard = await transaction`
        delete from public.dashboard_files
        where id in ${transaction(ids)}
          and (
            file_type = ${DESVIOS_PNR_FILE_TYPE}
            or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${DESVIOS_PNR_MODULE_KEY}
          )
        returning id
      `;
      changedDashboardMetadata = deletedDashboard.length;

      await transaction.unsafe('select public.refresh_desvios_pnr_metrics_summary($1::uuid[])', [ids]);
    } else {
      const updatedDashboard = await transaction`
        update public.dashboard_files
        set is_active = false,
            status = 'removed_from_history',
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
              'hidden_from_history', true,
              'removed_from_history', true,
              'removed_from_history_at', ${now},
              'removal_mode', ${mode}
            ),
            updated_at = ${now}
        where id in ${transaction(ids)}
          and (
            file_type = ${DESVIOS_PNR_FILE_TYPE}
            or coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${DESVIOS_PNR_MODULE_KEY}
          )
        returning id
      `;
      changedDashboardMetadata = updatedDashboard.length;

      if (fileNames.length || fileHashes.length || storagePaths.length) {
        const updatedProcessed = await transaction`
          update public.processed_dashboard_files
          set status = 'removed_from_history',
              metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                'hidden_from_history', true,
                'removed_from_history', true,
                'removed_from_history_at', ${now},
                'removal_mode', ${mode}
              )
          where module_key = ${DESVIOS_PNR_MODULE_KEY}
            and (
              (${fileNames.length > 0} and file_name in ${transaction(fileNames.length ? fileNames : ['__none__'])})
              or (${fileHashes.length > 0} and file_hash in ${transaction(fileHashes.length ? fileHashes : ['__none__'])})
              or (${storagePaths.length > 0} and storage_path in ${transaction(storagePaths.length ? storagePaths : ['__none__'])})
            )
          returning id
        `;
        removedProcessedMetadata = updatedProcessed.length;
      }
    }

    return {
      data: {
        removedRows,
        removedProcessedMetadata,
        changedDashboardMetadata,
        ids: dashboardRows.map((row) => row.id),
      },
      error: null,
    };
  });
}

async function handleDesviosPnrApi(sql, pathname, payload, authUser, profile) {
  const args = normalizePnrApiPayload(payload);

  if (pathname === '/api/desvios-pnr/summary') {
    const result = await callDesviosPnrRpc(sql, 'desvios_pnr_summary', args, authUser);
    if (!args.p_search) return result;
    const exactSummary = await fetchDesviosPnrRecordSummary(sql, args);
    return {
      data: {
        ...(result.data || {}),
        ...exactSummary,
        monthOptions: result.data?.monthOptions || [],
        filterOptions: result.data?.filterOptions || {},
      },
      error: result.error || null,
    };
  }

  if (pathname === '/api/desvios-pnr/table') {
    const result = await callDesviosPnrRpc(sql, 'desvios_pnr_table', args, authUser);
    const exactTotal = args.p_search ? await fetchDesviosPnrRecordCount(sql, args) : Number(result.data?.total || 0);
    return {
      data: {
        ...(result.data || {}),
        page: args.p_page,
        pageSize: Math.min(Math.max(args.p_page_size, 10), 100),
        total: exactTotal,
        filtered: exactTotal,
        generated_at: new Date().toISOString(),
      },
      error: result.error || null,
    };
  }

  if (pathname === '/api/desvios-pnr/filters') {
    const result = await callDesviosPnrRpc(sql, 'desvios_pnr_summary', args, authUser);
    return {
      data: {
        filterOptions: result.data?.filterOptions || {},
        monthOptions: result.data?.monthOptions || [],
      },
      error: result.error || null,
    };
  }

  if (pathname === '/api/desvios-pnr/temporal-chart') {
    const result = await callDesviosPnrRpc(sql, 'desvios_pnr_summary', args, authUser);
    const summaryPayload = args.p_search ? await fetchDesviosPnrRecordSummary(sql, args) : result.data;
    const rows = Array.isArray(summaryPayload?.evolutionRows) ? summaryPayload.evolutionRows : [];
    const totals = rows.reduce((acc, row) => {
      acc.valorAnulado += Number(row.valorAnulado || row.valor_anulado || 0);
      acc.valorFaturado += Number(row.valorFaturado || row.valor_faturado || 0);
      return acc;
    }, { valorAnulado: 0, valorFaturado: 0 });
    totals.saldo = totals.valorAnulado - totals.valorFaturado;
    return { data: { rows, evolutionRows: rows, totals, generated_at: new Date().toISOString() }, error: result.error || null };
  }

  if (pathname === '/api/desvios-pnr/export' || pathname === '/api/desvios-pnr/report') {
    const [rows, summary] = await Promise.all([
      fetchDesviosPnrExportRows(sql, args),
      callDesviosPnrRpc(sql, 'desvios_pnr_summary', args, authUser),
    ]);
    const summaryPayload = args.p_search ? await fetchDesviosPnrRecordSummary(sql, args) : summary.data;
    return {
      data: {
        rows,
        total: rows.length,
        summary: summaryPayload?.summary || {},
        evolutionRows: summaryPayload?.evolutionRows || [],
        generated_at: new Date().toISOString(),
        truncated: rows.length >= PNR_EXPORT_MAX_ROWS,
      },
      error: null,
    };
  }

  if (pathname === '/api/desvios-pnr/update-status') {
    const recordId = String(payload.id || payload.recordId || payload.p_record_id || '').trim();
    const status = String(payload.status || payload.value || payload.p_status || '').trim();
    if (!recordId || !status) throw new Error('ID e status do PNR sao obrigatorios.');
    const result = await callDesviosPnrRpc(sql, 'update_desvios_pnr_status', {
      p_record_id: recordId,
      p_status: status,
    }, authUser);
    return { data: { row: result.data, updated_by: authUser.email || authUser.id }, error: result.error || null };
  }

  if (pathname === '/api/desvios-pnr/files') {
    const { dashboardRows, processedRows } = await fetchDesviosPnrFiles(sql);
    return { data: { rows: dashboardRows, dashboard_files: dashboardRows, processed_dashboard_files: processedRows }, error: null };
  }

  if (pathname === '/api/desvios-pnr/existing-keys') {
    const keys = normalizeIdList(payload.keys);
    if (!keys.length) return { data: { keys: [] }, error: null };
    const rows = await sql`
      select dedupe_key
      from public.desvios_pnr_records
      where module_key = ${DESVIOS_PNR_MODULE_KEY}
        and dedupe_key in ${sql(keys)}
    `;
    return { data: { keys: rows.map((row) => row.dedupe_key).filter(Boolean) }, error: null };
  }

  if (pathname === '/api/desvios-pnr/delete') {
    return handleDesviosPnrDelete(sql, payload, profile);
  }

  return null;
}

async function fetchMissingPackageRows(sql) {
  return sql`
    select *
    from public.gestao_desvios_pacotes_faltantes
    order by imported_at desc nulls last, updated_at desc nulls last, id desc
  `;
}

async function handleMissingPackagesApi(sql, pathname, payload, authUser, profile) {
  if (pathname === '/api/pacotes-faltantes/table' || pathname === '/api/pacotes-faltantes/export' || pathname === '/api/pacotes-faltantes/report') {
    const rows = await fetchMissingPackageRows(sql);
    return { data: { rows }, error: null };
  }

  if (pathname === '/api/pacotes-faltantes/summary') {
    const rows = await sql`
      select
        count(*)::int as total,
        count(*) filter (where status_caso = 'Pendente')::int as pendentes,
        count(*) filter (where status_caso = 'Em rota')::int as em_rota,
        count(*) filter (where status_caso = 'Concluído' or status_contato_meli = 'Concluído')::int as concluidos,
        count(*) filter (where status_contato_meli = 'E-mail Enviado')::int as email_enviado,
        count(*) filter (where status_contato_meli = 'Aguardando MELI')::int as aguardando_meli
      from public.gestao_desvios_pacotes_faltantes
    `;
    return { data: rows[0] || {}, error: null };
  }

  if (pathname === '/api/pacotes-faltantes/existing-keys') {
    const keys = normalizeIdList(payload.keys);
    if (!keys.length) return { data: { keys: [] }, error: null };
    const rows = await sql`
      select dedupe_key
      from public.gestao_desvios_pacotes_faltantes
      where dedupe_key in ${sql(keys)}
    `;
    return { data: { keys: rows.map((row) => row.dedupe_key).filter(Boolean) }, error: null };
  }

  if (pathname === '/api/pacotes-faltantes/update-status') {
    const id = String(payload.id || '').trim();
    const type = payload.type === 'meli' ? 'meli' : 'case';
    if (!id) throw new Error('ID do pacote faltante ausente.');
    const now = new Date().toISOString();
    const value = type === 'meli'
      ? normalizeMissingPackageMeliStatus(payload.value)
      : normalizeMissingPackageCaseStatus(payload.value);
    const rows = type === 'meli'
      ? await sql`
        update public.gestao_desvios_pacotes_faltantes
        set status_contato_meli = ${value},
            situacao_prazo = coalesce(${payload.situacao_prazo || null}, situacao_prazo),
            contato_updated_at = ${now},
            updated_at = ${now}
        where id = ${id}
        returning *
      `
      : await sql`
        update public.gestao_desvios_pacotes_faltantes
        set status_caso = ${value},
            situacao_prazo = coalesce(${payload.situacao_prazo || null}, situacao_prazo),
            status_updated_at = ${now},
            updated_at = ${now}
        where id = ${id}
        returning *
      `;
    if (rows.length !== 1) throw new Error('Nenhum pacote faltante foi atualizado.');
    return { data: { row: rows[0], updated_by: authUser.email || authUser.id }, error: null };
  }

  if (pathname === '/api/pacotes-faltantes/delete') {
    if (!canMutate(profile)) throw new Error('Apenas administradores podem excluir Pacotes Faltantes.');
    const ids = normalizeIdList(payload.ids);
    if (!ids.length) return { data: { deleted: 0, ids: [] }, error: null };
    const rows = await sql`
      delete from public.gestao_desvios_pacotes_faltantes
      where id in ${sql(ids)}
      returning id
    `;
    return { data: { deleted: rows.length, ids: rows.map((row) => row.id) }, error: null };
  }

  return null;
}

async function handleFilesApi(sql, pathname, payload) {
  if (pathname !== '/api/files/list') return null;
  const moduleKey = String(payload.module_key || '').trim();
  const rows = moduleKey
    ? await sql`
      select *
      from public.dashboard_files
      where coalesce(metadata->>'module_key', metadata->>'dashboard_module_key') = ${moduleKey}
      order by created_at desc nulls last, id desc
    `
    : await sql`
      select *
      from public.dashboard_files
      order by created_at desc nulls last, id desc
    `;
  return { data: { rows }, error: null };
}

function createDynamicConfig(publicConfig, port) {
  const dataSource = process.env.DATA_SOURCE || 'railway_staging';
  return `window.APP_CONFIG = ${JSON.stringify({
    SUPABASE_URL: publicConfig.SUPABASE_URL,
    SUPABASE_ANON_KEY: publicConfig.SUPABASE_ANON_KEY,
    RAILWAY_STAGING_API_URL: `http://127.0.0.1:${port}${API_PREFIX}`,
    RAILWAY_API_URL: `http://127.0.0.1:${port}${MODULE_API_PREFIX}`,
    RAILWAY_STAGING_MODE: true,
    DATA_SOURCE: dataSource,
    OPERATIONAL_FREEZE: isOperationalFreezeEnabled(),
    OPERATIONAL_FREEZE_MESSAGE,
  }, null, 2)};\n`;
}

function serveStatic(request, response, publicConfig, port) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  if (pathname === '/config.js') {
    sendText(response, 200, createDynamicConfig(publicConfig, port), 'application/javascript; charset=utf-8');
    return;
  }

  const filePath = path.resolve(PROJECT_ROOT, `.${pathname}`);
  if (!filePath.startsWith(PROJECT_ROOT)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(response, 404, 'Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    'content-type': MIME_TYPES[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(response);
}

const envInfo = loadRailwayEnv(args);
const port = args.int('port', DEFAULT_PORT);
const publicConfig = readPublicConfig();

scriptHeader('Railway staging dashboard server', [
  `Env file: ${envInfo.loaded ? envInfo.envFile : '(nao encontrado; usando ambiente atual)'}`,
  `Porta: ${port}`,
  'Modo: dados no Railway staging, Auth real no Supabase.',
]);

if (!publicConfig.SUPABASE_URL || !publicConfig.SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL/SUPABASE_ANON_KEY publicos ausentes para Auth no staging.');
}

const railwayUrl = requireEnv('RAILWAY_DATABASE_URL');
const target = assertRailwayWriteTarget(railwayUrl, args);
console.log(`Railway target: ${target.host}/${target.database}`);

const sql = createSql(railwayUrl, {
  max: 5,
});

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === `${API_PREFIX}/health`) {
      sendJson(response, 200, { ok: true, target, operationalFreeze: isOperationalFreezeEnabled() });
      return;
    }

    if (url.pathname === `${MODULE_API_PREFIX}/health`) {
      sendJson(response, 200, { ok: true, target, dataSource: process.env.DATA_SOURCE || 'railway_staging', operationalFreeze: isOperationalFreezeEnabled() });
      return;
    }

    if (url.pathname.startsWith(API_PREFIX)) {
      if (request.method !== 'POST') {
        sendJson(response, 405, { data: null, error: { message: 'Method not allowed' } });
        return;
      }

      const authUser = await verifyAuthUser(request, publicConfig);
      if (!authUser) {
        sendJson(response, 401, { data: null, error: { message: 'Sessao Supabase invalida ou ausente.' } });
        return;
      }

      const payload = await readBody(request);
      const result = url.pathname === `${API_PREFIX}/query`
        ? await handleQuery(sql, payload)
        : url.pathname === `${API_PREFIX}/rpc`
          ? await handleRpc(sql, payload, authUser)
          : null;

      if (!result) {
        sendJson(response, 404, { data: null, error: { message: 'Endpoint nao encontrado.' } });
        return;
      }

      sendJson(response, 200, result);
      return;
    }

    if (
      url.pathname.startsWith(`${MODULE_API_PREFIX}/pre-fatura`) ||
      url.pathname.startsWith(`${MODULE_API_PREFIX}/pacotes-faltantes`) ||
      url.pathname.startsWith(`${MODULE_API_PREFIX}/gestao-pacotes`) ||
      url.pathname.startsWith(`${MODULE_API_PREFIX}/desvios-pnr`) ||
      url.pathname.startsWith(`${MODULE_API_PREFIX}/files`)
    ) {
      if (request.method !== 'POST') {
        sendJson(response, 405, { data: null, error: { message: 'Method not allowed' } });
        return;
      }

      const authUser = await verifyAuthUser(request, publicConfig);
      if (!authUser) {
        sendJson(response, 401, { data: null, error: { message: 'Sessao Supabase invalida ou ausente.' } });
        return;
      }

      const [payload, profile] = await Promise.all([
        readBody(request),
        loadProfile(sql, authUser),
      ]);
      if (isWriteEndpoint(url.pathname)) assertOperationalWriteAllowed();
      const result = url.pathname.startsWith(`${MODULE_API_PREFIX}/pre-fatura`)
        ? await handlePreFaturaApi(sql, url.pathname, payload, authUser, profile)
        : url.pathname.startsWith(`${MODULE_API_PREFIX}/pacotes-faltantes`)
          ? await handleMissingPackagesApi(sql, url.pathname, payload, authUser, profile)
          : url.pathname.startsWith(`${MODULE_API_PREFIX}/gestao-pacotes`)
            ? await handleGestaoPacotesApi(sql, url.pathname, payload, authUser, profile)
            : url.pathname.startsWith(`${MODULE_API_PREFIX}/desvios-pnr`)
              ? await handleDesviosPnrApi(sql, url.pathname, payload, authUser, profile)
              : await handleFilesApi(sql, url.pathname, payload, authUser, profile);

      if (!result) {
        sendJson(response, 404, { data: null, error: { message: 'Endpoint nao encontrado.' } });
        return;
      }

      sendJson(response, 200, result);
      return;
    }

    serveStatic(request, response, publicConfig, port);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(response, statusCode, {
      data: null,
      error: {
        message: error.message,
        code: error.name === 'OperationalFreezeError' ? 'OPERATIONAL_FREEZE' : undefined,
      },
    });
  }
});

server.listen(port, '127.0.0.1', () => {
  printCheck('Servidor local Railway staging', true, `http://127.0.0.1:${port}/index.html`);
});

async function shutdown() {
  server.close();
  await closeSql(sql);
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});
