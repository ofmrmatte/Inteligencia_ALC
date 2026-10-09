import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), txQuery: vi.fn(), setting: vi.fn(), audit: vi.fn(), graph: vi.fn(), source: vi.fn(), channelConfig: vi.fn() }));
vi.mock("../lib/db", () => ({ db: () => ({ query: mocks.query, connect: mocks.connect }), setting: mocks.setting, audit: mocks.audit, core: vi.fn() }));
vi.mock("../lib/meta", () => ({ channelConfig: mocks.channelConfig, graph: mocks.graph }));
vi.mock("../lib/source", () => ({ syncCore: mocks.source }));
vi.mock("pg", () => ({ default: { Pool: class { query = mocks.query; on = vi.fn(); } } }));
import { processEvents, processOutbox, queueText } from "../lib/worker";
import { defaultAiConfig } from "../lib/agent-instructions";
import { clientReply } from "../lib/domain";
import type { AgentState } from "../lib/domain";

const config = { ...defaultAiConfig, enabled: true, model: "configured-model" };
const id = "11111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";
let text: string, inserted: boolean, charged: boolean, bot: boolean, type: string, timestamp: string, priorText: string;
let conversation: { id: string; phone: string; channel: "client" | "driver"; status: string; identity_verified: boolean; driver_id: string; case_id: string; base_key: string; sigla: string; name: string; assigned_to?: string; agent_state: AgentState; last_inbound_at: string };
const response = (actionId = "yes") => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ actionId, rationale: "clear_match" }) } }] }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "synthetic-secret");
  vi.stubEnv("ATENDIMENTO_DATABASE_URL", "postgres://synthetic-test-only");
  text = "O pacote já está comigo"; inserted = false; charged = false; bot = true; type = "text"; priorText = "";
  timestamp = String(Math.floor(Date.now()/1000));
  conversation = { id, phone: "5511999990000", channel: "client", status: "bot", identity_verified: true, driver_id: "private-driver", case_id: "private-case", base_key: "synthetic-base", sigla: "synthetic-unit", name: "Pessoa Sintética", agent_state: { step: "receipt" }, last_inbound_at: new Date().toISOString() };
  mocks.channelConfig.mockResolvedValue({ phoneId: "synthetic-phone-id" });
  mocks.setting.mockImplementation(async key => key === "automation" ? { bot } : config);
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT * FROM alc_atendimento.webhook_events")) return { rows: [{ event_key: "synthetic-event", channel: conversation.channel, payload: { entry: [{ changes: [{ value: { metadata: { phone_number_id: "synthetic-phone-id" }, messages: [{ id: "synthetic-inbound", from: conversation.phone, timestamp, type, ...(type === "audio" ? { audio: { id: "synthetic-audio-id", mime_type: "audio/ogg", voice: true } } : { text: { body: text } }) }] } }] }] } }] };
    if (sql.startsWith("WITH config")) {
      const fresh = !charged; charged = true;
      return { rows: [{ current_config: true, claimed: fresh, reserved: fresh }] };
    }
    return { rows: [], rowCount: 0 };
  });
  mocks.txQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.startsWith("SELECT value") && params?.[0] === "agent_ai_config_v1") return { rows: [{ value: config }] };
    if (sql.startsWith("SELECT body")) return { rows: priorText ? [{ body: priorText }] : [] };
    if (sql.startsWith("INSERT INTO alc_atendimento.conversations")) return { rows: [conversation], rowCount: 1 };
    if (sql.startsWith("INSERT INTO alc_atendimento.messages")) {
      const fresh = !inserted; inserted = true;
      return { rows: fresh ? [{ id: messageId }] : [], rowCount: fresh ? 1 : 0 };
    }
    if (sql.includes("SET agent_state=$2,status=$3")) return { rows: [{ id }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  mocks.connect.mockResolvedValue({ query: mocks.txQuery, release: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => response()));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("inbound integrates validated AI, immutable instruction/policy snapshots and ai outbox authorship", async () => {
  await processEvents();
  expect(fetch).toHaveBeenCalledOnce();
  const snapshot = mocks.txQuery.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.agent_decisions"))?.[1];
  expect(snapshot?.[0]).toBe(messageId);
  expect(snapshot?.[3]).toMatchObject({ revision: 0, policies: expect.any(Array), mandatoryPolicies: expect.any(Array), playbookVersion: expect.any(String) });
  expect(snapshot?.[4]).toEqual(config);
  expect(snapshot?.[5]).toMatchObject({ status: "applied", reason: "allowlisted", nextStep: "date" });
  const queued = mocks.txQuery.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"))?.[1];
  expect(queued?.slice(5)).toEqual(["ai", null, "Ellie"]);
  expect(queued?.[4].text.body).toBe(clientReply({ step: "receipt" }, "Sim, correto").reply);
  expect(mocks.graph).not.toHaveBeenCalled();
  expect(mocks.source).not.toHaveBeenCalled();
  expect(mocks.audit).toHaveBeenCalledWith(null, "agent_decision", id, expect.objectContaining({ reason: "allowlisted" }), expect.any(Object));
});
it("records off and terminal fallback treatments without provider calls", async () => {
  const implementation = mocks.txQuery.getMockImplementation()!;
  mocks.txQuery.mockImplementation(async (sql, params) => sql.startsWith("SELECT value") && params?.[0] === "agent_ai_config_v1" ? { rows: [{ value: defaultAiConfig }] } : implementation(sql, params));
  await processEvents();
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.audit).toHaveBeenCalledWith(null, "agent_decision", id, expect.objectContaining({ status: "off", reason: "disabled" }), expect.any(Object));
  inserted = false; mocks.txQuery.mockClear();
  mocks.txQuery.mockImplementation(implementation);
  text = "Não quero contato";
  mocks.setting.mockImplementation(async key => key === "automation" ? { bot: true } : config);
  await processEvents();
  const update = mocks.txQuery.mock.calls.find(([sql]) => sql.includes("SET agent_state=$2,status=$3"))?.[1];
  expect(update?.[2]).toBe("human");
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["bot", "human"])("client audio queues only Ellie's notice for %s without changing state, owner or case even when bot is off", async status => {
  type = "audio"; bot = false; conversation.status = status;
  conversation.assigned_to = "synthetic-owner";
  conversation.agent_state = { step: status === "human" ? "human" : "product", receivedAt: "07/10" };
  const before = structuredClone(conversation);
  await processEvents();
  const recorded = mocks.txQuery.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.messages"))?.[1];
  expect(recorded?.[1]).toBe("synthetic-inbound");
  expect(recorded?.[3]).toBe("audio");
  expect(recorded?.[4]).toMatchObject({ id: "synthetic-audio-id", mime: "audio/ogg", voice: true });
  expect(recorded?.[5]).toBe(before.case_id);
  const queued = mocks.txQuery.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"));
  expect(queued?.[1]?.slice(5)).toEqual(["ai", null, "Ellie", "unsupported_client_audio_v1"]);
  expect(queued?.[1]?.[0]).toBe("reply:audio:synthetic-inbound");
  expect(queued?.[1]?.[7]).toBe("Ellie");
  expect(queued?.[1]?.[4].text.body).toBe("A Ellie não oferece suporte a áudio. Por favor, envie sua mensagem por texto.");
  expect(conversation.status).toBe(before.status);
  expect(conversation.agent_state).toEqual(before.agent_state);
  expect(conversation.assigned_to).toBe(before.assigned_to);
  expect(conversation.case_id).toBe(before.case_id);
  expect(mocks.txQuery.mock.calls.some(([sql]) => sql.includes("SET agent_state") || sql.includes("SET status=") || sql.includes("agent_decisions"))).toBe(false);
  await processEvents();
  expect(mocks.txQuery.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"))).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.graph).not.toHaveBeenCalled();
  expect(mocks.source).not.toHaveBeenCalled();
});

async function processQueuedAudioNotice(status: "bot" | "human" | "pending", condition?: "optout" | "window" | "resolved") {
  type = "audio";
  bot = false;
  conversation.status = status;
  conversation.assigned_to = status === "human" ? "synthetic-owner" : undefined;
  conversation.agent_state = { step: status === "human" ? "staff" : "product" };
  await processEvents();
  await processEvents();
  expect(mocks.txQuery.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"))).toHaveLength(1);
  const values = mocks.txQuery.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"))?.[1] as unknown[];
  const job = {
    id: "synthetic-audio-job",
    dedupe_key: values[0], conversation_id: values[1], channel: values[2], phone: values[3], payload: values[4],
    sender_kind: values[5], sender_user_id: values[6], sender_display_name_snapshot: values[7], agent_policy: values[8],
    status: "pending", attempts: 0,
  };
  if (condition === "optout") conversation.agent_state = { ...conversation.agent_state, optOut: true };
  if (condition === "window") conversation.last_inbound_at = new Date(Date.now() - 86_400_001).toISOString();
  if (condition === "resolved") {
    conversation.status = "resolved";
    conversation.agent_state = { step: "done" };
  }
  mocks.channelConfig.mockResolvedValue({ phoneId: "synthetic-phone-id", token: "synthetic-token", appSecret: "synthetic-secret" });
  mocks.query.mockImplementation(async (sql: string) => sql.startsWith("SELECT * FROM alc_atendimento.outbox") && job.status === "pending" ? { rows: [job] } : { rows: [], rowCount: 0 });
  mocks.txQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("status='sending'")) return job.status = "sending", { rows: [{ id: job.id }], rowCount: 1 };
    if (sql.startsWith("SELECT conversation_id,provider_id")) return { rows: [{ conversation_id: id, provider_id: "synthetic-inbound", direction: "in", type: "audio", created_at: new Date().toISOString() }] };
    if (sql.startsWith("SELECT body")) return { rows: [] };
    if (sql.includes("SELECT c.*,k.classification")) return { rows: [{ ...conversation, audio_case_classification: undefined }] };
    if (sql.includes("status='cancelled'")) return job.status = "cancelled", { rowCount: 1 };
    if (sql.includes("status='sent'")) return job.status = "sent", { rowCount: 1 };
    if (sql.includes("status='uncertain'")) return { rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  mocks.graph.mockResolvedValue({ messages: [{ id: "synthetic-provider-id" }] });
  await processOutbox();
  return job;
}

it.each(["bot", "human", "pending"] as const)("runs the real inbound-to-outbox audio path once for %s ownership with bot automation off", async status => {
  const job = await processQueuedAudioNotice(status);
  expect(job.status).toBe("sent");
  expect(mocks.graph).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ phoneId: "synthetic-phone-id" }),
    "synthetic-phone-id/messages",
    expect.objectContaining({ text: { body: "A Ellie não oferece suporte a áudio. Por favor, envie sua mensagem por texto." } }),
  );
  await processOutbox();
  expect(mocks.graph).toHaveBeenCalledOnce();
});

it.each(["optout", "window", "resolved"] as const)("cancels queued audio notice after inbound processing when conversation becomes %s", async condition => {
  const job = await processQueuedAudioNotice("human", condition);
  expect(job.status).toBe("cancelled");
  expect(mocks.graph).not.toHaveBeenCalled();
});

it.each(["optout", "legacy_optout", "expired", "resolved"])("client audio preserves %s and does not queue a notice", async condition => {
  type = "audio";
  if (condition === "optout") conversation.agent_state = { step: "human", optOut: true };
  if (condition === "legacy_optout") { conversation.status = "human"; priorText = "Não quero contato"; }
  if (condition === "expired") timestamp = String(Math.floor(Date.now()/1000) - 86401);
  if (condition === "resolved") { conversation.status = "resolved"; conversation.agent_state = { step: "done" }; }
  await processEvents();
  expect(mocks.txQuery.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"))).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.graph).not.toHaveBeenCalled();
});
it("does not invent the customer audio notice in the driver channel", async () => {
  type = "audio"; conversation.channel = "driver"; conversation.status = "human";
  await processEvents();
  expect(mocks.txQuery.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"))).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps human queue attribution separate from Ellie and preserves a supplied historical display name", async () => {
  const transaction = await mocks.connect();
  await queueText(conversation, "Resposta da equipe", "synthetic-human-reply", "11111111-1111-4111-8111-111111111111", transaction, "Atendente Histórico");
  const queued = mocks.txQuery.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"))?.[1];
  expect(queued?.slice(5)).toEqual(["human", "11111111-1111-4111-8111-111111111111", "Atendente Histórico"]);
  expect(fetch).not.toHaveBeenCalled();
});
it("persists human opt-out without changing owner, case or step and blocks a later audio notice", async () => {
  text = "Não quero contato"; conversation.status = "human"; conversation.assigned_to = "synthetic-owner"; conversation.agent_state = { step: "staff" };
  await processEvents();
  expect(conversation.agent_state).toEqual({ step: "staff", optOut: true });
  expect(conversation.status).toBe("human");
  expect(conversation.assigned_to).toBe("synthetic-owner");
  inserted = false; type = "audio";
  await processEvents();
  expect(mocks.txQuery.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"))).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it("duplicate inbound never repeats the charged provider request", async () => {
  await processEvents();
  await processEvents();
  expect(fetch).toHaveBeenCalledOnce();
});
it("a rolled-back decision insertion replays deterministically without refund or a second provider request", async () => {
  const implementation = mocks.txQuery.getMockImplementation()!;
  let fail = true;
  mocks.txQuery.mockImplementation(async (sql, params) => {
    if (sql.startsWith("INSERT INTO alc_atendimento.agent_decisions") && fail) {
      fail = false;
      throw new Error("Synthetic decision insert failure");
    }
    if (sql === "ROLLBACK") inserted = false;
    return implementation(sql, params);
  });
  await processEvents();
  expect(mocks.txQuery).toHaveBeenCalledWith("ROLLBACK");
  expect(fetch).toHaveBeenCalledOnce();
  expect(charged).toBe(true);
  await processEvents();
  expect(fetch).toHaveBeenCalledOnce();
  expect(mocks.audit).toHaveBeenLastCalledWith(null, "agent_decision", id, expect.objectContaining({ reason: "duplicate_request" }), expect.any(Object));
});
it.each(["human", "resolved"])("never invokes AI or changes snapshots for %s-owned conversations", async status => {
  conversation.status = status;
  await processEvents();
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.txQuery.mock.calls.some(([sql]) => sql.includes("agent_decisions"))).toBe(false);
});
