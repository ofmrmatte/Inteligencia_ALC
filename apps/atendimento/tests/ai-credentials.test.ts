import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  challenge: vi.fn(),
  verify: vi.fn(),
  consume: vi.fn(),
  query: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../lib/mfa-step-up", () => ({
  createStepUpChallenge: mocks.challenge,
  verifyStepUp: mocks.verify,
  withRecentMfa: mocks.consume,
}));
vi.mock("../lib/db", () => ({ audit: mocks.audit, setting: vi.fn() }));
import {
  createAiCredentialChallenge,
  verifyAiCredential,
  executeAiCredential,
} from "../lib/ai-credentials";
import { decrypt } from "../lib/meta";
const ID = "11111111-1111-4111-8111-111111111111",
  FACTOR = "22222222-2222-4222-8222-222222222222";
const key = "synthetic-private-key",
  payload = {
    operation: "replace_ai_credential",
    channel: "openai",
    apiKey: key,
  };
const transaction = { query: mocks.query } as unknown as PoolClient;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ATENDIMENTO_ENCRYPTION_KEY", "ab".repeat(32));
  mocks.consume.mockImplementation(async (_binding, action) =>
    action(transaction, { id: ID }),
  );
  mocks.query.mockResolvedValue({ rows: [] });
});
afterEach(() => vi.unstubAllEnvs());
it("binds the exact secret, operation and provider at all MFA boundaries", async () => {
  const intentHash = createHash("sha256")
    .update(
      JSON.stringify([
        "alc_atendimento.ai_credentials.v1",
        payload.operation,
        payload.channel,
        key,
      ]),
    )
    .digest("hex");
  await createAiCredentialChallenge({ payload, factorId: FACTOR });
  await verifyAiCredential({
    payload,
    factorId: FACTOR,
    challengeId: ID,
    nonce: "A".repeat(43),
    code: "123456",
  });
  await executeAiCredential({ payload, proofId: ID });
  expect(mocks.challenge).toHaveBeenCalledWith({
    operation: payload.operation,
    channel: "openai",
    intentHash,
    factorId: FACTOR,
  });
  expect(mocks.verify).toHaveBeenCalledWith(
    expect.objectContaining({ intentHash }),
  );
  expect(mocks.consume.mock.calls[0][0]).toEqual({
    operation: payload.operation,
    channel: "openai",
    intentHash,
    proofId: ID,
  });
  const write = mocks.query.mock.calls.find(([sql]) =>
    sql.startsWith("INSERT INTO"),
  )!;
  expect(write[1][0]).toBe("ai_credential_openai");
  expect(decrypt(write[1][1].encrypted)).toBe(key);
  expect(
    JSON.stringify([mocks.query.mock.calls, mocks.audit.mock.calls]),
  ).not.toContain(key);
  expect(mocks.audit).toHaveBeenCalledWith(
    ID,
    "ai_credential_changed",
    "openai",
    { operation: payload.operation },
    transaction,
  );
});
it.each(["", " key", "key\n", "x".repeat(3001)])(
  "rejects an invalid key before MFA without echoing it",
  async (apiKey) => {
    await expect(
      createAiCredentialChallenge({
        payload: { ...payload, apiKey },
        factorId: FACTOR,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Solicitação de credencial de IA inválida.",
    });
    expect(mocks.challenge).not.toHaveBeenCalled();
  },
);
it("rejects unknown providers, fields and user-supplied intent hashes", async () => {
  for (const changed of [
    { ...payload, channel: "http://evil.test" },
    { ...payload, token: key },
    { ...payload, intentHash: "a".repeat(64) },
    { operation: "remove_ai_credential", channel: "openai", apiKey: key },
  ])
    await expect(
      executeAiCredential({ payload: changed, proofId: ID }),
    ).rejects.toMatchObject({ status: 400 });
  expect(mocks.consume).not.toHaveBeenCalled();
});
it("removes only the chosen override and its probe, without touching config or other providers", async () => {
  await executeAiCredential({
    payload: { operation: "remove_ai_credential", channel: "gemini" },
    proofId: ID,
  });
  expect(
    mocks.query.mock.calls
      .filter(([sql]) => sql.startsWith("DELETE"))
      .map(([, values]) => values[0]),
  ).toEqual(["ai_credential_gemini", "ai_test_gemini"]);
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
    false,
  );
});
it("sanitizes MFA, SQL and encryption errors without logging secret data", async () => {
  const log = vi.spyOn(console, "error");
  try {
    mocks.challenge.mockRejectedValueOnce(new Error(key));
    await expect(
      createAiCredentialChallenge({ payload, factorId: FACTOR }),
    ).rejects.toMatchObject({
      status: 503,
      message: "Operação de credencial de IA indisponível.",
    });
    vi.stubEnv("ATENDIMENTO_ENCRYPTION_KEY", "invalid");
    await expect(
      executeAiCredential({ payload, proofId: ID }),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
