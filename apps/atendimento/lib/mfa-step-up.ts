import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { canAccessAtendimento, canManageUsers, type AuthProfile } from "@alc/identity/auth";
import { entrySessionKey, validEntryGrant } from "@alc/identity/transfer";
import { currentSessionContext, HttpError, requireAdmin } from "./auth";
import { db } from "./db";
import { enabledProfiles } from "./operator-directory";

const boundedFetch: typeof fetch = (input, init) => fetch(input, {
  ...init,
  signal: AbortSignal.any([AbortSignal.timeout(3000), ...(init?.signal ? [init.signal] : input instanceof Request ? [input.signal] : [])]),
});

async function bounded<T>(call: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([call(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(503, "Verificacao MFA indisponivel.")), 3000);
    })]);
  } finally { clearTimeout(timer); }
}

// A timed-out SDK read must not query a PoolClient that has since been released/reused.
function queryLease(client: PoolClient) {
  let active = true;
  return {
    client: new Proxy(client, {
      get(target, property, receiver) {
        if (property === "query") return (...args: unknown[]) => active
          ? Reflect.apply(target.query, target, args)
          : Promise.reject(new HttpError(503, "Verificacao MFA indisponivel."));
        return Reflect.get(target, property, receiver);
      },
    }),
    close: () => { active = false; },
  };
}

async function begin(client: PoolClient, directory = false) {
  await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  await client.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='15s'");
  if (directory) await client.query("SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))");
}

function transactionError(error: unknown) {
  if (error && typeof error === "object" && "code" in error && ["55P03", "57014", "25P03", "40P01"].includes(String(error.code)))
    return new HttpError(503, "Operacao MFA temporariamente indisponivel.");
  return error;
}

const bindingSchema = z.object({
  operation: z.enum(["reveal_token_verification", "replace_access_token", "replace_app_secret", "change_webhook_critical"]),
  channel: z.enum(["driver", "client"]),
  intentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const challengeSchema = bindingSchema.extend({ factorId: z.uuid() });
const verifySchema = challengeSchema.extend({
  challengeId: z.uuid(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: z.string().regex(/^[0-9]{6}$/),
});
const consumeSchema = bindingSchema.extend({ proofId: z.uuid() });
type Context = Awaited<ReturnType<typeof currentSessionContext>>;
type Challenge = { id: string; factor_id: string; nonce_sealed: string };

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, "Solicitacao MFA invalida.");
  return result.data;
}

async function context(transaction?: PoolClient) {
  const lease = transaction ? queryLease(transaction) : undefined;
  let current: Context;
  try { current = await bounded(() => currentSessionContext(lease?.client, boundedFetch)); }
  catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "Nao foi possivel verificar a sessao central.");
  } finally { lease?.close(); }
  requireAdmin(current.profile);
  return current;
}

function key() {
  const value = process.env.ATENDIMENTO_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new HttpError(503, "Step-up MFA indisponivel.");
  return Buffer.from(value, "hex");
}

function seal(value: { nonce: string; providerId: string }, challengeId: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(challengeId));
  return [iv.toString("hex"), Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]).toString("hex"), cipher.getAuthTag().toString("hex")].join(":");
}

function open(challenge: Challenge, nonce: string) {
  try {
    const [iv, body, tag] = challenge.nonce_sealed.split(":");
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
    decipher.setAAD(Buffer.from(challenge.id));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    const value = parse(z.object({ nonce: z.string(), providerId: z.uuid() }).strict(), JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, "hex")), decipher.final()]).toString()));
    const stored = Buffer.from(value.nonce), received = Buffer.from(nonce);
    if (stored.length !== received.length || !timingSafeEqual(stored, received)) throw new Error();
    return value.providerId;
  } catch {
    throw new HttpError(401, "Desafio invalido ou expirado.");
  }
}

// Provider failures are never propagated with response bodies, codes or tokens.
async function provider<T>(call: () => Promise<T>, status = 503): Promise<T> {
  try { return await bounded(call); }
  catch { throw new HttpError(status, "Nao foi possivel verificar o MFA."); }
}

async function criticalProfile(client: PoolClient, userId: string) {
  const lease = queryLease(client);
  try {
    const actor = (await provider(() => enabledProfiles(lease.client))).find((profile) => profile.id === userId);
    if (!actor || !canManageUsers(actor)) throw new HttpError(403, "Permissao para a operacao critica revogada.");
    return actor;
  } finally { lease.close(); }
}

