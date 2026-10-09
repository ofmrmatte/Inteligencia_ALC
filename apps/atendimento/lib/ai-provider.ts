import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { AuthProfile } from "@alc/identity/auth";
import { HttpError, requireAdmin } from "./auth";
import { audit, db, setting } from "./db";
import { decrypt } from "./meta";
import {
  documentedAiModel,
  validAiModelId,
  type AiProvider,
} from "./ai-models";

export const aiProviderSchema = z.enum(["openai", "gemini"]);
const secretSchema = z
  .string()
  .min(1)
  .max(3000)
  .regex(/^[\x21-\x7e]+$/);
export type AiCredentialStatus = {
  configured: boolean;
  source: "stored" | "environment" | "absent" | "unavailable";
  stored: boolean;
};
export const credentialSettingKey = (provider: AiProvider) =>
  `ai_credential_${provider}`;
export function environmentAiCredential(
  provider: AiProvider,
  env: Record<string, string | undefined>,
) {
  return provider === "openai"
    ? env.OPENAI_API_KEY || ""
    : env.GEMINI_API_KEY || env.GOOGLE_API_KEY || "";
}
export async function aiCredential(
  provider: AiProvider,
  transaction?: PoolClient,
) {
  const key = credentialSettingKey(provider);
  const stored = transaction
    ? (
        await transaction.query(
          "SELECT value FROM alc_atendimento.settings WHERE key=$1",
          [key],
        )
      ).rows[0]?.value
    : await setting<unknown>(key);
  if (stored != null) {
    try {
      const record = z
        .object({
          encrypted: z
            .string()
            .regex(/^[a-f0-9]{24}:([a-f0-9]{2}){1,3000}:[a-f0-9]{32}$/),
        })
        .parse(stored);
      if (!/^[a-f0-9]{64}$/i.test(process.env.ATENDIMENTO_ENCRYPTION_KEY || ""))
        throw new Error();
      return {
        value: secretSchema.parse(decrypt(record.encrypted)),
        source: "stored" as const,
      };
    } catch {
      throw new HttpError(
        503,
        "Credencial de IA indisponível. Substitua a credencial ou verifique a chave de criptografia.",
      );
    }
  }
  const value = environmentAiCredential(provider, process.env);
  if (value && !secretSchema.safeParse(value).success)
    throw new HttpError(503, "Credencial de ambiente inválida.");
  return {
    value,
    source: value ? ("environment" as const) : ("absent" as const),
  };
}
export async function aiCredentialStatus(
  provider: AiProvider,
): Promise<AiCredentialStatus> {
  try {
    const credential = await aiCredential(provider);
    return {
      configured: Boolean(credential.value),
      source: credential.source,
      stored: credential.source === "stored",
    };
  } catch {
    return { configured: false, source: "unavailable", stored: true };
  }
}
export const credentialFingerprint = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Probe = {
  provider: AiProvider;
  model: string;
  fingerprint: string;
  testedAt: string;
  result: string;
  timeoutMs: number;
};
export async function aiLastTest(provider: AiProvider) {
  return setting<Probe | undefined>(`ai_test_${provider}`);
}
export async function aiModelVerified(
  provider: AiProvider,
  model: string,
  value: string,
) {
  if (!validAiModelId(model)) return false;
  if (documentedAiModel(provider, model)) return true;
  const probe = await aiLastTest(provider);
  return (
    probe?.model === model &&
    probe.result === "ready" &&
    probe.fingerprint === credentialFingerprint(value)
  );
}

// Reservations commit before external calls; repeated failures still consume rate/billing limits.
export async function reserveAiProviderAttempt(
  actor: AuthProfile,
  kind: "catalog" | "test",
  dailyLimit?: number,
) {
  requireAdmin(actor);
  const transaction = await db().connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `ai_provider_attempt:${actor.id}:${kind}`,
    ]);
    const count = (
      await transaction.query(
        "SELECT count(*)::int AS total FROM alc_atendimento.ai_provider_attempts WHERE user_id=$1 AND kind=$2 AND attempted_at>clock_timestamp()-interval '15 minutes'",
        [actor.id, kind],
      )
    ).rows[0].total;
    if (count >= (kind === "test" ? 3 : 10))
      throw new HttpError(
        429,
        "Limite de tentativas atingido. Aguarde 15 minutos.",
      );
    if (kind === "test") {
      const budget = await transaction.query(
        `INSERT INTO alc_atendimento.agent_ai_daily_usage(usage_day,calls) VALUES((now() AT TIME ZONE 'UTC')::date,1)
        ON CONFLICT(usage_day) DO UPDATE SET calls=alc_atendimento.agent_ai_daily_usage.calls+1 WHERE alc_atendimento.agent_ai_daily_usage.calls<$1 RETURNING calls`,
        [dailyLimit],
      );
      if (!budget.rows.length)
        throw new HttpError(429, "Limite diário de chamadas de IA atingido.");
    }
    await transaction.query(
      "INSERT INTO alc_atendimento.ai_provider_attempts(user_id,kind) VALUES($1,$2)",
      [actor.id, kind],
    );
    await transaction.query(
      "DELETE FROM alc_atendimento.ai_provider_attempts WHERE attempted_at<clock_timestamp()-interval '1 day'",
    );
    await transaction.query("COMMIT");
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    transaction.release();
  }
}
export async function recordAiTest(actor: AuthProfile, probe: Probe) {
  const transaction = await db().connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query(
      `INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES($1,$2,$3)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()`,
      [`ai_test_${probe.provider}`, probe, actor.id],
    );
    await audit(
      actor.id,
      "ai_connection_tested",
      probe.provider,
      {
        model: probe.model,
        result: probe.result,
      },
      transaction,
    );
    await transaction.query("COMMIT");
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    transaction.release();
  }
}

