import { CANONICAL_MODULES, bytesToHuman, collect, createSql, printSection, writeAuditReport } from "./audit-utils.mjs";

const sql = createSql();

try {
  const report = {
    generatedAt: new Date().toISOString(),
    checks: [],
  };

  report.checks.push(await collect("database_status", () => sql.unsafe(`
    select current_database() as database_name,
      current_user,
      current_setting('transaction_read_only') as transaction_read_only,
      pg_database_size(current_database())::bigint as total_bytes,
      pg_size_pretty(pg_database_size(current_database())) as total_size
  `)));

  report.checks.push(await collect("public_table_sizes", () => sql.unsafe(`
    select c.relname,
      pg_total_relation_size(c.oid)::bigint as total_bytes,
      pg_relation_size(c.oid)::bigint as table_bytes,
      pg_indexes_size(c.oid)::bigint as index_bytes,
      coalesce(s.n_live_tup, 0)::bigint as estimated_live_rows,
      coalesce(s.n_dead_tup, 0)::bigint as estimated_dead_rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by pg_total_relation_size(c.oid) desc
  `)));

  report.checks.push(await collect("storage_buckets", () => sql.unsafe(`
    select b.id, b.name, b.public, b.file_size_limit, b.allowed_mime_types,
      count(o.name)::bigint as objects,
      coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as bytes
    from storage.buckets b
    left join storage.objects o on o.bucket_id = b.id
    group by b.id, b.name, b.public, b.file_size_limit, b.allowed_mime_types
    order by b.id
  `)));

  report.checks.push(await collect("dashboard_storage_orphans", () => sql.unsafe(`
    select o.bucket_id, o.name, o.metadata->>'size' as size_bytes, o.created_at, o.updated_at
    from storage.objects o
    left join public.dashboard_files d on d.storage_path = o.name
    left join public.processed_dashboard_files p on p.storage_path = o.name
    where o.bucket_id = 'dashboard-files'
      and d.id is null
      and p.id is null
    order by o.updated_at desc nulls last
  `)));

  report.checks.push(await collect("module_counts", () => sql.unsafe(`
    ${CANONICAL_MODULES.map((moduleConfig) => `
      select '${moduleConfig.tableName}' as table_name, module_key, count(*)::bigint as rows
      from public.${moduleConfig.tableName}
      group by module_key
    `).join(" union all ")}
    order by table_name, module_key
  `)));

  report.checks.push(await collect("rls_tables", () => sql.unsafe(`
    select n.nspname as schema_name, c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  `)));

  report.checks.push(await collect("policies", () => sql.unsafe(`
    select schemaname, tablename, policyname, roles, cmd
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  `)));

  report.checks.push(await collect("functions_rpc", () => sql.unsafe(`
    select n.nspname as schema_name, p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args,
      p.prosecdef as security_definer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'auth')
      and (
        p.proname ilike '%dashboard%' or
        p.proname ilike '%pnr%' or
        p.proname ilike '%user%' or
        p.proname ilike '%pacote%' or
        p.proname ilike '%profile%'
      )
    order by n.nspname, p.proname, args
  `)));

  report.checks.push(await collect("auth_user_triggers", () => sql.unsafe(`
    select event_object_schema, event_object_table, trigger_name,
      action_timing, event_manipulation, action_statement
    from information_schema.triggers
    where event_object_schema = 'auth'
      and event_object_table = 'users'
    order by trigger_name
  `)));

  report.checks.push(await collect("auth_profiles", () => sql.unsafe(`
    select
      (select count(*)::bigint from auth.users) as auth_users,
      (select count(*)::bigint from public.profiles) as profiles,
      (select count(*)::bigint from auth.users u left join public.profiles p on p.id = u.id where p.id is null) as missing_profiles
  `)));

  report.checks.push(await collect("migrations", () => sql.unsafe(`
    select version, name, created_by
    from supabase_migrations.schema_migrations
    order by version desc
  `)));

  const reportPath = await writeAuditReport("supabase-health", report);
  const dbStatus = report.checks.find((item) => item.label === "database_status")?.rows?.[0] || {};
  const storage = report.checks.find((item) => item.label === "storage_buckets")?.rows || [];
  const tableSizes = report.checks.find((item) => item.label === "public_table_sizes")?.rows || [];

  printSection("Supabase health");
  console.log(`Database: ${dbStatus.total_size || bytesToHuman(dbStatus.total_bytes)} read_only=${dbStatus.transaction_read_only}`);
  console.log(`Largest table: ${tableSizes[0]?.relname || "n/a"} (${bytesToHuman(tableSizes[0]?.total_bytes)})`);
  console.log(`Storage: ${storage.map((bucket) => `${bucket.id}:${bucket.objects} objetos/${bytesToHuman(bucket.bytes)}`).join(", ") || "sem buckets"}`);
  console.log(`Relatorio: ${reportPath}`);
} finally {
  await sql.end();
}
