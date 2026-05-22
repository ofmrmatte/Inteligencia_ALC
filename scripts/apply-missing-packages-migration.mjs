import "dotenv/config";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Configure SUPABASE_DB_URL ou DATABASE_URL no .env para aplicar a migration de Pacotes Faltantes.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: "require",
});

const migrations = [
  "supabase/migrations/20260521_create_gestao_desvios_pacotes_faltantes.sql",
  "supabase/migrations/20260521_grant_gestao_desvios_pacotes_faltantes.sql",
  "supabase/migrations/20260521_allow_authenticated_manage_pacotes_faltantes.sql",
  "supabase/migrations/20260522_missing_packages_file_import_metadata.sql",
];

try {
  for (const migration of migrations) {
    const sqlText = await readFile(migration, "utf8");
    await sql.unsafe(sqlText);
    console.log(`Migration aplicada: ${migration}`);
  }
  const result = await sql`
    select to_regclass('public.gestao_desvios_pacotes_faltantes') as table_name
  `;
  console.log("Verificacao:", result[0]);
} finally {
  await sql.end();
}
