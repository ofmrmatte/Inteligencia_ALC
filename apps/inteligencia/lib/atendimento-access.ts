import pg from "pg";

const globalAccessDb = globalThis as typeof globalThis & { atendimentoAccessPool?: pg.Pool };

function accessDb() {
  if (!process.env.PNR_DATABASE_URL) throw new Error("ATENDIMENTO_DATABASE_UNAVAILABLE");
  return (globalAccessDb.atendimentoAccessPool ??= new pg.Pool({
    connectionString: process.env.PNR_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 3_000,
    application_name: "inteligencia_atendimento_access",
  }));
}

export async function readAtendimentoAccess(ids: string[]): Promise<Map<string, boolean>> {
  if (!ids.length) return new Map();
  try {
    const { rows } = await accessDb().query<{ key: string; value: { active?: unknown } }>(
      "SELECT key,value FROM alc_atendimento.settings WHERE key=ANY($1::text[])",
      [ids.map((id) => `access_${id}`)],
    );
    return new Map(rows.filter((row) => typeof row.value?.active === "boolean")
      .map((row) => [row.key.slice("access_".length), row.value.active as boolean]));
  } catch {
    throw new Error("ATENDIMENTO_DATABASE_UNAVAILABLE");
  }
}

export async function writeAtendimentoAccess(actorId: string, targetId: string, active: boolean) {
  const client = await accessDb().connect().catch(() => { throw new Error("ATENDIMENTO_DATABASE_UNAVAILABLE"); });
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()",
      [`access_${targetId}`, { active }, actorId],
    );
    await client.query(
      "INSERT INTO alc_atendimento.audit(actor_id,action,target,data) VALUES($1,$2,$3,$4)",
      [actorId, "user_access_updated", targetId, { active, source: "inteligencia" }],
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error("ATENDIMENTO_DATABASE_UNAVAILABLE");
  } finally {
    client.release();
  }
}
