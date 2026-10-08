import pg from "pg";
import { readFile } from "node:fs/promises";
if (!process.env.ATENDIMENTO_DATABASE_URL)
  throw new Error("ATENDIMENTO_DATABASE_URL ausente.");
const client = new pg.Client({
  connectionString: process.env.ATENDIMENTO_DATABASE_URL,
});
await client.connect();
try {
  await client.query(
    await readFile(
      new URL("../db/001_atendimento.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log("Schema alc_atendimento pronto.");
} finally {
  await client.end();
}
