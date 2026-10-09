import "server-only";
import { createDecipheriv, createHash } from "node:crypto";
import { z } from "zod";
import { HttpError } from "./auth";
import { audit } from "./db";
import { phone } from "./domain";
import { encrypt } from "./meta";
import { createStepUpChallenge, verifyStepUp, withRecentMfa } from "./mfa-step-up";

const channel = z.enum(["driver", "client"]);
const opaque = (max: number) => z.string().min(1).max(max).regex(/^[\x21-\x7e]+$/);
const phoneId = z.string().regex(/^[1-9][0-9]{4,29}$/);
const number = z.string().max(40).regex(/^\+?[0-9 ()-]+$/)
  .refine((value) => Boolean(phone(value)) && (!value.startsWith("+") || /^55\d{10,11}$/.test(value.replace(/\D/g, "")))).transform(phone);
const payloadSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("reveal_token_verification"), channel }).strict(),
  z.object({ operation: z.literal("replace_access_token"), channel, token: opaque(3000) }).strict(),
  z.object({ operation: z.literal("replace_app_secret"), channel, appSecret: z.string().regex(/^[a-fA-F0-9]{32}$/) }).strict(),
  z.object({
    operation: z.literal("change_webhook_critical"), channel, phoneId, wabaId: phoneId, number,
    verifyToken: opaque(200).optional(),
  }).strict(),
]);
export type ChannelCredentialPayload = z.infer<typeof payloadSchema>;
const challengeSchema = z.object({ payload: payloadSchema, factorId: z.uuid() }).strict();
const verifySchema = challengeSchema.extend({
  challengeId: z.uuid(), nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string().regex(/^[0-9]{6}$/),
});
const executeSchema = z.object({ payload: payloadSchema, proofId: z.uuid() }).strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Solicitacao de credenciais invalida.");
  return parsed.data;
}

function intent(payload: ChannelCredentialPayload) {
  // A fixed tuple binds the exact effective payload, independent of JSON property order.
  const fields = payload.operation === "replace_access_token" ? [payload.token]
    : payload.operation === "replace_app_secret" ? [payload.appSecret]
    : payload.operation === "change_webhook_critical" ? [payload.phoneId, payload.wabaId, payload.number, payload.verifyToken ?? null]
    : [];
  return {
    operation: payload.operation, channel: payload.channel,
    intentHash: createHash("sha256").update(JSON.stringify(["alc_atendimento.channel_credentials.v1", payload.operation, payload.channel, ...fields])).digest("hex"),
  };
}

async function safe<T>(call: () => Promise<T>): Promise<T> {
  try { return await call(); }
  catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "Operacao de credenciais indisponivel.");
  }
}

// Same AES-GCM format as meta.ts; do not decrypt access tokens or app secrets for a reveal.
function verificationToken(stored: Record<string, unknown>, target: "driver" | "client") {
  try {
    let token = process.env[`WHATSAPP_${target.toUpperCase()}_VERIFY_TOKEN`] || "";
    if (stored.verifyEncrypted !== undefined) {
      const sealed = stored.verifyEncrypted;
      if (typeof sealed !== "string" || !/^[a-f0-9]{24}:([a-f0-9]{2}){1,200}:[a-f0-9]{32}$/.test(sealed)) throw new Error();
      const rawKey = process.env.ATENDIMENTO_ENCRYPTION_KEY || "";
      if (!/^[a-f0-9]{64}$/i.test(rawKey)) throw new Error();
      const [iv, body, tag] = sealed.split(":");
      const decipher = createDecipheriv("aes-256-gcm", Buffer.from(rawKey, "hex"), Buffer.from(iv, "hex"));
      decipher.setAuthTag(Buffer.from(tag, "hex"));
      token = decipher.update(body, "hex", "utf8") + decipher.final("utf8");
    }
    if (token && !opaque(200).safeParse(token).success) throw new Error();
    return token;
  } catch { throw new HttpError(503, "Token de verificacao indisponivel."); }
}

export async function createChannelCredentialChallenge(input: unknown) {
  const { payload, factorId } = parse(challengeSchema, input);
  return safe(() => createStepUpChallenge({ ...intent(payload), factorId }));
}

export async function verifyChannelCredential(input: unknown) {
  const { payload, ...verification } = parse(verifySchema, input);
  return safe(() => verifyStepUp({ ...intent(payload), ...verification }));
}

// Callers must enforce CSRF and return reveal responses with private/no-store headers.
export async function executeChannelCredential(input: unknown): Promise<{ ok: true } | { verifyToken: string }> {
  const { payload, proofId } = parse(executeSchema, input);
  return safe(() => withRecentMfa({ ...intent(payload), proofId }, async (transaction, actor) => {
    const key = `channel_${payload.channel}`;
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const { rows } = await transaction.query<{ value: unknown }>("SELECT value FROM alc_atendimento.settings WHERE key=$1 FOR UPDATE", [key]);
    const stored = rows.length ? z.record(z.string(), z.unknown()).safeParse(rows[0].value) : { success: true as const, data: {} };
    if (!stored.success) throw new HttpError(503, "Configuracao do canal indisponivel.");
    if (payload.operation === "reveal_token_verification") {
      const token = verificationToken(stored.data, payload.channel);
      if (!token) throw new HttpError(404, "Token de verificacao nao configurado neste canal.");
      await audit(actor.id, "webhook_verify_token_revealed", payload.channel, { operation: payload.operation }, transaction);
      return { verifyToken: token };
    }
    const patch = payload.operation === "replace_access_token" ? { tokenEncrypted: encrypt(payload.token) }
      : payload.operation === "replace_app_secret" ? { secretEncrypted: encrypt(payload.appSecret) }
      : {
        phoneId: payload.phoneId, wabaId: payload.wabaId, number: payload.number,
        ...(payload.verifyToken === undefined ? {} : { verifyEncrypted: encrypt(payload.verifyToken) }),
      };
    await transaction.query(
      `INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES($1,$2,$3)
       ON CONFLICT(key) DO UPDATE SET value=alc_atendimento.settings.value || excluded.value,
         updated_by=excluded.updated_by,updated_at=clock_timestamp()`,
      [key, patch, actor.id],
    );
    await audit(actor.id, "channel_updated", payload.channel, { operation: payload.operation }, transaction);
    return { ok: true };
  }));
}
