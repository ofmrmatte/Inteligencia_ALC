import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { HttpError } from "./auth";
import { audit } from "./db";
import { encrypt } from "./meta";
import { aiProviderSchema, credentialSettingKey } from "./ai-provider";
import {
  createStepUpChallenge,
  verifyStepUp,
  withRecentMfa,
} from "./mfa-step-up";

const payloadSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("replace_ai_credential"),
      channel: aiProviderSchema,
      apiKey: z
        .string()
        .min(1)
        .max(3000)
        .regex(/^[\x21-\x7e]+$/),
    })
    .strict(),
  z
    .object({
      operation: z.literal("remove_ai_credential"),
      channel: aiProviderSchema,
    })
    .strict(),
]);
const challengeSchema = z
  .object({ payload: payloadSchema, factorId: z.uuid() })
  .strict();
const verifySchema = challengeSchema.extend({
  challengeId: z.uuid(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: z.string().regex(/^[0-9]{6}$/),
});
const executeSchema = z
  .object({ payload: payloadSchema, proofId: z.uuid() })
  .strict();
function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Solicitação de credencial de IA inválida.");
  return parsed.data;
}
function intent(payload: z.infer<typeof payloadSchema>) {
  return {
    operation: payload.operation,
    channel: payload.channel,
    intentHash: createHash("sha256")
      .update(
        JSON.stringify([
          "alc_atendimento.ai_credentials.v1",
          payload.operation,
          payload.channel,
          payload.operation === "replace_ai_credential" ? payload.apiKey : null,
        ]),
      )
      .digest("hex"),
  };
}
async function safe<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "Operação de credencial de IA indisponível.");
  }
}
export async function createAiCredentialChallenge(input: unknown) {
  const { payload, factorId } = parse(challengeSchema, input);
  return safe(() => createStepUpChallenge({ ...intent(payload), factorId }));
}
export async function verifyAiCredential(input: unknown) {
  const { payload, ...verification } = parse(verifySchema, input);
  return safe(() => verifyStepUp({ ...intent(payload), ...verification }));
}
export async function executeAiCredential(input: unknown) {
  const { payload, proofId } = parse(executeSchema, input);
  return safe(() =>
    withRecentMfa(
      { ...intent(payload), proofId },
      async (transaction, actor) => {
        const key = credentialSettingKey(payload.channel);
        await transaction.query(
          "SELECT pg_advisory_xact_lock(hashtext('alc_atendimento_agent_settings'))",
        );
        if (payload.operation === "remove_ai_credential")
          await transaction.query(
            "DELETE FROM alc_atendimento.settings WHERE key=$1",
            [key],
          );
        else
          await transaction.query(
            `INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES($1,$2,$3)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=clock_timestamp()`,
            [key, { encrypted: encrypt(payload.apiKey) }, actor.id],
          );
        await transaction.query(
          "DELETE FROM alc_atendimento.settings WHERE key=$1",
          [`ai_test_${payload.channel}`],
        );
        await audit(
          actor.id,
          "ai_credential_changed",
          payload.channel,
          { operation: payload.operation },
          transaction,
        );
        return { ok: true as const };
      },
    ),
  );
}
