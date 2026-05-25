import "dotenv/config";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const applyCleanup = process.env.APPLY_SAFE_DB_CLEANUP === "1";
const runVacuumFull = process.env.RUN_VACUUM_FULL === "1";

if (!databaseUrl) {
  console.error("Configure SUPABASE_DB_URL ou DATABASE_URL para gerar o relatório.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: "require",
});

async function collect(label, query) {
  const start = performance.now();
  try {
    const rows = await query();
    return { label, ms: Math.round(performance.now() - start), rows };
  } catch (error) {
    return {
      label,
      ms: Math.round(performance.now() - start),
      error: error.message,
      code: error.code,
      detail: error.detail,
    };
  }
}

try {
  const report = [];

  report.push(await collect("public_table_sizes", () => sql`
    select
      c.relname,
      pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
      pg_total_relation_size(c.oid) as total_bytes,
      pg_size_pretty(pg_relation_size(c.oid)) as table_size,
      pg_size_pretty(pg_indexes_size(c.oid)) as indexes_size,
      coalesce(s.n_live_tup, 0)::bigint as estimated_live_rows,
      coalesce(s.n_dead_tup, 0)::bigint as estimated_dead_rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public' and c.relkind in ('r','p')
    order by pg_total_relation_size(c.oid) desc
    limit 30
  `));

  report.push(await collect("persisted_module_counts", () => sql`
    select 'pre_fatura_records' as table_name, count(*)::bigint as rows from public.pre_fatura_records
    union all select 'gestao_pacotes_records', count(*)::bigint from public.gestao_pacotes_records
    union all select 'desvios_pnr_records', count(*)::bigint from public.desvios_pnr_records
    union all select 'gestao_desvios_pacotes_faltantes', count(*)::bigint from public.gestao_desvios_pacotes_faltantes
    union all select 'desvios_pnr_metrics_summary', count(*)::bigint from public.desvios_pnr_metrics_summary
    union all select 'dashboard_metrics_cache', count(*)::bigint from public.dashboard_metrics_cache
  `));

  report.push(await collect("processed_dashboard_files", () => sql`
    select module_key, file_name, file_size, competencia, row_count, status, processed_at
    from public.processed_dashboard_files
    order by processed_at desc nulls last
  `));

  report.push(await collect("dashboard_files", () => sql`
    select file_name, file_type, status, file_size, storage_path,
      metadata->>'record_count' as record_count,
      metadata->>'processed_at' as processed_at,
      updated_at
    from public.dashboard_files
    order by updated_at desc nulls last
  `));

  report.push(await collect("pnr_heavy_fields", () => sql`
    select
      count(*)::bigint as rows,
      pg_size_pretty(sum(pg_column_size(raw_data))::bigint) as raw_data_total,
      round(avg(pg_column_size(raw_data))::numeric, 1) as raw_data_avg_bytes,
      max(pg_column_size(raw_data)) as raw_data_max_bytes,
      pg_size_pretty(sum(pg_column_size(produtos))::bigint) as produtos_total,
      round(avg(pg_column_size(produtos))::numeric, 1) as produtos_avg_bytes,
      max(pg_column_size(produtos)) as produtos_max_bytes
    from public.desvios_pnr_records
  `));

  report.push(await collect("storage_dashboard_files", () => sql`
    select bucket_id, name, metadata->>'size' as size_bytes, created_at, updated_at
    from storage.objects
    where bucket_id = 'dashboard-files'
    order by updated_at desc nulls last
    limit 100
  `));

  if (applyCleanup) {
    report.push(await collect("apply_pnr_raw_payload_compaction", () => sql`
      update public.desvios_pnr_records
      set raw_data = '{}'::jsonb,
          produtos = null
      where raw_data <> '{}'::jsonb
         or produtos is not null
      returning id
    `));

    report.push(await collect("analyze_pnr_tables", async () => {
      await sql`analyze public.desvios_pnr_records`;
      await sql`analyze public.desvios_pnr_metrics_summary`;
      return [{ ok: true }];
    }));
  }

  if (applyCleanup && runVacuumFull) {
    report.push(await collect("vacuum_full_desvios_pnr_records", async () => {
      await sql.unsafe("vacuum full analyze public.desvios_pnr_records");
      return [{ ok: true }];
    }));
  }

  console.log(JSON.stringify({
    appliedCleanup: applyCleanup,
    ranVacuumFull: applyCleanup && runVacuumFull,
    generatedAt: new Date().toISOString(),
    report,
  }, null, 2));
} finally {
  await sql.end();
}
