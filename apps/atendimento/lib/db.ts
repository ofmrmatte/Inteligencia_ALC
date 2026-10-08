import pg from "pg";
const { Pool } = pg;
function pool(url: string | undefined, app: string) {
  return new Pool({
    connectionString: url,
    max: 4,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    application_name: app,
    ssl: url && /railway\.internal/.test(url) ? false : undefined,
  });
}
const globalDb = globalThis as unknown as {
  atendimentoDb?: pg.Pool;
  atendimentoCore?: pg.Pool;
};
export function db() {
  if (!process.env.ATENDIMENTO_DATABASE_URL)
    throw new Error("Banco do Atendimento não configurado.");
  return (globalDb.atendimentoDb ??= pool(
    process.env.ATENDIMENTO_DATABASE_URL,
    "alc_atendimento",
  ));
}
export function core() {
  if (!process.env.CORE_DATABASE_URL)
    throw new Error("Fonte do Inteligência não configurada.");
  return (globalDb.atendimentoCore ??= pool(
    process.env.CORE_DATABASE_URL,
    "alc_atendimento_source",
  ));
}
export async function setting<T>(key: string): Promise<T> {
  const result = await db().query(
    "SELECT value FROM alc_atendimento.settings WHERE key=$1",
    [key],
  );
  return result.rows[0]?.value as T;
}
export async function audit(
  actor: string | null,
  action: string,
  target = "",
  data: Record<string, unknown> = {},
) {
  await db().query(
    "INSERT INTO alc_atendimento.audit(actor_id,action,target,data) VALUES($1,$2,$3,$4)",
    [actor, action, target, data],
  );
}
