import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Configure SUPABASE_DB_URL ou DATABASE_URL no .env para aplicar a migração.");
  process.exit(1);
}

const migrationPath = path.resolve("supabase/migrations/20260514_create_processed_dashboard_records.sql");
const sqlText = await readFile(migrationPath, "utf8");
const sql = postgres(databaseUrl, {
  max: 1,
  ssl: "require",
});

try {
  await sql.unsafe(sqlText);
  console.log("Migração de registros processados aplicada com sucesso.");
} finally {
  await sql.end();
}
