import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ENTRY_COOKIE, entryReceipt, entrySessionKey } from "@alc/identity/transfer";

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const FACTOR = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const bound = { operation: "replace_access_token", channel: "client", intentHash: "a".repeat(64) };
const code = "123456";
const mocks = vi.hoisted(() => ({
  pool: null as import("pg").Pool | null,
  setting: vi.fn(), getClaims: vi.fn(), listFactors: vi.fn(), challenge: vi.fn(), verify: vi.fn(), maybeSingle: vi.fn(),
  directoryRead: vi.fn(),
  directoryProfiles: null as Record<string, unknown>[] | null,
  claims: { sub: "", session_id: "", aal: "aal2" },
  verifiedClaims: {} as Record<string, unknown>,
  profile: {} as Record<string, unknown>,
  factors: [] as Record<string, unknown>[],
  receiptValid: true,
  grant: {} as Record<string, unknown>,
}));
vi.mock("../lib/db", () => ({
  db: () => { if (!mocks.pool) throw new Error("Isolated MFA test database is not running"); return mocks.pool; },
  setting: mocks.setting, core: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [], set: vi.fn(),
    get: (name: string) => name === ENTRY_COOKIE ? { value: mocks.receiptValid ? entryReceipt(mocks.claims.sub, mocks.claims.session_id, process.env.ATENDIMENTO_ENCRYPTION_KEY!) : "invalid" } : undefined,
  }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: mocks.getClaims,
      mfa: { listFactors: mocks.listFactors, challenge: mocks.challenge, verify: mocks.verify },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({ select: () => ({ limit: mocks.directoryRead }) }) }),
}));
import { currentProfile, currentSessionContext } from "../lib/auth";
import { createStepUpChallenge, listStepUpFactors, verifyStepUp, withRecentMfa } from "../lib/mfa-step-up";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-key");
  vi.stubEnv("ATENDIMENTO_ENCRYPTION_KEY", "ab".repeat(32));
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server-only");
  mocks.claims = { sub: USER, session_id: SESSION, aal: "aal2" };
  mocks.verifiedClaims = { ...mocks.claims };
  mocks.profile = { id: USER, email: "test@example.test", full_name: "Synthetic", role: "developer", active: true, module_scope: ["gestao-pnr"] };
  mocks.grant = { active: true, profileId: USER, expiresAt: Date.now() + 60_000 };
  mocks.factors = [{ id: FACTOR, factor_type: "totp", status: "verified", friendly_name: "Authenticator" }];
  mocks.receiptValid = true;
  mocks.directoryProfiles = null;
  mocks.directoryRead.mockImplementation(async () => ({ data: mocks.directoryProfiles || [{ ...mocks.profile, id: mocks.claims.sub }], error: null }));
  mocks.getClaims.mockImplementation(async (jwt?: string) => ({ data: { claims: jwt ? mocks.verifiedClaims : mocks.claims }, error: null }));
  mocks.maybeSingle.mockImplementation(async () => ({ data: { ...mocks.profile, id: mocks.claims.sub }, error: null }));
  mocks.listFactors.mockImplementation(async () => ({ data: { totp: mocks.factors, all: mocks.factors }, error: null }));
  mocks.challenge.mockImplementation(async () => ({ data: { id: randomUUID(), type: "totp", expires_at: Date.now() / 1000 + 600 }, error: null }));
  mocks.verify.mockImplementation(async () => ({
    data: { user: { id: mocks.claims.sub }, access_token: "synthetic-access", refresh_token: "synthetic-refresh" }, error: null,
  }));
  mocks.setting.mockImplementation(async (key: string) => mocks.pool
    ? (await mocks.pool.query("SELECT value FROM alc_atendimento.settings WHERE key=$1", [key])).rows[0]?.value
    : key.startsWith("sso_session_") ? mocks.grant : { active: true });
});
afterAll(() => vi.unstubAllEnvs());

