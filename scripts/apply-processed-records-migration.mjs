import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Configure SUPABASE_DB_URL ou DATABASE_URL no .env para aplicar a migração.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: "require",
});

try {
  const migrationsDir = path.resolve("supabase/migrations");
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => file >= "20260514_create_processed_dashboard_records.sql")
    .sort((a, b) => {
      const priority = (file) => {
        if (file.includes("create_desvios_pnr_records")) return 10;
        if (file.includes("add_pnr_enrichment_fields")) return 20;
        if (file.includes("create_processed_dashboard_files")) return 25;
        if (file.includes("optimize_pnr_dashboard_queries")) return 30;
        if (file.includes("update_pnr_dashboard_rpc_filters")) return 40;
        if (file.includes("update_pnr_summary_card_metrics")) return 45;
        if (file.includes("compact_pnr_persisted_records")) return 50;
        if (file.includes("processed_files_storage_flags")) return 60;
        return 0;
      };
      return priority(a) - priority(b) || a.localeCompare(b);
    });
  for (const file of migrationFiles) {
    const sqlText = await readFile(path.join(migrationsDir, file), "utf8");
    await sql.unsafe(sqlText);
    console.log(`Migração aplicada: ${file}`);
  }
  console.log("Migração de registros processados aplicada com sucesso.");
} finally {
  await sql.end();
}
