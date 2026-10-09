import pg from "pg";
import { migrate } from "./migrations.mjs";
if (!process.argv.includes("--apply")) throw new Error("Aplique somente após aprovação: npm run migrate --workspace=@alc/atendimento -- --apply");
if (!process.env.ATENDIMENTO_DATABASE_URL)
  throw new Error("ATENDIMENTO_DATABASE_URL ausente.");
const client = new pg.Client({
  connectionString: process.env.ATENDIMENTO_DATABASE_URL,
});
await client.connect();
try {
  await migrate(client);
  console.log("Schema alc_atendimento pronto.");
} finally {
  await client.end();
}
