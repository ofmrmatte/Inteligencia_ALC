import { bytesToHuman, createSql, printSection, writeAuditReport } from "./audit-utils.mjs";

const sql = createSql();

try {
  const db = await sql.unsafe(`
    select current_database() as database_name,
      pg_database_size(current_database())::bigint as total_bytes,
      pg_size_pretty(pg_database_size(current_database())) as total_size
  `);

  const tables = await sql.unsafe(`
    select
      n.nspname as schema_name,
      c.relname as relation_name,
      pg_total_relation_size(c.oid)::bigint as total_bytes,
      pg_relation_size(c.oid)::bigint as table_bytes,
      pg_indexes_size(c.oid)::bigint as index_bytes,
      coalesce(s.n_live_tup, 0)::bigint as estimated_live_rows,
      coalesce(s.n_dead_tup, 0)::bigint as estimated_dead_rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
    order by pg_total_relation_size(c.oid) desc
  `);

  const storage = await sql.unsafe(`
    select bucket_id,
      count(*)::bigint as objects,
      coalesce(sum((metadata->>'size')::bigint), 0)::bigint as bytes
    from storage.objects
    group by bucket_id
    order by bytes desc
  `);

  const currentBytes = Number(db[0]?.total_bytes || 0);
  const storageBytes = storage.reduce((sum, row) => sum + Number(row.bytes || 0), 0);
  const twoGb = 2 * 1024 ** 3;
  const fiveGb = 5 * 1024 ** 3;
  const largest = tables[0] || {};
  const report = {
    generatedAt: new Date().toISOString(),
    database: {
      ...db[0],
      total_human: bytesToHuman(currentBytes),
    },
    storage: storage.map((row) => ({ ...row, human: bytesToHuman(row.bytes) })),
    storage_total_bytes: storageBytes,
    storage_total_human: bytesToHuman(storageBytes),
    largest_relation: {
      ...largest,
      total_human: bytesToHuman(largest.total_bytes),
      table_human: bytesToHuman(largest.table_bytes),
      index_human: bytesToHuman(largest.index_bytes),
    },
    public_tables: tables.map((row) => ({
      ...row,
      total_human: bytesToHuman(row.total_bytes),
      table_human: bytesToHuman(row.table_bytes),
      index_human: bytesToHuman(row.index_bytes),
    })),
    railway: {
      previous_reference_database: "313 MB",
      previous_reference_storage: "447 kB",
      minimum_technical_gb: 1,
      recommended_production_gb: 2,
      ideal_with_margin_gb: 5,
      current_vs_2gb_percent: Number(((currentBytes / twoGb) * 100).toFixed(2)),
      current_vs_5gb_percent: Number(((currentBytes / fiveGb) * 100).toFixed(2)),
      recommendation: currentBytes < twoGb ? "2 GB remains sufficient for the current dataset; 5 GB gives safer production margin." : "Use at least 5 GB and review growth before migration.",
    },
  };

  const reportPath = await writeAuditReport("railway-sizing", report);

  printSection("Railway sizing");
  console.log(`Database: ${report.database.total_human}`);
  console.log(`Storage: ${report.storage_total_human}`);
  console.log(`Largest relation: ${report.largest_relation.relation_name} (${report.largest_relation.total_human})`);
  console.log(`Recommended: ${report.railway.recommended_production_gb} GB; ideal: ${report.railway.ideal_with_margin_gb} GB`);
  console.log(`Relatorio: ${reportPath}`);
} finally {
  await sql.end();
}
