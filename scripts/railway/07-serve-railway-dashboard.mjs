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
const DEFAULT_PORT = 8091;

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
  if (payload.action === 'select') return executeSelect(sql, payload, table);
  if (payload.action === 'insert' || payload.action === 'upsert') return executeInsertLike(sql, payload, table);
  if (payload.action === 'update') return executeUpdate(sql, payload, table);
  if (payload.action === 'delete') return executeDelete(sql, payload, table);
  throw new Error(`Acao nao suportada: ${payload.action}`);
}

async function handleRpc(sql, payload, authUser) {
  const name = sanitizeIdentifier(payload.name, 'rpc');
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

function createDynamicConfig(publicConfig, port) {
  return `window.APP_CONFIG = ${JSON.stringify({
    SUPABASE_URL: publicConfig.SUPABASE_URL,
    SUPABASE_ANON_KEY: publicConfig.SUPABASE_ANON_KEY,
    RAILWAY_STAGING_API_URL: `http://127.0.0.1:${port}${API_PREFIX}`,
    RAILWAY_STAGING_MODE: true,
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
      sendJson(response, 200, { ok: true, target });
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

    serveStatic(request, response, publicConfig, port);
  } catch (error) {
    sendJson(response, 500, {
      data: null,
      error: {
        message: error.message,
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