async function verifiedTotp(client: Context["client"], factorId?: string) {
  const { data, error } = await provider(() => client.auth.mfa.listFactors());
  if (error || !data || !Array.isArray(data.totp)) throw new HttpError(503, "Nao foi possivel consultar os fatores MFA.");
  const factors = data.totp.filter((factor) => factor.factor_type === "totp" && factor.status === "verified");
  if (factorId && !factors.some((factor) => factor.id === factorId))
    throw new HttpError(403, "TOTP verificado necessario. Configure-o no Inteligencia ALC.");
  return factors;
}

function sameSession(a: Context, b: Context) {
  if (a.claims.sub !== b.claims.sub || a.claims.session_id !== b.claims.session_id)
    throw new HttpError(401, "Sessao invalida.");
}

async function windowAttempts(client: Pick<PoolClient, "query">, userId: string) {
  const { rows } = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM alc_atendimento.step_up_attempts WHERE user_id=$1 AND attempted_at > clock_timestamp()-interval '15 minutes'",
    [userId],
  );
  if (Number(rows[0].count) >= 5) throw new HttpError(429, "Limite de tentativas MFA atingido.");
}

async function entryAndAccess(client: PoolClient, current: Context, profile = current.profile) {
  const { rows } = await client.query<{ key: string; value: unknown; now: string }>(
    "SELECT key,value,extract(epoch FROM clock_timestamp())*1000 AS now FROM alc_atendimento.settings WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE",
    [[entrySessionKey(current.claims.session_id), `access_${current.claims.sub}`]],
  );
  const grant = rows.find((row) => row.key === entrySessionKey(current.claims.session_id));
  if (!grant || !validEntryGrant(grant.value, current.claims.sub, Number(grant.now)))
    throw new HttpError(401, "Sessao encerrada.");
  const access = rows.find((row) => row.key === `access_${current.claims.sub}`)?.value as { active?: boolean } | undefined;
  if (!canAccessAtendimento({ ...profile, atendimentoAccess: access?.active }))
    throw new HttpError(403, "Acesso ao Atendimento desativado.");
}

export async function listStepUpFactors() {
  const { client } = await context();
  return (await verifiedTotp(client)).map(({ id, friendly_name }) => ({ id, friendlyName: friendly_name ?? "" }));
}

// intentHash must be recomputed by the caller from its validated, exact action payload.
export async function createStepUpChallenge(input: unknown) {
  const bound = parse(challengeSchema, input), current = await context();
  key();
  await verifiedTotp(current.client, bound.factorId);
  await windowAttempts(db(), current.claims.sub);
  const { data, error } = await provider(() => current.client.auth.mfa.challenge({ factorId: bound.factorId }));
  if (error || !data || data.type !== "totp" || !z.uuid().safeParse(data.id).success || !Number.isFinite(data.expires_at))
    throw new HttpError(503, "Nao foi possivel iniciar o desafio MFA.");
  const id = randomUUID(), nonce = randomBytes(32).toString("base64url");
  const { rows } = await db().query<{ expires_at: Date }>(
    `INSERT INTO alc_atendimento.step_up_challenges
       (id,user_id,session_id,operation,channel,intent_hash,factor_id,provider_challenge_hash,nonce_sealed,created_at,expires_at)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,t,least(t+interval '3 minutes',to_timestamp($10))
       FROM (SELECT clock_timestamp() AS t) AS clock WHERE to_timestamp($10)>t RETURNING expires_at`,
    [id, current.claims.sub, current.claims.session_id, bound.operation, bound.channel, bound.intentHash, bound.factorId,
      createHash("sha256").update(data.id).digest("hex"), seal({ nonce, providerId: data.id }, id), data.expires_at],
  );
  if (!rows.length) throw new HttpError(503, "Desafio MFA expirado.");
  return { challengeId: id, factorId: bound.factorId, nonce, expiresAt: rows[0].expires_at.toISOString() };
}

async function claimChallenge(current: Context, bound: z.infer<typeof verifySchema>) {
  const client = await db().connect();
  try {
    await begin(client);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`mfa:${current.claims.sub}`]);
    await client.query("DELETE FROM alc_atendimento.step_up_attempts WHERE user_id=$1 AND attempted_at <= clock_timestamp()-interval '15 minutes'", [current.claims.sub]);
    await windowAttempts(client, current.claims.sub);
    const { rows } = await client.query<Challenge>(
      `SELECT id,factor_id,nonce_sealed FROM alc_atendimento.step_up_challenges
       WHERE id=$1 AND user_id=$2 AND session_id=$3 AND operation=$4 AND channel=$5 AND intent_hash=$6
         AND factor_id=$7 AND claimed_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`,
      [bound.challengeId, current.claims.sub, current.claims.session_id, bound.operation, bound.channel, bound.intentHash, bound.factorId],
    );
    if (!rows.length) throw new HttpError(401, "Desafio invalido ou expirado.");
    const providerId = open(rows[0], bound.nonce);
    // Commit admission before the provider call: failures/crashes cannot refund attempts or reuse this nonce.
    await client.query("INSERT INTO alc_atendimento.step_up_attempts(user_id) VALUES($1)", [current.claims.sub]);
    const claimed = await client.query(
      "UPDATE alc_atendimento.step_up_challenges SET claimed_at=clock_timestamp() WHERE id=$1 AND claimed_at IS NULL AND expires_at>clock_timestamp() RETURNING id",
      [bound.challengeId],
    );
    if (!claimed.rowCount) throw new HttpError(401, "Desafio invalido ou expirado.");
    await client.query("COMMIT");
    return providerId;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw transactionError(error);
  } finally { client.release(); }
}

