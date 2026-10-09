import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), enabledProfiles: vi.fn(), query: vi.fn(), setting: vi.fn(), connect: vi.fn(), audit: vi.fn() }));
vi.mock("../lib/auth", async original => ({ ...(await original()), currentProfile: mocks.profile }));
vi.mock("../lib/db", () => ({ db: () => ({ query: mocks.query, connect: mocks.connect }), core: vi.fn(), setting: mocks.setting, audit: mocks.audit }));
vi.mock("../lib/operator-directory", async original => ({ ...(await original()), enabledProfiles: mocks.enabledProfiles }));
import type { AuthProfile } from "@alc/identity/auth";
import { GET, POST } from "../app/api/[resource]/route";
import { AI_CONFIG_KEY, defaultAiConfig, saveAiConfig, saveInstructions, INSTRUCTION_KEY } from "../lib/agent-instructions";
import { CUSTOMER_STEPS } from "../lib/agent-playbook";

const actor: AuthProfile = { id: "11111111-1111-4111-8111-111111111111", email: "synthetic@example.test", fullName: "Synthetic Manager", role: "developer", globalAccess: true, baseScope: [], siglaScope: [] };
const config = { ...defaultAiConfig, enabled: true, model: "gpt-4.1-mini" };
const context = (resource: string) => ({ params: Promise.resolve({ resource }) });
const request = (resource: string, body: unknown, origin = "https://example.test") => new Request(`https://example.test/api/${resource}`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
});
let values: Map<string, unknown>, queries: string[], releases: ReturnType<typeof vi.fn>[];
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "synthetic-openai-key");
  vi.stubEnv("GEMINI_API_KEY", "synthetic-gemini-key");
  values = new Map(); queries = []; releases = [];
  mocks.profile.mockResolvedValue(actor);
  mocks.enabledProfiles.mockResolvedValue([actor]);
  mocks.setting.mockImplementation(async key => values.get(key));
  mocks.query.mockResolvedValue({ rows: [{ calls: 3 }] });
  let unlock: (() => void) | undefined;
  let previous = Promise.resolve();
  mocks.connect.mockImplementation(async () => {
    const release = vi.fn(); releases.push(release);
    let myUnlock: (() => void) | undefined;
    return { release, query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push(sql);
      if (sql.includes("pg_advisory_xact_lock") && sql.includes("atendimento_operator_directory")) {
        const wait = previous;
        previous = new Promise<void>(resolve => { unlock = resolve; });
        myUnlock = unlock;
        await wait;
      }
      if (sql.includes("FOR UPDATE")) return { rows: values.has(String(params?.[0])) ? [{ value: values.get(String(params?.[0])) }] : [] };
      if (sql.startsWith("INSERT INTO alc_atendimento.settings")) values.set(String(params?.[0]), params?.[1]);
      if (sql === "COMMIT" || sql === "ROLLBACK") myUnlock?.();
      return { rows: [], rowCount: 0 };
    }) };
  });
});
afterEach(() => vi.unstubAllEnvs());
it("serializes concurrent first writes and rejects stale optimistic settings revisions", async () => {
  const results = await Promise.allSettled([saveAiConfig(actor, config), saveAiConfig(actor, { ...config, provider: "gemini", model: "gemini-2.5-flash" })]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
  expect(values.get(AI_CONFIG_KEY)).toMatchObject({ revision: 1 });
  expect(queries).toContain("SELECT value FROM alc_atendimento.settings WHERE key=$1 FOR UPDATE");
  expect(queries.filter(sql => sql.includes("pg_advisory_xact_lock"))).toHaveLength(4);
  expect(mocks.audit).toHaveBeenCalledOnce();
  expect(releases.every(release => release.mock.calls.length === 1)).toBe(true);
});
it("preserves editable policies and legacy script settings under the same transaction lock", async () => {
  values.set(INSTRUCTION_KEY, { revision: 4, scripts: {}, policies: ["Preservar restrições da equipe."] });
  const original = CUSTOMER_STEPS.find(step => step.code === "C02")!;
  const entry = { channel: "client", code: original.code, title: original.title, goal: original.goal, example: original.example + " Obrigado." };
  expect(await saveInstructions(actor, { kind: "script", revision: 4, entry })).toEqual({ ok: true, revision: 5 });
  expect(values.get(INSTRUCTION_KEY)).toMatchObject({ revision: 5, policies: ["Preservar restrições da equipe."], scripts: { "client:C02": entry } });
  expect(queries).toContain("COMMIT");
  expect(mocks.audit.mock.calls[0][4]).toBeDefined();
});
it("rejects enabling without model and prevents credential mass assignment", async () => {
  for (const body of [{ ...config, model: "" }, { ...config, apiKey: "sensitive" }, { ...config, dailyCallLimit: 1001 }]) {
    const response = await POST(request("ai-config", body), context("ai-config"));
    expect(response.status).toBe(400);
  }
  expect(mocks.connect).not.toHaveBeenCalled();
});
it("restricts configuration and instruction updates to admins and same-origin requests", async () => {
  const policies = { kind: "policies", revision: 0, policies: ["Preservar restrições da equipe."] };
  for (const [resource, body] of [["ai-config", config], ["agent-instructions", policies]] as const) {
    expect((await POST(request(resource, body, "https://attacker.test"), context(resource))).status).toBe(403);
    mocks.profile.mockResolvedValue({ ...actor, role: "supervisor" });
    expect((await POST(request(resource, body), context(resource))).status).toBe(403);
    mocks.profile.mockResolvedValue(actor);
  }
  expect(mocks.connect).not.toHaveBeenCalled();
});
it.each([{ profiles: [] }, { profiles: [{ ...actor, role: "supervisor" }] }])("revalidates revoked or demoted management privilege under directory lock before settings lock", async ({ profiles }) => {
  mocks.enabledProfiles.mockResolvedValue(profiles);
  await expect(saveAiConfig(actor, config)).rejects.toMatchObject({ status: 403 });
  await expect(saveInstructions(actor, { kind: "policies", revision: 0, policies: ["Preservar restrições da equipe."] })).rejects.toMatchObject({ status: 403 });
  expect(queries.filter(sql => sql.includes("atendimento_operator_directory"))).toHaveLength(2);
  expect(queries.some(sql => sql.includes("alc_atendimento_agent_settings"))).toBe(false);
  expect(queries.filter(sql => sql === "ROLLBACK")).toHaveLength(2);
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(values.size).toBe(0);
});
it("acquires directory lock, revalidates profile, then settings lock and audits within the transaction", async () => {
  mocks.enabledProfiles.mockImplementation(async transaction => {
    expect(transaction.query).toBeDefined();
    expect(queries.at(-1)).toContain("atendimento_operator_directory");
    return [actor];
  });
  expect((await POST(request("ai-config", config), context("ai-config"))).status).toBe(200);
  expect(queries.slice(0, 3)).toEqual(["BEGIN", "SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))", "SELECT pg_advisory_xact_lock(hashtext('alc_atendimento_agent_settings'))"]);
  expect(mocks.audit.mock.calls[0][0]).toBe(actor.id);
});
it("returns only managed configuration, environment names and daily budget counters", async () => {
  values.set(AI_CONFIG_KEY, config);
  const response = await GET(new Request("https://example.test/api/ai-config"), context("ai-config"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ config, used: 3, remaining: 7, credentialEnv: "OPENAI_API_KEY", credentials: { openai: { configured: true, source: "environment" } }, diagnostic: { effective: "untested" } });
  expect(JSON.stringify(body)).not.toContain("synthetic-openai-key");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("requires a successful credential-bound structured probe for a manual model", async () => {
  await expect(saveAiConfig(actor, { ...config, model: "custom-model" })).rejects.toMatchObject({ status: 409 });
  expect(values.has(AI_CONFIG_KEY)).toBe(false);
  await expect(saveAiConfig(actor, { ...config, model: "https://attacker.test/model" })).rejects.toMatchObject({ status: 400 });
});
it("migration makes treatment snapshots and request claims append-only", () => {
  const sql = readFileSync(new URL("../db/006_agent_decisions.sql", import.meta.url), "utf8");
  expect(sql).toContain("BEFORE UPDATE OR DELETE ON alc_atendimento.agent_decisions");
  expect(sql).toContain("BEFORE UPDATE OR DELETE ON alc_atendimento.agent_ai_call_claims");
  expect(sql).toContain("inbound_message_id uuid PRIMARY KEY");
  expect(sql).toContain('"enabled":false');
  expect(sql).toContain("instruction_snapshot jsonb NOT NULL");
  expect(sql).toContain("REVOKE ALL");
});
