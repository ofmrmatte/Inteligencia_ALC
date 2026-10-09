import { z } from "zod";
import type { AuthProfile } from "@alc/identity/auth";
import { HttpError, requireAdmin } from "./auth";
import {
  aiDailyUsage,
  loadAiConfig,
  type AgentAiConfig,
} from "./agent-instructions";
import {
  aiCredential,
  aiCredentialStatus,
  aiLastTest,
  aiModelVerified,
  aiProviderSchema,
  credentialFingerprint,
  recordAiTest,
  reserveAiProviderAttempt,
} from "./ai-provider";
import { validAiModelId } from "./ai-models";
import { testAgentProvider } from "./agent-ai";

export async function aiConfigurationStatus() {
  const config = await loadAiConfig(),
    used = await aiDailyUsage();
  const [openai, gemini, probe] = await Promise.all([
    aiCredentialStatus("openai"),
    aiCredentialStatus("gemini"),
    aiLastTest(config.provider),
  ]);
  const credentials = { openai, gemini },
    active = credentials[config.provider];
  let verified = false,
    currentTest = false;
  if (active.configured) {
    const credential = await aiCredential(config.provider);
    verified = await aiModelVerified(
      config.provider,
      config.model,
      credential.value,
    );
    currentTest =
      probe?.model === config.model &&
      probe.fingerprint === credentialFingerprint(credential.value);
  }
  const remaining = Math.max(0, config.dailyCallLimit - used);
  return {
    config,
    used,
    remaining,
    credentials,
    credentialEnv:
      config.provider === "openai"
        ? "OPENAI_API_KEY"
        : "GEMINI_API_KEY / GOOGLE_API_KEY",
    diagnostic: {
      provider: config.provider,
      model: config.model,
      effective: !config.enabled
        ? "rules"
        : !active.configured || !verified || remaining <= 0
          ? "unavailable"
          : !currentTest
            ? "untested"
            : probe?.result === "ready"
              ? "available"
              : "unavailable",
      lastTest: probe
        ? {
            model: probe.model,
            testedAt: probe.testedAt,
            result: probe.result,
            current: currentTest,
          }
        : null,
    },
  };
}
const testSchema = z
  .object({
    provider: aiProviderSchema,
    model: z.string().refine(validAiModelId),
    timeoutMs: z.number().int().min(100).max(8000),
    confirmed: z.literal(true),
  })
  .strict();
export async function testAiConnection(
  actor: AuthProfile,
  input: unknown,
  fetcher: typeof fetch = fetch,
) {
  requireAdmin(actor);
  const parsed = testSchema.parse(input),
    config = await loadAiConfig(),
    credential = await aiCredential(parsed.provider);
  if (!credential.value)
    throw new HttpError(409, "Credencial de IA não configurada.");
  await reserveAiProviderAttempt(actor, "test", config.dailyCallLimit);
  const effective: AgentAiConfig = {
    ...config,
    provider: parsed.provider,
    model: parsed.model,
    timeoutMs: parsed.timeoutMs,
  };
  const result = await testAgentProvider(effective, credential.value, fetcher),
    testedAt = new Date().toISOString();
  await recordAiTest(actor, {
    provider: parsed.provider,
    model: parsed.model,
    fingerprint: credentialFingerprint(credential.value),
    testedAt,
    result,
    timeoutMs: parsed.timeoutMs,
  });
  return { result, testedAt, provider: parsed.provider, model: parsed.model };
}
