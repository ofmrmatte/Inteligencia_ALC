import "server-only";
import pg from "pg";

const globalDb = globalThis as typeof globalThis & { __alcHrPool?: pg.Pool };
export function hrDb() {
  if (!process.env.HR_DATABASE_URL) throw new Error("HR_DATABASE_UNAVAILABLE");
  if (!globalDb.__alcHrPool) {
    globalDb.__alcHrPool = new pg.Pool({ connectionString: process.env.HR_DATABASE_URL, max: 4,
      connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000,
      query_timeout: 20000, application_name: "inteligencia-alc-rh" });
    globalDb.__alcHrPool.on("error", () => { /* Pool recovers idle connections; no personal data is logged. */ });
  }
  return globalDb.__alcHrPool;
}
export async function hrTransaction<T>(work: (client: pg.PoolClient) => Promise<T>) {
  const client = await hrDb().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
