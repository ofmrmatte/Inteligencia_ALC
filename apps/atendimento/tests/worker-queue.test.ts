import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };
const mocks = vi.hoisted(() => {
  const query = vi.fn<(sql: string, values?: unknown[]) => Promise<QueryResult>>();
  const transactionQuery = vi.fn<(sql: string, values?: unknown[]) => Promise<QueryResult>>();
  const transaction = { query: transactionQuery, release: vi.fn() };
  return {
    query, transactionQuery, transaction, connect: vi.fn(), audit: vi.fn(),
    channelConfig: vi.fn(), graph: vi.fn(), setting: vi.fn(),
  };
});
vi.mock("../lib/db", () => ({
  db: () => ({ query: mocks.query, connect: mocks.connect }),
  audit: mocks.audit, setting: mocks.setting,
}));
vi.mock("../lib/meta", () => ({ channelConfig: mocks.channelConfig, graph: mocks.graph }));
vi.mock("../lib/source", () => ({ syncCore: vi.fn() }));

import { botReplyAllowed, queueText, processOutbox, processEvents } from "../lib/worker";

const ID = "11111111-1111-4111-8111-111111111111";
const OWN = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-08T15:00:00Z");
const config = { phoneId: "synthetic-phone-id", token: "synthetic-token", appSecret: "synthetic-secret" };
const transaction = mocks.transaction as unknown as PoolClient;
const empty = (): QueryResult => ({ rows: [], rowCount: 0 });
let conversation: Parameters<typeof queueText>[0];
let job: {
  id: string; conversation_id: string; channel: string; phone: string;
  dedupe_key: string; status: string; payload: { type: string; text: { body: string } };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
  conversation = {
    id: ID, channel: "client", phone: "5511999990000", status: "bot",
    identity_verified: true, driver_id: "synthetic-driver", agent_state: { step: "receipt" },
    last_inbound_at: NOW.toISOString(), case_id: "synthetic-case", base_key: "BASE A", sigla: "SP", assigned_to: null,
  };
  job = {
    id: "synthetic-job", conversation_id: ID, channel: "client", phone: conversation.phone,
    dedupe_key: "reply:synthetic-inbound", status: "pending", payload: { type: "text", text: { body: "Synthetic reply" } },
  };
  mocks.query.mockReset().mockImplementation(async (sql) => sql.startsWith("SELECT * FROM alc_atendimento.outbox")
    ? { rows: job.status === "pending" ? [job] : [], rowCount: job.status === "pending" ? 1 : 0 } : empty());
  mocks.transactionQuery.mockReset().mockImplementation(async (sql, values) => {
    if (sql.includes("RETURNING id") && sql.includes("status='sending'")) {
      if (job.status !== "pending") return empty();
      job.status = "sending";
      return { rows: [{ id: job.id }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT * FROM alc_atendimento.conversations"))
      return { rows: [conversation], rowCount: 1 };
    if (sql.startsWith("UPDATE alc_atendimento.outbox") || sql.startsWith("WITH inserted")) {
      if (sql.includes("status='cancelled'")) job.status = "cancelled";
      else if (sql.includes("status='sent'")) job.status = "sent";
      else if (sql.includes("status=$2")) job.status = String(values?.[1]);
    }
    return empty();
  });
  mocks.connect.mockReset().mockResolvedValue(mocks.transaction);
  mocks.audit.mockReset().mockResolvedValue(undefined);
  mocks.setting.mockReset().mockResolvedValue({ bot: true });
  mocks.channelConfig.mockReset().mockResolvedValue(config);
  mocks.graph.mockReset().mockResolvedValue({ messages: [{ id: "synthetic-provider-id" }] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const eligibility = [
  { name: "bot", status: "bot", assigned_to: null, step: "receipt", allowed: true },
  { name: "bot always eligible", status: "bot", assigned_to: OWN, step: "staff", allowed: true },
  { name: "unassigned handoff acknowledgement", status: "human", assigned_to: null, step: "human", allowed: true },
  { name: "unassigned final acknowledgement", status: "resolved", assigned_to: null, step: "done", allowed: true },
  { name: "assigned human handoff", status: "human", assigned_to: OWN, step: "human", allowed: false },
  { name: "assigned staff", status: "human", assigned_to: OWN, step: "staff", allowed: false },
  { name: "unassigned human staff", status: "human", assigned_to: null, step: "staff", allowed: false },
  { name: "assigned resolved final", status: "resolved", assigned_to: OWN, step: "done", allowed: false },
  { name: "resolved nonfinal", status: "resolved", assigned_to: null, step: "staff", allowed: false },
  { name: "unassigned pending handoff", status: "pending", assigned_to: null, step: "human", allowed: false },
  { name: "unassigned pending final", status: "pending", assigned_to: null, step: "done", allowed: false },
  { name: "assigned pending", status: "pending", assigned_to: OWN, step: "staff", allowed: false },
];

describe("bot reply eligibility", () => {
  it.each(eligibility)("$name is eligible: $allowed", ({ status, assigned_to, step, allowed }) => {
    expect(botReplyAllowed({ status, assigned_to, agent_state: { step } })).toBe(allowed);
  });
});

describe("queue text service window", () => {
  it.each(["", "2026-10-07T14:59:59.999Z"])("never queues text with missing or expired inbound time: %s", async (inbound) => {
    conversation.last_inbound_at = inbound;
    await expect(queueText(conversation, "Reply", "staff:synthetic", OWN, transaction)).rejects.toThrow("Janela");
    expect(mocks.transactionQuery).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.graph).not.toHaveBeenCalled();
  });

  it("queues at the exact 24h boundary using the supplied transaction and audit", async () => {
    conversation.last_inbound_at = new Date(NOW.getTime() - 86_400_000).toISOString();
    await queueText(conversation, "Reply", "staff:synthetic", OWN, transaction);
    expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT(dedupe_key) DO NOTHING"), [
      "staff:synthetic", ID, "client", conversation.phone,
      { messaging_product: "whatsapp", to: conversation.phone, type: "text", text: { body: "Reply" } },
      "human", OWN, "",
    ]);
    expect(mocks.audit).toHaveBeenCalledWith(OWN, "reply_queued", ID, {}, transaction);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.graph).not.toHaveBeenCalled();
  });
});

describe("outbox handoff safety", () => {
  it.each(eligibility)("rechecks $name under the conversation lock before sending", async ({ status, assigned_to, step, allowed }) => {
    Object.assign(conversation, { status, assigned_to, agent_state: { step } });
    await processOutbox();
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(1, "SELECT pg_advisory_lock(hashtextextended($1,0))", [ID]);
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(2, expect.stringContaining("WHERE id=$1 AND status='pending' RETURNING id"), [job.id]);
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(3, "SELECT * FROM alc_atendimento.conversations WHERE id=$1", [ID]);
    if (allowed) {
      expect(mocks.graph).toHaveBeenCalledExactlyOnceWith(config, "synthetic-phone-id/messages", job.payload);
      expect(mocks.transactionQuery.mock.invocationCallOrder[2]).toBeLessThan(mocks.graph.mock.invocationCallOrder[0]);
      expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining("status='sent',provider_id=$2"), [ID, "synthetic-provider-id", "Synthetic reply", "text", "system", null, "", null, job.id]);
      expect(job.status).toBe("sent");
    } else {
      expect(mocks.graph).not.toHaveBeenCalled();
      expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining("status='cancelled'"), [job.id]);
      expect(job.status).toBe("cancelled");
    }
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("SELECT pg_advisory_unlock(hashtextextended($1,0))", [ID]);
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it("cancels a stale bot job when staff takeover completes before lock acquisition", async () => {
    const query = mocks.transactionQuery.getMockImplementation()!;
    mocks.transactionQuery.mockImplementation(async (sql, values) => {
      if (sql.includes("pg_advisory_lock("))
        Object.assign(conversation, { status: "human", assigned_to: OWN, agent_state: { step: "staff" } });
      return query(sql, values);
    });
    await processOutbox();
    expect(job.status).toBe("cancelled");
    expect(mocks.graph).not.toHaveBeenCalled();
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("SELECT pg_advisory_unlock(hashtextextended($1,0))", [ID]);
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it("holds the conversation lock until the provider reply is persisted", async () => {
    let confirm!: (value: { messages: { id: string }[] }) => void;
    let entered!: () => void;
    const providerEntered = new Promise<void>((resolve) => { entered = resolve; });
    const providerReply = new Promise<{ messages: { id: string }[] }>((resolve) => { confirm = resolve; });
    mocks.graph.mockImplementation(() => { entered(); return providerReply; });
    const sending = processOutbox();
    await providerEntered;
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(1, "SELECT pg_advisory_lock(hashtextextended($1,0))", [ID]);
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.includes("pg_advisory_unlock"))).toBe(false);
    expect(mocks.transaction.release).not.toHaveBeenCalled();
    confirm({ messages: [{ id: "synthetic-provider-id" }] });
    await sending;
    const calls = mocks.transactionQuery.mock.calls.map(([sql]) => sql);
    const persisted = calls.findIndex((sql) => sql.includes("status='sent'"));
    expect(persisted).toBeGreaterThan(-1);
    expect(persisted).toBeLessThan(calls.findIndex((sql) => sql.includes("pg_advisory_unlock")));
    expect(mocks.graph.mock.invocationCallOrder[0]).toBeLessThan(mocks.transactionQuery.mock.invocationCallOrder.at(-1)!);
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("status='sent'") || sql.includes("pg_advisory_lock"))).toBe(false);
  });

  it.each(["", "2026-10-07T14:59:59.999Z"])("cancels an expired or missing window again at send time: %s", async (inbound) => {
    conversation.last_inbound_at = inbound;
    await processOutbox();
    expect(job.status).toBe("cancelled");
    expect(mocks.graph).not.toHaveBeenCalled();
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it("does not apply bot eligibility to an owned staff reply", async () => {
    Object.assign(conversation, { status: "human", assigned_to: OWN, agent_state: { step: "staff" } });
    job.dedupe_key = "staff:synthetic";
    await processOutbox();
    expect(mocks.graph).toHaveBeenCalledExactlyOnceWith(config, "synthetic-phone-id/messages", job.payload);
    expect(job.status).toBe("sent");
  });

  it("never sends a job claimed by another worker and releases its lock", async () => {
    const query = mocks.transactionQuery.getMockImplementation()!;
    mocks.transactionQuery.mockImplementation(async (sql, values) => sql.includes("RETURNING id") ? empty() : query(sql, values));
    await processOutbox();
    expect(mocks.graph).not.toHaveBeenCalled();
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("SELECT * FROM alc_atendimento.conversations"))).toBe(false);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("SELECT pg_advisory_unlock(hashtextextended($1,0))", [ID]);
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it.each([
    ["ambiguous network", new Error("Synthetic timeout"), "uncertain"],
    ["explicit provider refusal", new Error("Meta 400 (synthetic): Refused"), "failed"],
    ["Meta 500", new Error("Meta 500 (synthetic): Provider unavailable"), "uncertain"],
    ["malformed Meta 400", new Error("Meta 400: Unconfirmed response"), "uncertain"],
  ])("does not retry %s and releases its lock", async (_name, error, status) => {
    mocks.graph.mockRejectedValueOnce(error);
    await processOutbox();
    expect(job.status).toBe(status);
    expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining("status=$2,error=$3"), [job.id, status, expect.any(String)]);
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
    await processOutbox();
    expect(mocks.graph).toHaveBeenCalledTimes(1);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.messages"))).toBe(false);
  });

  it("rejects missing provider confirmation without retry or a delivered message", async () => {
    mocks.graph.mockResolvedValueOnce({ messages: [] });
    await processOutbox();
    expect(job.status).toBe("uncertain");
    expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining("status=$2,error=$3"), [job.id, "uncertain", expect.any(String)]);
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.messages"))).toBe(false);
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
    await processOutbox();
    expect(mocks.graph).toHaveBeenCalledTimes(1);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it("discards the connection with the unlock error instead of returning a locked client", async () => {
    const failure = new Error("Synthetic unlock failure");
    const query = mocks.transactionQuery.getMockImplementation()!;
    mocks.transactionQuery.mockImplementation(async (sql, values) => {
      if (sql.includes("pg_advisory_unlock")) throw failure;
      return query(sql, values);
    });
    await expect(processOutbox()).rejects.toBe(failure);
    expect(job.status).toBe("sent");
    expect(mocks.graph).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.release).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("releases the lock and connection if the eligibility read fails", async () => {
    const failure = new Error("Synthetic read failure");
    const query = mocks.transactionQuery.getMockImplementation()!;
    mocks.transactionQuery.mockImplementation(async (sql, values) => {
      if (sql.startsWith("SELECT * FROM alc_atendimento.conversations")) throw failure;
      return query(sql, values);
    });
    await expect(processOutbox()).rejects.toBe(failure);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("SELECT pg_advisory_unlock(hashtextextended($1,0))", [ID]);
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
    expect(mocks.graph).not.toHaveBeenCalled();
  });
});

describe("driver manual acareação guidance", () => {
  it("routes M11 to the dispatcher without asking for digital evidence", async () => {
    Object.assign(conversation, {
      channel: "driver", name: "Motorista Exemplo", status: "bot",
      identity_verified: true, agent_state: { step: "driver_verified" },
    });
    const event = {
      event_key: "synthetic-driver-evidence", channel: "driver",
      payload: { entry: [{ changes: [{ value: {
        metadata: { phone_number_id: config.phoneId },
        messages: [{
          id: "synthetic-driver-message", from: conversation.phone, type: "text",
          timestamp: NOW.getTime() / 1000, text: { body: "Tenho comprovante da entrega" },
        }],
      } }] }] },
    };
    mocks.query.mockImplementation(async (sql) => sql.startsWith("SELECT * FROM alc_atendimento.webhook_events")
      ? { rows: [event], rowCount: 1 } : empty());
    mocks.transactionQuery.mockImplementation(async (sql, values) => {
      if (sql.startsWith("INSERT INTO alc_atendimento.conversations"))
        return { rows: [conversation], rowCount: 1 };
      if (sql.startsWith("INSERT INTO alc_atendimento.messages"))
        return { rows: [{ id: "synthetic-driver-inbound" }], rowCount: 1 };
      if (sql.includes("SET agent_state=$2,status=$3"))
        return { rows: [{ id: ID }], rowCount: 1 };
      return empty();
    });
    await processEvents();
    const replies = mocks.transactionQuery.mock.calls.filter(([sql]) =>
      sql.startsWith("INSERT INTO alc_atendimento.outbox"));
    expect(replies).toHaveLength(1);
    const text = (replies[0][1]?.[4] as {text:{body:string}}).text.body;
    expect(text).toContain("Motorista Exemplo");
    expect(text).toContain("acareação manual");
    expect(text).toContain("dispatcher");
    expect(text).not.toMatch(/envie.*foto|anexe.*assinatura/i);
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("UPDATE alc_atendimento.cases"))).toBe(false);
  });
});

describe("approved client C04 auto-closure", () => {
  it("queues the approved C04, resolves the conversation and never changes the PNR", async () => {
    Object.assign(conversation, {
      channel: "client", status: "bot", identity_verified: true,
      name: "Cliente Exemplo", case_id: "synthetic-case",
      agent_state: { step: "product", receivedAt: "07/10" },
    });
    const event = {
      event_key: "synthetic-client-final", channel: "client",
      payload: { entry: [{ changes: [{ value: {
        metadata: { phone_number_id: config.phoneId },
        messages: [{
          id: "synthetic-client-confirmation", from: conversation.phone, type: "text",
          timestamp: NOW.getTime() / 1000, text: { body: "Sim, está correto" },
        }],
      } }] }] },
    };
    mocks.query.mockImplementation(async sql => sql.startsWith("SELECT * FROM alc_atendimento.webhook_events")
      ? { rows: [event], rowCount: 1 } : empty());
    mocks.transactionQuery.mockImplementation(async (sql, values) => {
      if (sql.startsWith("INSERT INTO alc_atendimento.conversations"))
        return { rows: [conversation], rowCount: 1 };
      if (sql.startsWith("INSERT INTO alc_atendimento.messages"))
        return { rows: [{ id: "synthetic-confirmation" }], rowCount: 1 };
      if (sql.includes("SET agent_state=$2,status=$3")) {
        Object.assign(conversation, { agent_state: values?.[1], status: values?.[2] });
        return { rows: [{ id: ID }], rowCount: 1 };
      }
      return empty();
    });
    await processEvents();
    expect(conversation.status).toBe("resolved");
    expect(conversation.agent_state).toMatchObject({
      step: "done", result: "recebimento_confirmado",
    });
    const replies = mocks.transactionQuery.mock.calls.filter(([sql]) =>
      sql.startsWith("INSERT INTO alc_atendimento.outbox"),
    );
    expect(replies).toHaveLength(1);
    const text = (replies[0][1]?.[4] as { text: { body: string } }).text.body;
    expect(text).toContain("Cliente Exemplo");
    expect(text).toContain("encerre a reclamação");
    expect(text).not.toMatch(/conseguiu encerrar|aguardo sua confirmação/i);
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.includes("UPDATE alc_atendimento.cases"))).toBe(false);
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO alc_atendimento.audit"),
      [ID, expect.objectContaining({ caseCenterStatus: "unchanged", complaintClosure: "not_verified" })],
    );
  });
});

