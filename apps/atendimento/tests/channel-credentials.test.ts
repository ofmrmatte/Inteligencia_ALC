import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfile } from "@alc/identity/auth";

const USER = "11111111-1111-4111-8111-111111111111";
const FACTOR = "33333333-3333-4333-8333-333333333333";
const ID = "44444444-4444-4444-8444-444444444444";
const nonce = "A".repeat(43);
const token = "synthetic-access-token";
const appSecret = "ab".repeat(16);
const webhook = { operation: "change_webhook_critical", channel: "client", phoneId: "12345", wabaId: "67890", number: "+55 (11) 99999-9999" };
const mocks = vi.hoisted(() => ({ challenge: vi.fn(), verify: vi.fn(), consume: vi.fn(), query: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/mfa-step-up", () => ({ createStepUpChallenge: mocks.challenge, verifyStepUp: mocks.verify, withRecentMfa: mocks.consume }));
vi.mock("../lib/db", () => ({ audit: mocks.audit, setting: vi.fn() }));
import { encrypt } from "../lib/meta";
import { createChannelCredentialChallenge, executeChannelCredential, verifyChannelCredential } from "../lib/channel-credentials";

const transaction = { query: mocks.query } as unknown as PoolClient;
const actor = { id: USER, role: "developer", active: true } as unknown as AuthProfile;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ATENDIMENTO_ENCRYPTION_KEY", "ab".repeat(32));
  vi.stubEnv("WHATSAPP_CLIENT_VERIFY_TOKEN", "");
  vi.stubEnv("WHATSAPP_DRIVER_VERIFY_TOKEN", "");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External calls are forbidden"); }));
  mocks.challenge.mockResolvedValue({ challengeId: ID, factorId: FACTOR, nonce, expiresAt: "synthetic-expiry" });
  mocks.verify.mockResolvedValue({ proofId: ID, verifiedAt: "synthetic-time", expiresAt: "synthetic-expiry" });
  mocks.consume.mockImplementation(async (_input: unknown, action: (client: PoolClient, profile: AuthProfile) => Promise<unknown>) => action(transaction, actor));
  mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
  mocks.audit.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("server-derived channel credential intent", () => {
  it.each([
    { payload: { operation: "reveal_token_verification", channel: "client" }, fields: [] },
    { payload: { operation: "replace_access_token", channel: "client", token }, fields: [token] },
    { payload: { operation: "replace_app_secret", channel: "client", appSecret }, fields: [appSecret] },
    { payload: { ...webhook, verifyToken: "synthetic-verify-token" }, fields: ["12345", "67890", "5511999999999", "synthetic-verify-token", null, null] },
    { payload: { ...webhook, token, appSecret }, fields: ["12345", "67890", "5511999999999", null, token, appSecret] },
  ])("derives the exact validated intent for $payload.operation at all three boundaries", async ({ payload, fields }) => {
    const intentHash = createHash("sha256").update(JSON.stringify(["alc_atendimento.channel_credentials.v1", payload.operation, payload.channel, ...fields])).digest("hex");
    await createChannelCredentialChallenge({ payload, factorId: FACTOR });
    await verifyChannelCredential({ payload, factorId: FACTOR, challengeId: ID, nonce, code: "123456" });
    if (payload.operation === "reveal_token_verification") vi.stubEnv("WHATSAPP_CLIENT_VERIFY_TOKEN", "synthetic-verify-token");
    await executeChannelCredential({ payload, proofId: ID });
    const binding = { operation: payload.operation, channel: payload.channel, intentHash };
    expect(mocks.challenge).toHaveBeenCalledWith({ ...binding, factorId: FACTOR });
    expect(mocks.verify).toHaveBeenCalledWith({ ...binding, factorId: FACTOR, challengeId: ID, nonce, code: "123456" });
    expect(mocks.consume.mock.calls[0][0]).toEqual({ ...binding, proofId: ID });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("canonicalizes phone formatting and ignores JSON property order but binds every effective field", async () => {
    await createChannelCredentialChallenge({ payload: webhook, factorId: FACTOR });
    const original = mocks.challenge.mock.calls[0][0].intentHash;
    await createChannelCredentialChallenge({ payload: { number: "5511999999999", wabaId: "67890", phoneId: "12345", channel: "client", operation: "change_webhook_critical" }, factorId: FACTOR });
    expect(mocks.challenge.mock.calls[1][0].intentHash).toBe(original);
    for (const change of [{ phoneId: "12346" }, { wabaId: "67891" }, { number: "5511999999998" }, { verifyToken: "new-verify-token" }, { channel: "driver" }]) {
      await createChannelCredentialChallenge({ payload: { ...webhook, ...change }, factorId: FACTOR });
      expect(mocks.challenge.mock.lastCall![0].intentHash).not.toBe(original);
    }
  });
  it("binds secret byte changes without trimming or case normalization", async () => {
    for (const changed of [appSecret, appSecret.toUpperCase(), "cd".repeat(16)])
      await createChannelCredentialChallenge({ payload: { operation: "replace_app_secret", channel: "driver", appSecret: changed }, factorId: FACTOR });
    expect(new Set(mocks.challenge.mock.calls.map(([request]) => request.intentHash)).size).toBe(3);
    for (const changed of [token, token + "x"])
      await createChannelCredentialChallenge({ payload: { operation: "replace_access_token", channel: "driver", token: changed }, factorId: FACTOR });
    expect(mocks.challenge.mock.calls[3][0].intentHash).not.toBe(mocks.challenge.mock.calls[4][0].intentHash);
  });
  it.each([
    ["empty access token", { operation: "replace_access_token", channel: "client", token: "" }],
    ["access token whitespace", { operation: "replace_access_token", channel: "client", token: " token" }],
    ["access token control", { operation: "replace_access_token", channel: "client", token: "token\n" }],
    ["access token over limit", { operation: "replace_access_token", channel: "client", token: "a".repeat(3001) }],
    ["invalid app secret", { operation: "replace_app_secret", channel: "client", appSecret: "not-hex" }],
    ["short app secret", { operation: "replace_app_secret", channel: "client", appSecret: "ab" }],
    ["phone with letters", { ...webhook, number: "55 11 text 999999999" }],
    ["invalid phone length", { ...webhook, number: "123" }],
    ["invalid country", { ...webhook, number: "+14155552671" }],
    ["zero phone ID", { ...webhook, phoneId: "00000" }],
    ["invalid WABA", { ...webhook, wabaId: "letters" }],
    ["oversized ID", { ...webhook, phoneId: "1".repeat(31) }],
    ["blank verify token", { ...webhook, verifyToken: "" }],
    ["control verify token", { ...webhook, verifyToken: "token\r" }],
    ["oversized verify token", { ...webhook, verifyToken: "a".repeat(201) }],
    ["raw secret in reveal", { operation: "reveal_token_verification", channel: "client", token }],
    ["invalid combined secret", { ...webhook, token, appSecret: "not-hex" }],
    ["client-supplied hash", { ...webhook, intentHash: "a".repeat(64) }],
    ["unknown operation", { operation: "export_credentials", channel: "client" }],
    ["unknown channel", { ...webhook, channel: "other" }],
  ])("rejects %s before MFA or SQL without echoing input", async (_name, payload) => {
    await expect(createChannelCredentialChallenge({ payload, factorId: FACTOR })).rejects.toMatchObject({ status: 400, message: "Solicitacao de credenciais invalida." });
    await expect(verifyChannelCredential({ payload, factorId: FACTOR, challengeId: ID, nonce, code: "123456" })).rejects.toMatchObject({ status: 400 });
    await expect(executeChannelCredential({ payload, proofId: ID })).rejects.toMatchObject({ status: 400 });
    expect(mocks.challenge).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects unknown envelope fields, malformed proof and OTP without accepting supplied bindings", async () => {
    const payload = { operation: "reveal_token_verification", channel: "client" };
    for (const extra of [{ intentHash: "a".repeat(64) }, { channel: "driver" }, { actor: USER }, { code: "123456" }])
      await expect(createChannelCredentialChallenge({ payload, factorId: FACTOR, ...extra })).rejects.toMatchObject({ status: 400 });
    await expect(verifyChannelCredential({ payload, factorId: FACTOR, challengeId: ID, nonce, code: "12345" })).rejects.toMatchObject({ status: 400 });
    await expect(executeChannelCredential({ payload, proofId: "invalid" })).rejects.toMatchObject({ status: 400 });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("credential SQL callback", () => {
  it("saves all critical channel fields atomically under one bound proof without plaintext SQL or audit", async () => {
    await executeChannelCredential({ payload: { ...webhook, token, appSecret, verifyToken: "synthetic-verify-token" }, proofId: ID });
    const writes = mocks.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO"));
    expect(writes).toHaveLength(1);
    expect(writes[0][1][1]).toMatchObject({ phoneId: "12345", wabaId: "67890", number: "5511999999999" });
    for (const field of ["tokenEncrypted", "secretEncrypted", "verifyEncrypted"])
      expect(writes[0][1][1][field]).toMatch(/^[a-f0-9]{24}:[a-f0-9]+:[a-f0-9]{32}$/);
    for (const secret of [token, appSecret, "synthetic-verify-token"])
      expect(JSON.stringify([writes, mocks.audit.mock.calls])).not.toContain(secret);
    expect(mocks.consume).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it.each([
    { payload: { operation: "replace_access_token", channel: "client", token }, field: "tokenEncrypted", secret: token },
    { payload: { operation: "replace_app_secret", channel: "client", appSecret }, field: "secretEncrypted", secret: appSecret },
    { payload: { ...webhook, verifyToken: "synthetic-verify-token" }, field: "verifyEncrypted", secret: "synthetic-verify-token" },
  ])("encrypts $payload.operation with existing storage and audits on the supplied PoolClient", async ({ payload, field, secret }) => {
    expect(await executeChannelCredential({ payload, proofId: ID })).toEqual({ ok: true });
    const [sql, values] = mocks.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO"))!;
    expect(sql).toContain("value=alc_atendimento.settings.value || excluded.value");
    expect(values[0]).toBe("channel_client");
    expect(values[2]).toBe(USER);
    expect(values[1][field]).toMatch(/^[a-f0-9]{24}:[a-f0-9]+:[a-f0-9]{32}$/);
    expect(JSON.stringify(values)).not.toContain(secret);
    expect(mocks.audit).toHaveBeenCalledWith(USER, "channel_updated", "client", { operation: payload.operation }, transaction);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves the verification token when webhook payload omits it", async () => {
    await executeChannelCredential({ payload: webhook, proofId: ID });
    const values = mocks.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO"))![1];
    expect(values[1]).toEqual({ phoneId: "12345", wabaId: "67890", number: "5511999999999" });
  });
  it("reveals only verification token without decrypting access-token or app-secret fields", async () => {
    const verifyToken = "synthetic-verify-token";
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ value: { tokenEncrypted: "invalid", secretEncrypted: "invalid", verifyEncrypted: encrypt(verifyToken) } }] });
    expect(await executeChannelCredential({ payload: { operation: "reveal_token_verification", channel: "client" }, proofId: ID })).toEqual({ verifyToken });
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO"))).toBe(false);
    expect(mocks.audit).toHaveBeenCalledWith(USER, "webhook_verify_token_revealed", "client", { operation: "reveal_token_verification" }, transaction);
  });
  it("retains the existing verification environment fallback for a channel without a stored override", async () => {
    vi.stubEnv("WHATSAPP_DRIVER_VERIFY_TOKEN", "synthetic-driver-verify");
    expect(await executeChannelCredential({ payload: { operation: "reveal_token_verification", channel: "driver" }, proofId: ID })).toEqual({ verifyToken: "synthetic-driver-verify" });
  });
  it("fails closed on tampered verification ciphertext instead of falling back", async () => {
    vi.stubEnv("WHATSAPP_CLIENT_VERIFY_TOKEN", "synthetic-env-verify");
    const sealed = encrypt("synthetic-stored-verify");
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ value: { verifyEncrypted: sealed.slice(0, -1) + (sealed.endsWith("a") ? "b" : "a") } }] });
    await expect(executeChannelCredential({ payload: { operation: "reveal_token_verification", channel: "client" }, proofId: ID })).rejects.toMatchObject({ status: 503, message: "Token de verificacao indisponivel." });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects a missing verification token without writing an audit", async () => {
    await expect(executeChannelCredential({ payload: { operation: "reveal_token_verification", channel: "client" }, proofId: ID })).rejects.toMatchObject({ status: 404 });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("masks SQL and MFA failures without logging a secret or a provider body", async () => {
    const log = vi.spyOn(console, "log"), error = vi.spyOn(console, "error");
    try {
      mocks.challenge.mockRejectedValueOnce(new Error(token + " raw-provider-body"));
      await expect(createChannelCredentialChallenge({ payload: { operation: "replace_access_token", channel: "client", token }, factorId: FACTOR })).rejects.toMatchObject({ status: 503, message: "Operacao de credenciais indisponivel." });
      mocks.query.mockRejectedValueOnce(new Error(appSecret + " sql-details"));
      await expect(executeChannelCredential({ payload: webhook, proofId: ID })).rejects.toMatchObject({ status: 503, message: "Operacao de credenciais indisponivel." });
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally { log.mockRestore(); error.mockRestore(); }
  });
  it("uses the validated snapshot even if the caller mutates its payload while awaiting MFA", async () => {
    const payload = { operation: "replace_access_token", channel: "client", token };
    mocks.consume.mockImplementationOnce(async (_input, action) => {
      payload.token = "mutated-token";
      return action(transaction, actor);
    });
    await executeChannelCredential({ payload, proofId: ID });
    const patch = mocks.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO"))![1][1];
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ value: { verifyEncrypted: patch.tokenEncrypted } }] });
    expect(await executeChannelCredential({ payload: { operation: "reveal_token_verification", channel: "client" }, proofId: ID })).toEqual({ verifyToken: token });
  });
});
