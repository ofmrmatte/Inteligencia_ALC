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
    .sort();
  for (const file of migrationFiles) {
    const sqlText = await readFile(path.join(migrationsDir, file), "utf8");
    await sql.unsafe(sqlText);
    console.log(`Migração aplicada: ${file}`);
  }
  console.log("Migração de registros processados aplicada com sucesso.");
} finally {
  await sql.end();
}
