import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.HR_DATABASE_URL;
if (!connectionString) throw new Error("HR_DATABASE_URL ausente. Nenhum fallback é permitido.");
let target;
try { target = new URL(connectionString); } catch { throw new Error("HR_DATABASE_URL inválida. Nenhuma credencial será exibida."); }
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || decodeURIComponent(target.pathname) !== "/alc_hr_local") {
  throw new Error("Runner exclusivamente local: host loopback e banco dedicado alc_hr_local obrigatórios. Não utilize túneis para bancos remotos.");
}
if (!process.argv.includes("--confirm-hr-local")) throw new Error("Confirme o banco RH dedicado com --confirm-hr-local.");
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
try {
  await client.connect();
  await client.query(await readFile(new URL("../db/railway/hr/001_hr_initial_schema.sql", import.meta.url), "utf8"));
  console.log("Schema RH criado no banco local dedicado. Nenhuma credencial foi registrada.");
} catch { throw new Error("Falha ao aplicar schema no Postgres-RH local; revise configuração/destino sem publicar credenciais."); }
finally { await client.end(); }