export async function verifyStepUp(input: unknown) {
  const bound = parse(verifySchema, input), current = await context();
  const providerId = await claimChallenge(current, bound);
  await verifiedTotp(current.client, bound.factorId);
  const { data, error } = await provider(() => current.client.auth.mfa.verify({ factorId: bound.factorId, challengeId: providerId, code: bound.code }), 401);
  if (error || data?.user?.id !== current.claims.sub || !data.access_token)
    throw new HttpError(401, "Codigo MFA invalido ou expirado.");
  const verified = await provider(() => current.client.auth.getClaims(data.access_token), 401);
  if (verified.error || verified.data?.claims.sub !== current.claims.sub || verified.data.claims.session_id !== current.claims.session_id || verified.data.claims.aal !== "aal2")
    throw new HttpError(401, "Sessao MFA invalida.");
  const fresh = await context();
  sameSession(current, fresh);
  await verifiedTotp(fresh.client, bound.factorId);
  const client = await db().connect();
  try {
    await begin(client, true);
    const actor = await criticalProfile(client, fresh.claims.sub);
    await entryAndAccess(client, fresh, actor);
    const { rows } = await client.query<{ id: string; verified_at: Date; proof_expires_at: Date }>(
      `UPDATE alc_atendimento.step_up_challenges SET verified_at=clock_timestamp(),proof_expires_at=claimed_at+interval '3 minutes'
       WHERE id=$1 AND user_id=$2 AND session_id=$3 AND claimed_at IS NOT NULL AND verified_at IS NULL
         AND expires_at>clock_timestamp() AND claimed_at+interval '3 minutes'>clock_timestamp()
       RETURNING id,verified_at,proof_expires_at`,
      [bound.challengeId, fresh.claims.sub, fresh.claims.session_id],
    );
    if (!rows.length) throw new HttpError(401, "Desafio invalido ou expirado.");
    await client.query("COMMIT");
    return { proofId: rows[0].id, verifiedAt: rows[0].verified_at.toISOString(), expiresAt: rows[0].proof_expires_at.toISOString() };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw transactionError(error);
  } finally { client.release(); }
}

// The callback must use this PoolClient for SQL/audit/outbox only, with no external side effects or transaction control.
export async function withRecentMfa<T>(input: unknown, action: (client: PoolClient, profile: AuthProfile) => Promise<T>): Promise<T> {
  const bound = parse(consumeSchema, input), current = await context();
  const client = await db().connect();
  try {
    await begin(client, true);
    await entryAndAccess(client, current);
    const { rows } = await client.query<{ factor_id: string }>(
      `SELECT factor_id FROM alc_atendimento.step_up_challenges
       WHERE id=$1 AND user_id=$2 AND session_id=$3 AND operation=$4 AND channel=$5 AND intent_hash=$6
         AND verified_at IS NOT NULL AND consumed_at IS NULL AND proof_expires_at>clock_timestamp() FOR UPDATE`,
      [bound.proofId, current.claims.sub, current.claims.session_id, bound.operation, bound.channel, bound.intentHash],
    );
    if (!rows.length) throw new HttpError(403, "Confirme novamente o segundo fator.");
    await verifiedTotp(current.client, rows[0].factor_id);
    const fresh = await context(client);
    sameSession(current, fresh);
    const actor = await criticalProfile(client, fresh.claims.sub);
    // Recheck time and revocation after lock/network waits; now() would retain the transaction's old time.
    await entryAndAccess(client, fresh, actor);
    const proof = await client.query(
      "UPDATE alc_atendimento.step_up_challenges SET consumed_at=clock_timestamp() WHERE id=$1 AND consumed_at IS NULL AND proof_expires_at>clock_timestamp() RETURNING id",
      [bound.proofId],
    );
    if (!proof.rowCount) throw new HttpError(403, "Confirme novamente o segundo fator.");
    const result = await action(client, actor);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw transactionError(error);
  } finally { client.release(); }
}
