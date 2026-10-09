import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfile } from "@alc/identity/auth";
const identities = vi.hoisted(() => ({ enabled: vi.fn() }));
vi.mock("../lib/operator-directory", async original => ({ ...(await original()), enabledProfiles: identities.enabled }));
import { db } from "../lib/db";
import { reserveAiCall } from "../lib/agent-ai";
import { AI_CONFIG_KEY, defaultAiConfig, saveAiConfig } from "../lib/agent-instructions";
import { CLIENT_AUDIO_NOTICE_POLICY, clientAudioNoticeAllowed, clientAudioNoticeText } from "../lib/domain";
import { migrate } from "../scripts/migrations.mjs";

const fixtureUrl = process.env.ATENDIMENTO_TEST_DATABASE_URL;
if (fixtureUrl) {
  const url = new URL(fixtureUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/alc_atendimento_test")
    throw new Error("Only the isolated local Atendimento test database is permitted");
}
describe.skipIf(!fixtureUrl)("isolated phase5 AI PostgreSQL", () => {
  let client: pg.Client;
  const actor: AuthProfile = { id: "11111111-1111-4111-8111-111111111111", fullName: "Synthetic Manager", email: "synthetic@example.test", role: "developer", globalAccess: true, baseScope: [], siglaScope: [] };
  const config = { ...defaultAiConfig, enabled: true, model: "configured-model", dailyCallLimit: 3 };
  beforeAll(async () => {
    vi.stubEnv("ATENDIMENTO_DATABASE_URL", fixtureUrl!);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in local fixture"); }));
    client = new pg.Client({ connectionString: fixtureUrl, application_name: "phase5_ai_isolated_fixture" });
    await client.connect();
    await migrate(client);
  });
  beforeEach(async () => {
    identities.enabled.mockResolvedValue([actor]);
    await client.query("DELETE FROM alc_atendimento.agent_ai_daily_usage");
    await client.query("INSERT INTO alc_atendimento.settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [AI_CONFIG_KEY, config]);
  });
  afterAll(async () => {
    await client?.end();
    await db().end();
    const globals = globalThis as typeof globalThis & { atendimentoAiBudget?: pg.Pool; atendimentoDb?: pg.Pool };
    await globals.atendimentoAiBudget?.end();
    delete globals.atendimentoAiBudget;
    delete globals.atendimentoDb;
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });
  it("enforces the atomic daily cap across 20 concurrent independent claims", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveAiCall(randomUUID(), config)));
    expect(results.filter(result => result === null)).toHaveLength(3);
    expect(results.filter(result => result === "budget_exhausted")).toHaveLength(17);
    expect((await client.query("SELECT calls FROM alc_atendimento.agent_ai_daily_usage")).rows).toEqual([{ calls: 3 }]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps paid-attempt claims durable after inbound rollback and excludes duplicate cost", async () => {
    const inbound = randomUUID();
    await client.query("BEGIN");
    await client.query("SELECT 1");
    expect(await reserveAiCall(inbound, config)).toBeNull();
    await client.query("ROLLBACK");
    expect(await reserveAiCall(inbound, config)).toBe("duplicate_request");
    expect((await client.query("SELECT calls FROM alc_atendimento.agent_ai_daily_usage")).rows).toEqual([{ calls: 1 }]);
  });
  it("reserves independently while every inbound pool connection is occupied", async () => {
    const held = await Promise.all(Array.from({ length: 4 }, () => db().connect()));
    try {
      for (const transaction of held) await transaction.query("BEGIN");
      expect(await reserveAiCall(randomUUID(), config)).toBeNull();
    } finally {
      for (const transaction of held) { await transaction.query("ROLLBACK"); transaction.release(); }
    }
  });
  it("rejects a config changed or disabled after snapshot without charging", async () => {
    await client.query("UPDATE alc_atendimento.settings SET value=$2 WHERE key=$1", [AI_CONFIG_KEY, { ...config, revision: 1, enabled: false }]);
    expect(await reserveAiCall(randomUUID(), config)).toBe("config_changed");
    expect((await client.query("SELECT calls FROM alc_atendimento.agent_ai_daily_usage")).rowCount).toBe(0);
  });
  it("serializes first settings CAS writes and revalidates directory authorization in the transaction", async () => {
    await client.query("DELETE FROM alc_atendimento.settings WHERE key=$1", [AI_CONFIG_KEY]);
    const results = await Promise.allSettled([saveAiConfig(actor, config), saveAiConfig(actor, { ...config, provider: "gemini" })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    identities.enabled.mockResolvedValue([]);
    await expect(saveAiConfig(actor, { ...config, revision: 1 })).rejects.toMatchObject({ status: 403 });
    expect((await client.query("SELECT value FROM alc_atendimento.settings WHERE key=$1", [AI_CONFIG_KEY])).rows[0].value.revision).toBe(1);
    expect(identities.enabled.mock.calls.every(([transaction]) => typeof transaction.query === "function")).toBe(true);
  });
  it("database triggers reject updates and deletes of decisions and request claims", async () => {
    const conversation = (await client.query("INSERT INTO alc_atendimento.conversations(channel,phone) VALUES('client',$1) RETURNING id", [randomUUID()])).rows[0].id;
    const message = (await client.query("INSERT INTO alc_atendimento.messages(conversation_id,direction,body) VALUES($1,'in','synthetic') RETURNING id", [conversation])).rows[0].id;
    await client.query("INSERT INTO alc_atendimento.agent_decisions(inbound_message_id,conversation_id,instruction_revision,instruction_snapshot,config_snapshot,decision) VALUES($1,$2,0,$3,$4,$5)", [message, conversation, { revision: 0 }, config, { status: "off", reason: "disabled" }]);
    const inbound = randomUUID();
    await reserveAiCall(inbound, config);
    for (const sql of [
      "UPDATE alc_atendimento.agent_decisions SET decision='{}' WHERE inbound_message_id=$1",
      "DELETE FROM alc_atendimento.agent_decisions WHERE inbound_message_id=$1",
    ]) await expect(client.query(sql, [message])).rejects.toThrow("immutable");
    for (const sql of [
      "UPDATE alc_atendimento.agent_ai_call_claims SET config_revision=99 WHERE inbound_key=$1",
      "DELETE FROM alc_atendimento.agent_ai_call_claims WHERE inbound_key=$1",
    ]) await expect(client.query(sql, [inbound])).rejects.toThrow("immutable");
  });
  it("persists the restricted audio notice marker and fails policy readback after opt-out or closure", async () => {
    const conversation = (await client.query("INSERT INTO alc_atendimento.conversations(channel,phone,status,assigned_to,agent_state,last_inbound_at) VALUES('client',$1,'human',$2,'{\"step\":\"human\"}',now()) ON CONFLICT(channel,phone) DO UPDATE SET status='human',assigned_to=excluded.assigned_to,agent_state=excluded.agent_state,last_inbound_at=now() RETURNING *", ["5511999990001", actor.id])).rows[0];
    const providerId = randomUUID();
    const inbound = (await client.query("INSERT INTO alc_atendimento.messages(conversation_id,provider_id,direction,type,body) VALUES($1,$2,'in','audio','[audio recebido]') RETURNING *", [conversation.id, providerId])).rows[0];
    const payload = { messaging_product: "whatsapp", to: conversation.phone, type: "text", text: { body: clientAudioNoticeText() } };
    const key = `reply:audio:${providerId}`;
    for (let attempt=0; attempt<2; attempt++) await client.query("INSERT INTO alc_atendimento.outbox(dedupe_key,conversation_id,channel,phone,payload,agent_policy) VALUES($1,$2,'client',$3,$4,$5) ON CONFLICT(dedupe_key) DO NOTHING", [key, conversation.id, conversation.phone, payload, CLIENT_AUDIO_NOTICE_POLICY]);
    const result = await client.query("SELECT * FROM alc_atendimento.outbox WHERE dedupe_key=$1", [key]);
    expect(result.rowCount).toBe(1);
    // The fixed policy validates authorship independently of the queue's defaults.
    const job = { ...result.rows[0], sender_kind: "ai", sender_user_id: null, sender_display_name_snapshot: "Ellie" };
    expect(clientAudioNoticeAllowed(conversation, job, inbound, "")).toBe(true);
    await client.query("UPDATE alc_atendimento.conversations SET agent_state=jsonb_set(agent_state,'{optOut}','true') WHERE id=$1", [conversation.id]);
    let fresh = (await client.query("SELECT * FROM alc_atendimento.conversations WHERE id=$1", [conversation.id])).rows[0];
    expect(clientAudioNoticeAllowed(fresh, job, inbound, "")).toBe(false);
    await client.query("UPDATE alc_atendimento.conversations SET status='resolved',agent_state='{\"step\":\"done\"}' WHERE id=$1", [conversation.id]);
    fresh = (await client.query("SELECT * FROM alc_atendimento.conversations WHERE id=$1", [conversation.id])).rows[0];
    expect(clientAudioNoticeAllowed(fresh, job, inbound, "")).toBe(false);
    await expect(client.query("UPDATE alc_atendimento.outbox SET agent_policy='arbitrary_bypass' WHERE dedupe_key=$1", [key])).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