describe("incoming handoff acknowledgement", () => {
  it("queues exactly one acknowledgement for a fresh bot handoff and none for assigned staff", async () => {
    const event = {
      event_key: "synthetic-event", channel: "client", payload: { entry: [{ changes: [{ value: {
        metadata: { phone_number_id: config.phoneId },
        messages: [{ id: "synthetic-inbound", from: conversation.phone, type: "text", timestamp: NOW.getTime() / 1000, text: { body: "Falar com equipe" } }],
      } }] }] },
    };
    mocks.query.mockImplementation(async (sql) => sql.startsWith("SELECT * FROM alc_atendimento.webhook_events")
      ? { rows: [event], rowCount: 1 } : empty());
    mocks.transactionQuery.mockImplementation(async (sql, values) => {
      if (sql.startsWith("INSERT INTO alc_atendimento.conversations")) return { rows: [conversation], rowCount: 1 };
      if (sql.startsWith("INSERT INTO alc_atendimento.messages")) return { rows: [{ id: "synthetic-message" }], rowCount: 1 };
      if (sql.includes("SET agent_state=$2,status=$3")) {
        Object.assign(conversation, { agent_state: values?.[1], status: values?.[2] });
        return { rows: [{ id: ID }], rowCount: 1 };
      }
      return empty();
    });
    await processEvents();
    expect(conversation).toMatchObject({ status: "human", assigned_to: null, agent_state: { step: "human" } });
    expect(botReplyAllowed(conversation)).toBe(true);
    expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO alc_atendimento.outbox"), [
      "reply:synthetic-inbound", ID, "client", conversation.phone,
      expect.objectContaining({ type: "text", text: { body: expect.stringContaining("equipe") } }),
      "ai", null, "Agente virtual",
    ]);
    expect(mocks.transactionQuery.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"))).toHaveLength(1);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("COMMIT");
    Object.assign(conversation, { assigned_to: OWN, agent_state: { step: "staff" } });
    mocks.transactionQuery.mockClear();
    await processEvents();
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"))).toBe(false);
    expect(mocks.graph).not.toHaveBeenCalled();
  });
});
