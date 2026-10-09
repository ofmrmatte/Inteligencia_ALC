import pg from "pg";
import { entrySessionKey, ENTRY_SECONDS } from "@alc/identity/transfer";

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

export async function registerAtendimentoSession(profileId: string, sessionId: string) {
  const { rows } = await accessDb().query(
    "INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now() WHERE alc_atendimento.settings.value->>'active'='true' AND alc_atendimento.settings.value->>'profileId'=$3::text RETURNING key",
    [entrySessionKey(sessionId), { profileId, active: true, expiresAt: Date.now() + ENTRY_SECONDS * 1000 }, profileId],
  );
  if (!rows.length) throw new Error("ATENDIMENTO_SESSION_REVOKED");
}

export async function revokeAtendimentoSessions(profileId: string, sessionId?: string) {
  const client = await accessDb().connect();
  try {
    await client.query("BEGIN");
    if (sessionId) await client.query(
      "INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()",
      [entrySessionKey(sessionId), { profileId, active: false, expiresAt: Date.now() + ENTRY_SECONDS * 1000 }, profileId],
    );
    await client.query(
      "UPDATE alc_atendimento.settings SET value=jsonb_set(value,'{active}','false'::jsonb),updated_at=now() WHERE starts_with(key,'sso_session_') AND value->>'profileId'=$1",
      [profileId],
    );
    await client.query("DELETE FROM alc_atendimento.login_tickets WHERE profile_id=$1", [profileId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
