#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import {
  REQUIRED_TABLES,
  assertRailwayWriteTarget,
  closeSql,
  createSql,
  hasUniqueDedupeIndex,
  loadRailwayEnv,
  parseArgs,
  printCheck,
  printHelp,
  printWarn,
  qualifyName,
  requireEnv,
  scriptHeader,
  tableExists,
} from './lib/railway-utils.mjs';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase', 'migrations');

const args = parseArgs();

if (args.has('help')) {
  printHelp('02-apply-schema.mjs', [
    'Aplica migrations no banco Railway vazio ou de staging.',
    'Por seguranca, o padrao e dry-run. Use --apply para executar.',
    'Opcoes especificas:',
    '  --apply                       Executa prelude e migrations no Railway',
    '  --force                       Reaplica migrations mesmo registradas',
  ]);
  process.exit(0);
}

const envInfo = loadRailwayEnv(args);
const apply = args.has('apply') && !args.has('dry-run');

scriptHeader('Railway schema apply', [
  `Modo: ${apply ? 'APPLY' : 'DRY-RUN'}`,
  `Env file: ${envInfo.loaded ? envInfo.envFile : '(nao encontrado; usando ambiente atual)'}`,
  'Producao: Supabase nao recebe escrita; Vercel nao e alterada.',
]);

const ROLE_NAMES = ['anon', 'authenticated', 'service_role'];

const COMPATIBILITY_STATEMENTS = [
  {
    label: 'Extensao pgcrypto',
    sql: 'create extension if not exists pgcrypto',
  },
  {
    label: 'Schema auth',
    sql: 'create schema if not exists auth',
  },
  {
    label: 'Schema storage',
    sql: 'create schema if not exists storage',
  },
  {
    label: 'Schema supabase_migrations',
    sql: 'create schema if not exists supabase_migrations',
  },
  ...ROLE_NAMES.map((roleName) => ({
    label: `Role ${roleName}`,
    sql: `
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = '${roleName}') then
          execute 'create role ${roleName} nologin';
        end if;
      exception
        when insufficient_privilege then
          raise notice 'Sem permissao para criar role ${roleName}. Crie manualmente antes de aplicar migrations.';
      end
      $$;
    `,
  })),
  {
    label: 'Tabela auth.users minima',
    sql: `
      create table if not exists auth.users (
        id uuid primary key default gen_random_uuid(),
        email text unique,
        raw_user_meta_data jsonb not null default '{}'::jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      )
    `,
  },
  {
    label: 'Tabela public.profiles minima',
    sql: `
      create table if not exists public.profiles (
        id uuid primary key references auth.users(id) on delete cascade,
        email text unique,
        name text,
        role text not null default 'user',
        is_admin boolean not null default false,
        cargo text,
        setor text not null default 'LOSS',
        avatar_url text,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      )
    `,
  },
  {
    label: 'Funcao auth.uid()',
    sql: `
      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `,
  },
  {
    label: 'Funcao public.is_current_user_admin()',
    sql: `
      create or replace function public.is_current_user_admin()
      returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $$
        select coalesce((
          select p.is_admin
          from public.profiles p
          where p.id = auth.uid()
          limit 1
        ), false)
      $$;
    `,
  },
  {
    label: 'Tabela public.dashboard_files base',
    sql: `
      create table if not exists public.dashboard_files (
        id uuid primary key default gen_random_uuid(),
        file_name text not null,
        storage_path text,
        file_type text not null,
        file_size bigint,
        uploaded_by uuid references auth.users(id) on delete set null,
        uploaded_by_email text,
        reference_month text,
        reference_year text,
        period_label text,
        period_type text,
        is_active boolean not null default false,
        status text not null default 'processing',
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      )
    `,
  },
  {
    label: 'Tabela public.desvios_pnr_metrics_summary base',
    sql: `
      create table if not exists public.desvios_pnr_metrics_summary (
        id bigserial primary key,
        file_id uuid not null,
        month_key text,
        quinzena_key text,
        competencia_label text,
        status_normalizado text,
        tipo_base_label text,
        estacao_origem text,
        status_motorista text,
        fonte_cruzamento text,
        motorista_label text,
        motorista_detail text,
        id_rota text,
        row_count integer not null default 0,
        total_value numeric not null default 0,
        updated_at timestamptz not null default now()
      )
    `,
  },
  {
    label: 'Tabelas storage minimas',
    sql: `
      create table if not exists storage.buckets (
        id text primary key,
        name text not null,
        owner uuid,
        created_at timestamptz default now(),
        updated_at timestamptz default now(),
        public boolean default false
      );

      create table if not exists storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text references storage.buckets(id) on delete cascade,
        name text not null,
        owner uuid,
        metadata jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now(),
        last_accessed_at timestamptz,
        unique (bucket_id, name)
      );
    `,
  },
  {
    label: 'Registro de migrations',
    sql: `
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        statements text[],
        name text,
        inserted_at timestamptz not null default now()
      )
    `,
  },
];

function readMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Diretorio de migrations nao encontrado: ${MIGRATIONS_DIR}`);
  }

  const priority = (fileName) => {
    const orderedPatterns = [
      'create_audit_logs',
      'create_dashboard_settings',
      'create_processed_dashboard_records',
      'create_desvios_pnr_records',
      'add_pnr_enrichment_fields',
      'add_pnr_consolidation_fields',
      'optimize_pnr_dashboard_queries',
      'update_pnr_dashboard_rpc_filters',
      'update_pnr_summary_card_metrics',
      'add_pnr_manual_status_fields',
      'prevent_pnr_metrics_duplicates',
      'update_pnr_manual_status_rpc',
      'compact_pnr_persisted_records',
      'create_processed_dashboard_files',
      'add_file_role_to_processed_dashboard_files',
      'processed_files_storage_flags',
      'create_gestao_desvios_pacotes_faltantes',
      'allow_authenticated_manage_pacotes_faltantes',
      'grant_gestao_desvios_pacotes_faltantes',
      'missing_packages_file_import_metadata',
      'finalize_processed_only_before_railway',
      'fix_missing_packages_business_deadline_incremental',
      'fix_missing_packages_status_and_business_deadline',
      'audit_processed_only_hardening',
      'document_row_count_reconciliation',
    ];
    const index = orderedPatterns.findIndex((pattern) => fileName.includes(pattern));
    return index === -1 ? 10_000 : index;
  };

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => priority(left) - priority(right) || left.localeCompare(right))
    .map((fileName) => {
      const fullPath = path.join(MIGRATIONS_DIR, fileName);
      const version = fileName.replace(/\.sql$/i, '');
      return {
        fileName,
        fullPath,
        version,
        sql: fs.readFileSync(fullPath, 'utf8'),
      };
    });
}

async function getAppliedMigrations(sql) {
  const exists = await tableExists(sql, 'supabase_migrations', 'schema_migrations');
  if (!exists) {
    return new Set();
  }

  const rows = await sql`
    select version
    from supabase_migrations.schema_migrations
  `;

  return new Set(rows.map((row) => row.version));
}

async function ensureCompatibilityPrelude(sql) {
  for (const statement of COMPATIBILITY_STATEMENTS) {
    await sql.unsafe(statement.sql);
    printCheck(statement.label, true);
  }

  const roles = await sql`
    select rolname
    from pg_roles
    where rolname = any(${ROLE_NAMES})
  `;
  const existingRoles = new Set(roles.map((row) => row.rolname));
  const missingRoles = ROLE_NAMES.filter((roleName) => !existingRoles.has(roleName));

  if (missingRoles.length > 0) {
    throw new Error(
      `Roles Supabase ausentes no Railway: ${missingRoles.join(', ')}. Crie-as antes de aplicar as migrations.`,
    );
  }
}

async function applyMigrations(sql, migrations) {
  const applied = await getAppliedMigrations(sql);
  let appliedNow = 0;
  let skipped = 0;

  for (const migration of migrations) {
    if (applied.has(migration.version) && !args.has('force')) {
      skipped += 1;
      printCheck(`Migration ja registrada: ${migration.fileName}`, true, 'skip');
      continue;
    }

    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration.sql);
      await transaction`
        insert into supabase_migrations.schema_migrations (version, statements, name)
        values (${migration.version}, array[${migration.sql}], ${migration.fileName})
        on conflict (version) do update
        set statements = excluded.statements,
            name = excluded.name,
            inserted_at = now()
      `;
    });

    appliedNow += 1;
    printCheck(`Migration aplicada: ${migration.fileName}`, true);
  }

  return {
    appliedNow,
    skipped,
  };
}

async function validateSchema(sql) {
  let failures = 0;

  for (const table of REQUIRED_TABLES) {
    const exists = await tableExists(sql, 'public', table);
    printCheck(`Tabela obrigatoria ${qualifyName('public', table)}`, exists);
    if (!exists) {
      failures += 1;
    }
  }

  for (const table of [
    'pre_fatura_records',
    'gestao_pacotes_records',
    'desvios_pnr_records',
    'gestao_desvios_pacotes_faltantes',
  ]) {
    if (!(await tableExists(sql, 'public', table))) {
      failures += 1;
      continue;
    }

    const ok = await hasUniqueDedupeIndex(sql, table);
    printCheck(`Indice unico module_key + dedupe_key em ${table}`, ok);
    if (!ok) {
      failures += 1;
    }
  }

  const functions = await sql`
    select n.nspname as schema_name, p.proname as function_name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'auth')
      and p.proname in (
        'is_current_user_admin',
        'handle_new_user',
        'update_desvios_pnr_status',
        'processed_dedupe_norm'
      )
    order by n.nspname, p.proname
  `;
  const functionNames = new Set(functions.map((row) => `${row.schema_name}.${row.function_name}`));

  for (const functionName of ['auth.uid', 'public.is_current_user_admin', 'public.handle_new_user']) {
    const exists =
      functionName === 'auth.uid'
        ? (
            await sql`
              select count(*)::int as total
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'auth'
                and p.proname = 'uid'
            `
          )[0].total > 0
        : functionNames.has(functionName);

    printCheck(`Funcao/RPC ${functionName}`, exists);
    if (!exists) {
      failures += 1;
    }
  }

  const triggers = await sql`
    select event_object_table, trigger_name
    from information_schema.triggers
    where trigger_schema in ('public', 'auth')
    order by event_object_table, trigger_name
  `;
  printCheck('Triggers encontrados', triggers.length > 0, `${triggers.length} trigger(s)`);

  const grants = await sql`
    select grantee, table_name, privilege_type
    from information_schema.table_privileges
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated', 'service_role')
    order by grantee, table_name, privilege_type
  `;
  printCheck('Grants publicos Supabase-style', grants.length > 0, `${grants.length} grant(s)`);

  const sequences = await sql`
    select sequence_schema, sequence_name
    from information_schema.sequences
    where sequence_schema = 'public'
    order by sequence_name
  `;
  printCheck('Sequences publicas', true, `${sequences.length} sequence(s)`);

  return failures;
}

let sql;

try {
  const migrations = readMigrations();
  console.log(`Migrations encontradas: ${migrations.length}`);
  for (const migration of migrations) {
    console.log(`  - ${migration.fileName}`);
  }

  if (!apply) {
    printWarn('Dry-run ativo', 'use --apply para aplicar no Railway staging');
    const railwayUrl = process.env.RAILWAY_DATABASE_URL;
    if (railwayUrl) {
      const target = assertRailwayWriteTarget(railwayUrl, args);
      console.log(`Alvo validado: ${target.host}/${target.database}`);
    } else {
      printWarn('RAILWAY_DATABASE_URL ausente', 'dry-run listou migrations sem conectar');
    }
    process.exit(0);
  }

  const railwayUrl = requireEnv('RAILWAY_DATABASE_URL');
  const target = assertRailwayWriteTarget(railwayUrl, args);
  console.log(`Alvo Railway: ${target.host}/${target.database}`);

  sql = createSql(railwayUrl, {
    max: 1,
  });

  await ensureCompatibilityPrelude(sql);
  const result = await applyMigrations(sql, migrations);
  const failures = await validateSchema(sql);

  console.log('');
  console.log(`Migrations aplicadas agora: ${result.appliedNow}`);
  console.log(`Migrations ignoradas por ja estarem registradas: ${result.skipped}`);

  if (failures > 0) {
    process.exitCode = 1;
    printCheck('Resultado final', false, `${failures} validacao(oes) falharam`);
  } else {
    printCheck('Resultado final', true, 'Schema Railway staging pronto para importacao');
  }
} catch (error) {
  process.exitCode = 1;
  printCheck('Schema Railway', false, error.message);
} finally {
  await closeSql(sql);
}