describe("verified session context", () => {
  it("exposes verified context without changing currentProfile or returning tokens", async () => {
    expect(await currentProfile()).toEqual((await currentSessionContext()).profile);
    const result = await currentSessionContext();
    expect(result.claims).toEqual(mocks.claims);
    expect(result.entryGrant).toEqual({ profileId: USER, expiresAt: mocks.grant.expiresAt });
    expect(result).not.toHaveProperty("access_token");
    expect(result).not.toHaveProperty("refresh_token");
  });
  it.each(["receipt", "grant", "profile", "access"])("rechecks current %s", async (kind) => {
    if (kind === "receipt") mocks.receiptValid = false;
    if (kind === "grant") mocks.grant.active = false;
    if (kind === "profile") mocks.profile.active = false;
    if (kind === "access") mocks.setting.mockResolvedValueOnce(mocks.grant).mockResolvedValueOnce({ active: false });
    await expect(currentSessionContext()).rejects.toMatchObject({ status: kind === "receipt" || kind === "grant" ? 401 : 403 });
  });
  it("preserves the existing MFA_REQUIRED rule", async () => {
    mocks.claims.aal = "aal1";
    await expect(currentProfile()).rejects.toMatchObject({ status: 403, message: "MFA_REQUIRED" });
  });
  it("lists only verified TOTP factors without enrollment or secret fields", async () => {
    mocks.factors.push({ id: OTHER, factor_type: "phone", status: "verified", secret: "do-not-return" },
      { id: OTHER, factor_type: "totp", status: "unverified", secret: "do-not-return" });
    expect(await listStepUpFactors()).toEqual([{ id: FACTOR, friendlyName: "Authenticator" }]);
    expect(mocks.challenge).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it.each([{ factors: [] }, { factors: [{ id: FACTOR, factor_type: "phone", status: "verified" }] }, { factors: [{ id: FACTOR, factor_type: "totp", status: "unverified" }] }])(
    "blocks missing verified TOTP despite aal2: %j", async ({ factors }) => {
      mocks.factors = factors;
      await expect(createStepUpChallenge({ ...bound, factorId: FACTOR })).rejects.toMatchObject({ status: 403 });
      expect(mocks.challenge).not.toHaveBeenCalled();
    });
  it("requires the existing central manager permission", async () => {
    mocks.profile.role = "supervisor";
    expect(await currentProfile()).toMatchObject({ role: "supervisor" });
    await expect(listStepUpFactors()).rejects.toMatchObject({ status: 403 });
  });
  it("rejects unknown fields and operations without echoing OTP or secrets", async () => {
    for (const input of [
      { ...bound, factorId: FACTOR, code },
      { ...bound, factorId: FACTOR, operation: "export_credentials" },
      { ...bound, factorId: FACTOR, secret: "do-not-return" },
      { ...bound, factorId: FACTOR, intentHash: "not-a-hash" },
    ]) await expect(createStepUpChallenge(input)).rejects.toMatchObject({ status: 400, message: "Solicitacao MFA invalida." });
    await expect(verifyStepUp({ ...bound, factorId: FACTOR, challengeId: OTHER, nonce: "A".repeat(43), code: "bad" })).rejects.toMatchObject({ status: 400 });
    await expect(withRecentMfa({ ...bound, proofId: OTHER, code }, vi.fn())).rejects.toMatchObject({ status: 400 });
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
  it("bounds a hung provider and never exposes its response body", async () => {
    vi.useFakeTimers();
    try {
      mocks.listFactors.mockImplementation(() => new Promise(() => {}));
      const result = listStepUpFactors().then(() => null, (error) => error);
      await vi.advanceTimersByTimeAsync(3001);
      expect(await result).toMatchObject({ status: 503, message: "Nao foi possivel verificar o MFA." });
    } finally { vi.useRealTimers(); }
  });
  it("bounds a hung current context", async () => {
    vi.useFakeTimers();
    try {
      mocks.getClaims.mockImplementation(() => new Promise(() => {}));
      const result = listStepUpFactors().then(() => null, (error) => error);
      await vi.advanceTimersByTimeAsync(3001);
      expect(await result).toMatchObject({ status: 503, message: "Verificacao MFA indisponivel." });
    } finally { vi.useRealTimers(); }
  });
});

// This suite owns its cluster, directory and port; it never accepts a database URL or imports parent fixtures.
const pgBin = process.env.MFA_TEST_PG_BIN;
describe.skipIf(!pgBin)("isolated recent MFA PostgreSQL", () => {
  const run = promisify(execFile);
  let directory: string, started = false;
  const binary = (name: string) => join(pgBin!, process.platform === "win32" ? name + ".exe" : name);
  beforeAll(async () => {
    const cache = resolve(import.meta.dirname, "../../../node_modules/.cache");
    await mkdir(cache, { recursive: true });
    directory = await mkdtemp(join(cache, "mfa-phase7-"));
    const server = createServer();
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No isolated test port");
    const port = address.port;
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
    await run(binary("initdb"), ["-D", directory, "-U", "mfa_fixture", "-A", "trust", "--no-locale", "--encoding=UTF8"], { windowsHide: true });
    // pg_ctl's server can inherit execFile pipes on Windows and prevent its close callback.
    started = true;
    await new Promise<void>((done, reject) => {
      const child = spawn(binary("pg_ctl"), ["-D", directory, "-l", join(directory, "server.log"), "-o", "-h 127.0.0.1 -p " + port + " -F", "-w", "-t", "20", "start"], { windowsHide: true, stdio: "ignore" });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? done() : reject(new Error("Isolated PostgreSQL startup failed")));
    });
    mocks.pool = new pg.Pool({ host: "127.0.0.1", port, user: "mfa_fixture", database: "postgres", max: 12, connectionTimeoutMillis: 3000 });
    await mocks.pool.query("CREATE SCHEMA alc_atendimento; CREATE TABLE alc_atendimento.settings(key text PRIMARY KEY,value jsonb NOT NULL); CREATE TABLE alc_atendimento.test_actions(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated");
    await mocks.pool.query(await readFile(new URL("../db/009_recent_mfa.sql", import.meta.url), "utf8"));
  }, 60_000);
  beforeEach(async () => {
    await mocks.pool!.query("TRUNCATE alc_atendimento.settings,alc_atendimento.step_up_attempts,alc_atendimento.step_up_challenges,alc_atendimento.test_actions");
    await register();
  });
  afterAll(async () => {
    await mocks.pool?.end();
    mocks.pool = null;
    if (started) await run(binary("pg_ctl"), ["-D", directory, "-m", "fast", "-w", "-t", "20", "stop"], { windowsHide: true });
  }, 30_000);
  const pool = () => mocks.pool!;
  async function register() {
    await pool().query("INSERT INTO alc_atendimento.settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [entrySessionKey(mocks.claims.session_id), { active: true, profileId: mocks.claims.sub, expiresAt: Date.now() + 600_000 }]);
    await pool().query("INSERT INTO alc_atendimento.settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", ["access_" + mocks.claims.sub, { active: true }]);
  }
  async function challenge(overrides = {}) {
    const target = { ...bound, ...overrides };
    const result = await createStepUpChallenge({ ...target, factorId: FACTOR });
    return { ...target, factorId: FACTOR, challengeId: result.challengeId, nonce: result.nonce, code };
  }
  async function proof(overrides = {}) {
    const request = await challenge(overrides);
    const result = await verifyStepUp(request);
    return { ...bound, ...overrides, proofId: result.proofId };
  }
  async function attemptCount() { return Number((await pool().query("SELECT count(*) AS count FROM alc_atendimento.step_up_attempts")).rows[0].count); }
  async function row(id: string) { return (await pool().query("SELECT * FROM alc_atendimento.step_up_challenges WHERE id=$1", [id])).rows[0]; }
  async function waitForLock(fragment: string) {
    for (let i = 0; i < 100; i++) {
      const { rows } = await pool().query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE $1", ["%" + fragment + "%"]);
      if (rows.length) return;
      await new Promise((done) => setTimeout(done, 10));
    }
    throw new Error("Expected isolated fixture lock wait");
  }

  it.each(["reveal_token_verification", "replace_access_token", "replace_app_secret", "change_webhook_critical"])(
    "binds and atomically consumes closed operation %s", async (operation) => {
      const input = await proof({ operation });
      const action = vi.fn(async (client: pg.PoolClient, profile: { id: string }) => {
        expect(profile.id).toBe(USER);
        expect((await client.query("SELECT consumed_at FROM alc_atendimento.step_up_challenges WHERE id=$1", [input.proofId])).rows[0].consumed_at).toBeInstanceOf(Date);
        await client.query("INSERT INTO alc_atendimento.test_actions(id) VALUES($1)", [input.proofId]);
        return "done";
      });
      await expect(withRecentMfa(input, action)).resolves.toBe("done");
      await expect(withRecentMfa(input, action)).rejects.toMatchObject({ status: 403 });
      expect(action).toHaveBeenCalledTimes(1);
      expect((await pool().query("SELECT * FROM alc_atendimento.test_actions")).rowCount).toBe(1);
    });
  it("seals the nonce and provider challenge while returning proof fields only", async () => {
    const input = await challenge();
    const stored = await row(input.challengeId);
    const providerId = (await mocks.challenge.mock.results[0].value).data.id;
    const verification = await verifyStepUp(input);
    expect(stored.nonce_sealed).not.toContain(input.nonce);
    expect(stored.nonce_sealed).not.toContain(providerId);
    expect(stored.provider_challenge_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.verify).toHaveBeenCalledWith({ factorId: FACTOR, challengeId: providerId, code });
    expect(verification).toEqual({ proofId: input.challengeId, verifiedAt: expect.any(String), expiresAt: expect.any(String) });
    const data = JSON.stringify(await row(input.challengeId));
    for (const secret of [code, "synthetic-access", "synthetic-refresh", input.nonce, providerId]) expect(data).not.toContain(secret);
    const saved = await row(input.challengeId);
    expect(saved.proof_expires_at.getTime() - saved.claimed_at.getTime()).toBeLessThanOrEqual(180_000);
  });
  it.each(["user", "session", "operation", "channel", "intentHash", "factor", "nonce"])(
    "rejects challenge binding mismatch: %s", async (kind) => {
      const input = await challenge();
      if (kind === "user") { mocks.claims.sub = OTHER; await register(); }
      if (kind === "session") { mocks.claims.session_id = OTHER; await register(); }
      if (kind === "operation") input.operation = "replace_app_secret";
      if (kind === "channel") input.channel = "driver";
      if (kind === "intentHash") input.intentHash = "b".repeat(64);
      if (kind === "factor") input.factorId = OTHER;
      if (kind === "nonce") input.nonce = "Z".repeat(43);
      await expect(verifyStepUp(input)).rejects.toMatchObject({ status: 401 });
      expect(mocks.verify).not.toHaveBeenCalled();
      expect(await attemptCount()).toBe(0);
      expect((await row(input.challengeId)).claimed_at).toBeNull();
    });
  it.each(["user", "session", "operation", "channel", "intentHash", "proofId"])(
    "rejects proof binding mismatch: %s", async (kind) => {
      const input = await proof();
      if (kind === "user") { mocks.claims.sub = OTHER; await register(); }
      if (kind === "session") { mocks.claims.session_id = OTHER; await register(); }
      if (kind === "operation") input.operation = "replace_app_secret";
      if (kind === "channel") input.channel = "driver";
      if (kind === "intentHash") input.intentHash = "b".repeat(64);
      if (kind === "proofId") input.proofId = OTHER;
      const action = vi.fn();
      await expect(withRecentMfa(input, action)).rejects.toMatchObject({ status: 403 });
      expect(action).not.toHaveBeenCalled();
    });
  it("does not accept aal2 or an unverified challenge as a proof", async () => {
    const input = await challenge();
    await expect(withRecentMfa({ ...bound, proofId: input.challengeId }, vi.fn())).rejects.toMatchObject({ status: 403 });
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("rejects expired provider and local challenges", async () => {
    mocks.challenge.mockResolvedValueOnce({ data: { id: randomUUID(), type: "totp", expires_at: Date.now() / 1000 - 1 }, error: null });
    await expect(challenge()).rejects.toMatchObject({ status: 503 });
    const input = await challenge();
    await pool().query("UPDATE alc_atendimento.step_up_challenges SET created_at=now()-interval '4 minutes',expires_at=now()-interval '1 minute' WHERE id=$1", [input.challengeId]);
    await expect(verifyStepUp(input)).rejects.toMatchObject({ status: 401 });
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("rejects swapped sealed nonce ciphertext", async () => {
    const a = await challenge(), b = await challenge({ channel: "driver" });
    await pool().query("UPDATE alc_atendimento.step_up_challenges SET nonce_sealed=$1 WHERE id=$2", [(await row(a.challengeId)).nonce_sealed, b.challengeId]);
    await expect(verifyStepUp({ ...b, nonce: a.nonce })).rejects.toMatchObject({ status: 401 });
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("admits a nonce once under concurrent verification", async () => {
    const input = await challenge();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => verifyStepUp(input)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(await attemptCount()).toBe(1);
  });
  it("durably admits only five attempts in fifteen minutes under concurrency", async () => {
    const requests = await Promise.all(Array.from({ length: 8 }, () => challenge()));
    mocks.verify.mockResolvedValue({ data: null, error: { message: "raw provider log " + code } });
    const results = await Promise.allSettled(requests.map(verifyStepUp));
    expect(results.filter((result) => result.status === "rejected" && result.reason.status === 429)).toHaveLength(3);
    expect(results.filter((result) => result.status === "rejected" && result.reason.status === 401)).toHaveLength(5);
    expect(mocks.verify).toHaveBeenCalledTimes(5);
    expect(await attemptCount()).toBe(5);
    expect((await pool().query("SELECT count(*) AS count FROM alc_atendimento.step_up_challenges WHERE verified_at IS NOT NULL")).rows[0].count).toBe("0");
    await expect(challenge()).rejects.toMatchObject({ status: 429 });
  });
  it("keeps attempts across sessions and releases the rolling window", async () => {
    mocks.verify.mockResolvedValue({ data: null, error: { message: "synthetic rejection" } });
    for (let i = 0; i < 5; i++) await expect(verifyStepUp(await challenge())).rejects.toMatchObject({ status: 401 });
    mocks.claims.session_id = OTHER;
    await register();
    await expect(challenge()).rejects.toMatchObject({ status: 429 });
    await pool().query("UPDATE alc_atendimento.step_up_attempts SET attempted_at=clock_timestamp()-interval '15 minutes'");
    await expect(verifyStepUp(await challenge())).rejects.toMatchObject({ status: 401 });
    expect(await attemptCount()).toBe(1);
  });
  it("does not refund an attempt or nonce on thrown provider failure", async () => {
    const input = await challenge();
    mocks.verify.mockRejectedValue(new Error("provider dump " + code + " synthetic-access"));
    await expect(verifyStepUp(input)).rejects.toMatchObject({ status: 401, message: "Nao foi possivel verificar o MFA." });
    await expect(verifyStepUp(input)).rejects.toMatchObject({ status: 401 });
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(await attemptCount()).toBe(1);
  });
  it.each(["user", "session", "aal", "claimsError", "noToken"])(
    "rejects an untrusted provider verification result: %s", async (kind) => {
      const input = await challenge();
      if (kind === "user") mocks.verifiedClaims.sub = OTHER;
      if (kind === "session") mocks.verifiedClaims.session_id = OTHER;
      if (kind === "aal") mocks.verifiedClaims.aal = "aal1";
      if (kind === "claimsError") mocks.getClaims.mockImplementation(async (jwt?: string) => ({ data: { claims: mocks.claims }, error: jwt ? { message: "raw" } : null }));
      if (kind === "noToken") mocks.verify.mockResolvedValue({ data: { user: { id: USER } }, error: null });
      await expect(verifyStepUp(input)).rejects.toMatchObject({ status: 401 });
      expect((await row(input.challengeId)).verified_at).toBeNull();
      expect(await attemptCount()).toBe(1);
    });
  it("rechecks entry revocation before issuing a proof", async () => {
    const input = await challenge();
    mocks.verify.mockImplementation(async () => {
      await pool().query("UPDATE alc_atendimento.settings SET value=jsonb_set(value,'{active}','false') WHERE key=$1", [entrySessionKey(SESSION)]);
      return { data: { user: { id: USER }, access_token: "synthetic-access" }, error: null };
    });
    await expect(verifyStepUp(input)).rejects.toMatchObject({ status: 401 });
    expect((await row(input.challengeId)).verified_at).toBeNull();
  });
  it.each(["grant", "access", "profile", "role", "factor"])(
    "rechecks current central identity and revocation on consumption: %s", async (kind) => {
      const input = await proof();
      if (kind === "grant") await pool().query("UPDATE alc_atendimento.settings SET value=jsonb_set(value,'{active}','false') WHERE key=$1", [entrySessionKey(SESSION)]);
      if (kind === "access") await pool().query("UPDATE alc_atendimento.settings SET value='{\"active\":false}' WHERE key=$1", ["access_" + USER]);
      if (kind === "profile") mocks.profile.active = false;
      if (kind === "role") mocks.profile.role = "supervisor";
      if (kind === "factor") mocks.factors = [];
      const action = vi.fn();
      await expect(withRecentMfa(input, action)).rejects.toMatchObject({ status: kind === "grant" ? 401 : 403 });
      expect(action).not.toHaveBeenCalled();
      expect((await row(input.proofId)).consumed_at).toBeNull();
    });
  it("expires a proof after a slow factor check using the PostgreSQL clock", async () => {
    const input = await proof();
    await pool().query("UPDATE alc_atendimento.step_up_challenges SET proof_expires_at=clock_timestamp()+interval '200 milliseconds' WHERE id=$1", [input.proofId]);
    mocks.listFactors.mockImplementation(async () => {
      await pool().query("SELECT pg_sleep(0.3)");
      return { data: { totp: mocks.factors }, error: null };
    });
    const action = vi.fn();
    await expect(withRecentMfa(input, action)).rejects.toMatchObject({ status: 403 });
    expect(action).not.toHaveBeenCalled();
    expect((await row(input.proofId)).consumed_at).toBeNull();
  });
  it("rechecks entry expiry after the factor check", async () => {
    const input = await proof();
    await pool().query("UPDATE alc_atendimento.settings SET value=jsonb_set(value,'{expiresAt}',to_jsonb($2::bigint)) WHERE key=$1", [entrySessionKey(SESSION), Date.now() + 200]);
    mocks.listFactors.mockImplementation(async () => {
      await pool().query("SELECT pg_sleep(0.3)");
      return { data: { totp: mocks.factors }, error: null };
    });
    const action = vi.fn();
    await expect(withRecentMfa(input, action)).rejects.toMatchObject({ status: 401 });
    expect(action).not.toHaveBeenCalled();
    expect((await row(input.proofId)).consumed_at).toBeNull();
  });
  it("rechecks central profile revoked during the factor check", async () => {
    const input = await proof();
    mocks.listFactors.mockImplementation(async () => {
      mocks.profile.active = false;
      return { data: { totp: mocks.factors }, error: null };
    });
    const action = vi.fn();
    await expect(withRecentMfa(input, action)).rejects.toMatchObject({ status: 403 });
    expect(action).not.toHaveBeenCalled();
    expect((await row(input.proofId)).consumed_at).toBeNull();
  });
  it("rechecks factor revocation before issuing a proof", async () => {
    const input = await challenge();
    mocks.verify.mockImplementation(async () => {
      mocks.factors = [];
      return { data: { user: { id: USER }, access_token: "synthetic-access" }, error: null };
    });
    await expect(verifyStepUp(input)).rejects.toMatchObject({ status: 403 });
    expect((await row(input.challengeId)).verified_at).toBeNull();
    expect(await attemptCount()).toBe(1);
  });
  it("rechecks central profile after a proof lock wait", async () => {
    const input = await proof();
    const blocker = await pool().connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM alc_atendimento.step_up_challenges WHERE id=$1 FOR UPDATE", [input.proofId]);
    const action = vi.fn();
    const result = withRecentMfa(input, action).then(() => null, (error) => error);
    try {
      await waitForLock("SELECT factor_id");
      mocks.profile.active = false;
      await blocker.query("COMMIT");
      expect(await result).toMatchObject({ status: 403 });
      expect(action).not.toHaveBeenCalled();
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
  it("consumes a proof and its SQL action once under concurrency", async () => {
    const input = await proof();
    const action = vi.fn(async (client: pg.PoolClient) => {
      await client.query("INSERT INTO alc_atendimento.test_actions(id) VALUES($1)", [input.proofId]);
    });
    const results = await Promise.allSettled([withRecentMfa(input, action), withRecentMfa(input, action)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected" && result.reason.status === 403)).toHaveLength(1);
    expect(action).toHaveBeenCalledTimes(1);
    expect((await pool().query("SELECT * FROM alc_atendimento.test_actions")).rowCount).toBe(1);
  });
  it("revalidates on the supplied client with all four pool connections occupied", async () => {
    const inputs = [];
    for (let i = 0; i < 4; i++) inputs.push(await proof({ intentHash: String(i).repeat(64) }));
    const oldPool = pool();
    const configuration = { ...oldPool.options, max: 4 };
    await oldPool.end();
    mocks.pool = new pg.Pool(configuration);
    let entered = 0;
    mocks.listFactors.mockImplementation(async () => {
      entered++;
      return { data: { totp: mocks.factors }, error: null };
    });
    await Promise.all(inputs.map((input) => withRecentMfa(input, async (client) => {
      await client.query("INSERT INTO alc_atendimento.test_actions(id) VALUES($1)", [input.proofId]);
    })));
    expect(entered).toBe(4);
    expect((await pool().query("SELECT * FROM alc_atendimento.test_actions")).rowCount).toBe(4);
  });
  it.each(["absent", "inactive", "downgraded"])("rechecks enabledProfiles and canManageUsers under operator_directory: %s", async (kind) => {
    const input = await proof();
    const blocker = await pool().connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))");
    const action = vi.fn();
    const result = withRecentMfa(input, action).then(() => null, (error) => error);
    try {
      await waitForLock("atendimento_operator_directory");
      mocks.directoryProfiles = kind === "absent" ? [] : [{ ...mocks.profile, active: kind !== "inactive", role: kind === "downgraded" ? "supervisor" : "developer" }];
      await blocker.query("COMMIT");
      expect(await result).toMatchObject({ status: 403, message: "Permissao para a operacao critica revogada." });
      expect(action).not.toHaveBeenCalled();
      expect((await row(input.proofId)).consumed_at).toBeNull();
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
  it("bounds operator_directory lock waits without consuming a proof", async () => {
    const input = await proof(), blocker = await pool().connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))");
    const action = vi.fn();
    try {
      await expect(withRecentMfa(input, action)).rejects.toMatchObject({ status: 503, message: "Operacao MFA temporariamente indisponivel." });
      expect(action).not.toHaveBeenCalled();
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    expect((await row(input.proofId)).consumed_at).toBeNull();
  }, 8000);
  it("bounds a directory provider read and blocks late queries on a released client", async () => {
    const input = await proof();
    let finish!: (value: unknown) => void;
    mocks.directoryRead.mockImplementationOnce(() => new Promise((done) => { finish = done; }));
    const query = vi.spyOn(pg.Client.prototype, "query");
    const action = vi.fn();
    try {
      await expect(withRecentMfa(input, action)).rejects.toMatchObject({ status: 503, message: "Nao foi possivel verificar o MFA." });
      const calls = query.mock.calls.length;
      finish({ data: [mocks.profile], error: null });
      await new Promise((done) => setTimeout(done, 20));
      expect(query.mock.calls).toHaveLength(calls);
      expect(action).not.toHaveBeenCalled();
    } finally { query.mockRestore(); }
    expect((await row(input.proofId)).consumed_at).toBeNull();
    await withRecentMfa(input, async (client) => {
      await client.query("INSERT INTO alc_atendimento.test_actions(id) VALUES($1)", [input.proofId]);
    });
  }, 8000);
  it("rolls back proof consumption with a failed SQL action", async () => {
    const input = await proof();
    await expect(withRecentMfa(input, async (client) => {
      await client.query("INSERT INTO alc_atendimento.test_actions(id) VALUES($1)", [input.proofId]);
      throw new Error("synthetic action failure");
    })).rejects.toThrow("synthetic action failure");
    expect((await row(input.proofId)).consumed_at).toBeNull();
    expect((await pool().query("SELECT * FROM alc_atendimento.test_actions")).rowCount).toBe(0);
    await withRecentMfa(input, async (client) => {
      await client.query("INSERT INTO alc_atendimento.test_actions(id) VALUES($1)", [input.proofId]);
    });
    expect((await pool().query("SELECT * FROM alc_atendimento.test_actions")).rowCount).toBe(1);
  });
  it("serializes entry revocation with the action transaction", async () => {
    const input = await proof();
    let entered!: () => void, resume!: () => void;
    const inAction = new Promise<void>((done) => { entered = done; });
    const releaseAction = new Promise<void>((done) => { resume = done; });
    const action = withRecentMfa(input, async (client) => {
      entered();
      await releaseAction;
      await client.query("INSERT INTO alc_atendimento.test_actions(id) VALUES($1)", [input.proofId]);
    });
    await inAction;
    const revocation = pool().query("UPDATE alc_atendimento.settings SET value=jsonb_set(value,'{active}','false') WHERE key=$1", [entrySessionKey(SESSION)]);
    try {
      await waitForLock("jsonb_set");
    } finally { resume(); }
    await action;
    await revocation;
    await expect(withRecentMfa(input, vi.fn())).rejects.toMatchObject({ status: 401 });
  });
  it("denies client-role reads and enforces proof schema constraints", async () => {
    expect((await pool().query("SELECT has_table_privilege('anon','alc_atendimento.step_up_challenges','SELECT') AS allowed")).rows[0].allowed).toBe(false);
    expect((await pool().query("SELECT has_sequence_privilege('authenticated','alc_atendimento.step_up_attempts_id_seq','USAGE') AS allowed")).rows[0].allowed).toBe(false);
    const input = await challenge();
    await expect(pool().query("UPDATE alc_atendimento.step_up_challenges SET operation='export_credentials' WHERE id=$1", [input.challengeId])).rejects.toMatchObject({ code: "23514" });
    await expect(pool().query("UPDATE alc_atendimento.step_up_challenges SET consumed_at=clock_timestamp() WHERE id=$1", [input.challengeId])).rejects.toMatchObject({ code: "23514" });
  });
});