type Catalog = { models: { id: string; label: string }[]; fetchedAt: string };
const catalogCache = new Map<string, { until: number; data: Catalog }>();
const catalogPending = new Map<string, Promise<Catalog>>();
async function catalogJson(response: Response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(
      response.status === 401 || response.status === 403 ? 422 : 503,
      response.status === 401 || response.status === 403
        ? "Provedor recusou a credencial."
        : response.status === 429
          ? "Limite do provedor atingido."
          : "Catálogo do provedor indisponível.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError(503, "Catálogo inválido.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1024 * 1024) {
        await reader.cancel();
        throw new HttpError(503, "Catálogo acima do limite seguro.");
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    reader.releaseLock();
  }
}
export async function aiModelCatalog(
  actor: AuthProfile,
  input: unknown,
  fetcher: typeof fetch = fetch,
): Promise<Catalog> {
  requireAdmin(actor);
  const provider = aiProviderSchema.parse(input),
    credential = await aiCredential(provider);
  if (!credential.value)
    throw new HttpError(
      409,
      "Configure uma credencial antes de consultar os modelos.",
    );
  const key = `${provider}:${credentialFingerprint(credential.value)}`,
    cached = catalogCache.get(key);
  if (cached && cached.until > Date.now()) return cached.data;
  const pending = catalogPending.get(key);
  if (pending) return pending;
  const call = (async () => {
    await reserveAiProviderAttempt(actor, "catalog");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 8000);
    try {
      let models: Catalog["models"] = [];
      if (provider === "openai") {
        const result = z
          .object({
            data: z.array(z.object({ id: z.string().max(120) })).max(5000),
          })
          .parse(
            await catalogJson(
              await fetcher("https://api.openai.com/v1/models", {
                headers: { Authorization: `Bearer ${credential.value}` },
                signal: controller.signal,
                redirect: "error",
              }),
            ),
          );
        models = result.data
          .filter((model) => documentedAiModel(provider, model.id))
          .map((model) => ({ id: model.id, label: model.id }));
      } else {
        let token: string | undefined;
        for (let page = 0; page < 5; page++) {
          const url = new URL(
            "https://generativelanguage.googleapis.com/v1beta/models",
          );
          url.searchParams.set("pageSize", "1000");
          if (token) url.searchParams.set("pageToken", token);
          const result = z
            .object({
              models: z
                .array(
                  z.object({
                    name: z.string().max(150),
                    displayName: z.string().max(150).optional(),
                    supportedGenerationMethods: z.array(z.string()),
                  }),
                )
                .max(1000),
              nextPageToken: z.string().max(2000).optional(),
            })
            .parse(
              await catalogJson(
                await fetcher(url, {
                  headers: { "x-goog-api-key": credential.value },
                  signal: controller.signal,
                  redirect: "error",
                }),
              ),
            );
          models.push(
            ...result.models
              .filter(
                (model) =>
                  model.supportedGenerationMethods.includes(
                    "generateContent",
                  ) &&
                  documentedAiModel(
                    provider,
                    model.name.replace(/^models\//, ""),
                  ),
              )
              .map((model) => ({
                id: model.name.replace(/^models\//, ""),
                label: model.displayName || model.name,
              })),
          );
          token = result.nextPageToken;
          if (!token) break;
        }
        if (token)
          throw new HttpError(
            503,
            "Catálogo incompleto. Use um modelo manual e teste a compatibilidade.",
          );
      }
      const data = {
        models: [
          ...new Map(models.map((model) => [model.id, model])).values(),
        ].sort((a, b) => a.id.localeCompare(b.id)),
        fetchedAt: new Date().toISOString(),
      };
      for (const [cacheKey, value] of catalogCache)
        if (value.until <= Date.now() || cacheKey.startsWith(`${provider}:`))
          catalogCache.delete(cacheKey);
      catalogCache.set(key, { until: Date.now() + 5 * 60_000, data });
      return data;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        503,
        "Catálogo do provedor indisponível ou inválido.",
      );
    } finally {
      clearTimeout(timer);
    }
  })();
  catalogPending.set(key, call);
  try {
    return await call;
  } finally {
    catalogPending.delete(key);
  }
}
