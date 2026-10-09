import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

export async function migrate(
  client,
  directory = new URL("../db/", import.meta.url),
) {
  const files = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z_]+\.sql$/.test(name))
    .sort();
  for (const name of files) {
    const sql = await readFile(new URL(name, directory), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    await client.query("BEGIN");
    try {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('alc_atendimento_migrations'))",
      );
      await client.query("CREATE SCHEMA IF NOT EXISTS alc_atendimento");
      await client.query("REVOKE ALL ON SCHEMA alc_atendimento FROM PUBLIC");
      await client.query(
        "CREATE TABLE IF NOT EXISTS alc_atendimento.schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
      );
      const previous = (
        await client.query(
          "SELECT sha256 FROM alc_atendimento.schema_migrations WHERE name=$1",
          [name],
        )
      ).rows[0];
      if (previous && previous.sha256 !== hash)
        throw new Error(`Migração aplicada foi alterada: ${name}`);
      if (!previous) {
        await client.query(sql);
        await client.query(
          "INSERT INTO alc_atendimento.schema_migrations(name,sha256) VALUES($1,$2)",
          [name, hash],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  return files;
}
