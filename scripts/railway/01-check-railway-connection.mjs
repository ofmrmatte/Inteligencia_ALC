#!/usr/bin/env node
import {
  assertRailwayWriteTarget,
  assertSupabaseReadOnlyTarget,
  closeSql,
  createSql,
  databaseHost,
  loadRailwayEnv,
  parseArgs,
  printCheck,
  printHelp,
  printWarn,
  redactConnectionString,
  requireEnv,
  scriptHeader,
} from './lib/railway-utils.mjs';

const args = parseArgs();

if (args.has('help')) {
  printHelp('01-check-railway-connection.mjs', [
    'Valida conexao Supabase e Railway, sem criar tabelas permanentes.',
    'Este script cria apenas tabela temporaria no Railway e descarta ao fim da transacao.',
  ]);
  process.exit(0);
}

const envInfo = loadRailwayEnv(args);

scriptHeader('Railway staging connection check', [
  `Env file: ${envInfo.loaded ? envInfo.envFile : '(nao encontrado; usando ambiente atual)'}`,
  'Producao: nenhum write no Supabase, nenhuma alteracao na Vercel.',
]);

let supabaseSql;
let railwaySql;
let hasFailure = false;

async function inspectReadConnection(label, sql) {
  const result = {
    ok: false,
    details: {},
  };

  try {
    const [version] = await sql`select version() as version`;
    const [identity] = await sql`
      select current_database() as database,
             current_user as user,
             current_setting('server_encoding') as encoding,
             current_setting('timezone') as timezone,
             current_setting('transaction_read_only') as read_only
    `;
    const extensions = await sql`
      select extname, extversion
      from pg_extension
      where extname in ('plpgsql', 'pgcrypto', 'uuid-ossp')
      order by extname
    `;

    result.ok = true;
    result.details = {
      version: version.version,
      identity,
      extensions,
    };

    printCheck(`${label}: conexao`, true, `${identity.database} como ${identity.user}`);
    console.log(`  Versao: ${version.version}`);
    console.log(`  Timezone: ${identity.timezone}`);
    console.log(`  Encoding: ${identity.encoding}`);
    console.log(`  transaction_read_only: ${identity.read_only}`);

    const extensionNames = new Set(extensions.map((extension) => extension.extname));
    if (!extensionNames.has('pgcrypto')) {
      printWarn(`${label}: extensao pgcrypto ausente`, '02-apply-schema tenta criar antes das migrations');
    } else {
      printCheck(`${label}: extensao pgcrypto`, true);
    }
  } catch (error) {
    result.details.error = error.message;
    printCheck(`${label}: conexao`, false, error.message);
  }

  return result;
}

async function inspectRailwayWritable(sql) {
  try {
    await sql.begin(async (transaction) => {
      await transaction`
        create temporary table codex_railway_connection_test (
          id int primary key,
          checked_at timestamptz default now()
        ) on commit drop
      `;
      await transaction`insert into codex_railway_connection_test (id) values (1)`;
      const [row] = await transaction`select count(*)::int as total from codex_railway_connection_test`;
      if (Number(row.total) !== 1) {
        throw new Error('Tabela temporaria nao retornou a linha esperada.');
      }
    });

    printCheck('Railway: permissao de escrita temporaria', true);
    return true;
  } catch (error) {
    printCheck('Railway: permissao de escrita temporaria', false, error.message);
    return false;
  }
}

try {
  const supabaseUrl = requireEnv('SUPABASE_DB_URL');
  const railwayUrl = requireEnv('RAILWAY_DATABASE_URL');

  const supabaseTarget = assertSupabaseReadOnlyTarget(supabaseUrl);
  const railwayTarget = assertRailwayWriteTarget(railwayUrl, args);

  console.log(`Supabase host: ${supabaseTarget.host}`);
  console.log(`Railway host: ${railwayTarget.host}`);
  console.log(`Railway database: ${railwayTarget.database}`);
  console.log(`Railway URL: ${redactConnectionString(railwayUrl)}`);

  if (databaseHost(supabaseUrl) === databaseHost(railwayUrl)) {
    throw new Error('SUPABASE_DB_URL e RAILWAY_DATABASE_URL apontam para o mesmo host.');
  }

  supabaseSql = createSql(supabaseUrl, {
    max: 1,
  });
  railwaySql = createSql(railwayUrl, {
    max: 1,
  });

  const supabaseResult = await inspectReadConnection('Supabase', supabaseSql);
  const railwayResult = await inspectReadConnection('Railway', railwaySql);
  const railwayTempWriteOk = await inspectRailwayWritable(railwaySql);

  if (!supabaseResult.ok || !railwayResult.ok || !railwayTempWriteOk) {
    hasFailure = true;
  }
} catch (error) {
  hasFailure = true;
  printCheck('Railway staging connection check', false, error.message);
} finally {
  await closeSql(supabaseSql);
  await closeSql(railwaySql);
}

if (hasFailure) {
  process.exitCode = 1;
} else {
  printCheck('Resultado final', true, 'Supabase legivel e Railway acessivel para staging');
}
