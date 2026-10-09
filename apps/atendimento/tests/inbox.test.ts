import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfile } from "@alc/identity/auth";
import type { Scope } from "../lib/auth";

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };
const mocks = vi.hoisted(() => {
  const query = vi.fn<(sql: string, values?: unknown[]) => Promise<QueryResult>>();
  const transactionQuery = vi.fn<(sql: string, values?: unknown[]) => Promise<QueryResult>>();
  const transaction = { query: transactionQuery, release: vi.fn() };
  return {
    query, transactionQuery, transaction, connect: vi.fn(), audit: vi.fn(),
    scopeFor: vi.fn(), createClient: vi.fn(), agentLimit: vi.fn(),
  };
});
vi.mock("../lib/db", () => ({
  db: () => ({ query: mocks.query, connect: mocks.connect }),
  audit: mocks.audit,
}));
vi.mock("../lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/auth")>(),
  scopeFor: mocks.scopeFor,
  authConfig: () => ({ url: "https://example.test", key: "synthetic-key" }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("../lib/meta", () => ({ channelConfig: vi.fn(), graph: vi.fn() }));
vi.mock("../lib/source", () => ({ syncCore: vi.fn() }));
vi.mock("../lib/worker", async (importOriginal) => {
  const worker = await importOriginal<typeof import("../lib/worker")>();
  return { ...worker, queueText: vi.fn(worker.queueText) };
});
vi.mock("../lib/operator-directory", async original => ({
  ...await original<typeof import("../lib/operator-directory")>(),
  requireOperator: vi.fn(async () => ({ user_id: "22222222-2222-4222-8222-222222222222", roles: ["agent"], active: true, available: true, receiving: true })), canSupervise: vi.fn(async () => true),
  operationalUnits: vi.fn(async () => [{ unit_key: "test-unit", base_key: "BASE A", sigla: "SP" }]),
}));

import {
  inboxFilters, conversationActionSchema, inboxScopeSql, listConversations,
  conversationDetail, eligibleAgents, mutateConversation,
} from "../lib/inbox";
import { queueText } from "../lib/worker";

const ID = "11111111-1111-4111-8111-111111111111";
const OWN = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-10-08T15:00:00Z");
const profile: AuthProfile = {
  id: OWN, email: "agent@example.test", fullName: "Synthetic agent",
  role: "supervisor", globalAccess: false, baseScope: ["BASE A"],
  siglaScope: ["SP"], atendimentoAccess: true,
};
const scope: Scope = { full: false, pairs: new Set(["SP|BASE A"]), safe: new Set() };
const replyCancellationWhere = "WHERE conversation_id=$1 AND status='pending' AND (dedupe_key LIKE 'reply:%' OR dedupe_key LIKE 'staff:%')";
const empty = (): QueryResult => ({ rows: [], rowCount: 0 });
const agent = (overrides: Record<string, unknown> = {}) => ({
  id: OTHER, full_name: "Synthetic assignee", email: "assignee@example.test",
  role: "supervisor", active: true, base_scope: ["BASE A"],
  sigla_scope: ["SP"], module_scope: ["gestao-pnr"], ...overrides,
});
const invalidFilters: Record<string, string>[] = [
  { offset: "-1" }, { offset: "1.5" }, { offset: "100001" }, { offset: "NaN" },
  { q: "x".repeat(201) }, { label: "x".repeat(41) }, { channel: "email" },
  { view: "unknown" }, { status: "deleted" }, { assignee: "not-a-uuid" },
];
const invalidCursors: Record<string, string>[] = [
  { before: NOW.toISOString() }, { beforeId: OTHER },
  { before: "invalid-date", beforeId: OTHER }, { before: NOW.toISOString(), beforeId: "invalid-id" },
];
let conversation: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
  conversation = {
    id: ID, channel: "client", phone: "5511999990000", name: "Synthetic contact",
    base_key: "BASE A", sigla: "SP", status: "bot", assigned_to: null,
    identity_verified: true, driver_id: "synthetic-driver", case_id: "synthetic-case",
    agent_state: { step: "receipt" }, last_inbound_at: NOW.toISOString(), unread: 3,
  };
  mocks.query.mockReset().mockImplementation(async sql => sql.startsWith("SELECT * FROM alc_atendimento.operators") ? { rows: [OWN, OTHER].map(user_id => ({ user_id, roles: ["agent"], active: true, receiving: true, available: true })), rowCount: 2 } : empty());
  mocks.transactionQuery.mockReset().mockImplementation(async (sql, values) => {
    if (sql.startsWith("SELECT * FROM alc_atendimento.conversations"))
      return { rows: [{ ...conversation }], rowCount: 1 };
    if (sql.startsWith("SELECT * FROM alc_atendimento.cases WHERE case_id="))
      return { rows: [{ case_id: conversation.case_id, base_key: conversation.base_key, sigla: conversation.sigla }], rowCount: 1 };
    if (sql.includes("SET status=$2,assigned_to=$3"))
      Object.assign(conversation, { status: values?.[1], assigned_to: values?.[2], agent_state: values?.[3] });
    return empty();
  });
  mocks.connect.mockReset().mockResolvedValue(mocks.transaction);
  mocks.audit.mockReset().mockResolvedValue(undefined);
  mocks.scopeFor.mockReset().mockResolvedValue(scope);
  mocks.agentLimit.mockReset().mockResolvedValue({ data: [agent()], error: null });
  mocks.createClient.mockReset().mockReturnValue({
    from: vi.fn(() => ({ select: vi.fn(() => ({ limit: mocks.agentLimit })) })),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("inbox filters and scoped queries", () => {
  it("defaults filters and trims search while coercing a bounded offset", () => {
    expect(inboxFilters.parse({})).toEqual({
      q: "", channel: "all", view: "all", status: "open", assignee: "all", label: "", offset: 0, base: "", sigla: "", classification: "all", priority: "all", waitingMinutes: 0,
    });
    expect(inboxFilters.parse({ q: " contact ", label: " urgent ", offset: "30" }))
      .toMatchObject({ q: "contact", label: "urgent", offset: 30 });
  });

  it.each(invalidFilters)("rejects invalid list filters before querying: %j", async (query) => {
    await expect(listConversations(profile, query)).rejects.toThrow();
    expect(mocks.scopeFor).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("binds pair and safe scopes without broadening blank or ambiguous bases", () => {
    const values: unknown[] = ["existing"];
    const sql = inboxScopeSql(scope, values, "target");
    expect(values).toEqual(["existing", ["SP|BASE A"], []]);
    expect(sql).toContain("target.base_key");
    expect(sql).toContain("target.sigla");
    expect(sql).toContain("=ANY($2::text[])");
    expect(sql).toContain("=ANY($3::text[])");
    expect(sql).toContain("<>''");
    expect(sql).toContain("||'|'");
    expect(sql).not.toContain("SP|BASE A");
    const denied: unknown[] = [];
    expect(inboxScopeSql({ full: false, pairs: new Set(), safe: new Set() }, denied)).not.toBe("TRUE");
    expect(denied).toEqual([[], []]);
    const full: unknown[] = [];
    expect(inboxScopeSql({ ...scope, full: true }, full)).toBe("TRUE");
    expect(full).toEqual([]);
  });

  it("binds scoped search, channel, status, mine, assignee, labels and limit", async () => {
    const term = "x%_\\' OR 1=1 --";
    mocks.query.mockResolvedValueOnce({ rows: [{ total: 31, unread: 7 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [conversation], rowCount: 1 });
    const result = await listConversations(profile, {
      q: term, channel: "client", status: "pending", view: "mine",
      assignee: OTHER, label: "urgent", offset: "30",
    });
    const [countSql] = mocks.query.mock.calls[0];
    const [listSql, values] = mocks.query.mock.calls[1];
    expect(values).toEqual([
      ["SP|BASE A"], [], "%x\\%\\_\\\\' OR 1=1 --%", "client", "pending", OWN, OTHER, "urgent", 30,
    ]);
    for (const sql of [countSql, listSql]) {
      expect(sql).toContain(inboxScopeSql(scope, []));
      expect(sql).toContain("c.name ILIKE $3 OR c.phone ILIKE $3 OR c.case_id ILIKE $3 OR c.base_key ILIKE $3");
      expect(sql).toContain("c.channel=$4");
      expect(sql).toContain("c.status=$5");
      expect(sql).toContain("c.assigned_to=$6::uuid");
      expect(sql).toContain("c.assigned_to=$7::uuid");
      expect(sql).toContain("$8=ANY(c.labels)");
      expect(sql).not.toContain(term);
    }
    expect(listSql).toContain("ORDER BY c.updated_at DESC,c.id DESC LIMIT 30 OFFSET $9");
    expect(result).toEqual({ records: [{ ...conversation, operational_labels: ["SP"] }], total: 31, unread: 7, limit: 30, offset: 30 });
  });

  it("uses explicit uninteracted and unassigned filters without searching blank input", async () => {
    await listConversations(profile, { q: "  ", view: "uninteracted", assignee: "unassigned" });
    const [sql, values] = mocks.query.mock.calls[1];
    expect(sql).toContain("c.status IN ('bot','human')");
    expect(sql).toContain("NOT EXISTS(SELECT 1 FROM alc_atendimento.messages m WHERE m.conversation_id=c.id AND m.actor_id IS NOT NULL)");
    expect(sql).toContain("c.assigned_to IS NULL");
    expect(sql).not.toContain("ILIKE");
    expect(values).toEqual([["SP|BASE A"], [], 0]);
  });

  it("all view and status retain scope without silently excluding pending or resolved", async () => {
    await listConversations(profile, { view: "all", status: "all" });
    const [sql] = mocks.query.mock.calls[0];
    expect(sql).toContain(inboxScopeSql(scope, []));
    expect(sql).not.toContain("c.status");
    expect(sql).not.toContain("c.assigned_to");
  });

  it.each([
    ["missing", null], ["other base", { base_key: "BASE B", sigla: "SP" }],
    ["blank", { base_key: "", sigla: "" }], ["ambiguous sigla", { base_key: "", sigla: "SP" }],
  ])("hides %s conversations before fetching messages, queue or cases", async (_name, row) => {
    mocks.query.mockResolvedValueOnce({ rows: row ? [{ ...conversation, ...row }] : [], rowCount: row ? 1 : 0 });
    await expect(conversationDetail(profile, ID, new URLSearchParams())).rejects.toMatchObject({ status: 404 });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("paginates scoped detail and filters blank and out-of-scope linked cases without marking read", async () => {
    const messages = Array.from({ length: 51 }, (_, index) => ({ id: `message-${index}` }));
    const cases = [
      { case_id: "allowed", base_key: "BASE A", sigla: "SP" },
      { case_id: "other", base_key: "BASE B", sigla: "SP" },
      { case_id: "blank", base_key: "", sigla: "" },
      { case_id: "ambiguous", base_key: "SP", sigla: "SP" },
    ];
    const queued = [{ id: "synthetic-job", status: "pending" }];
    mocks.query.mockResolvedValueOnce({ rows: [conversation], rowCount: 1 })
      .mockResolvedValueOnce({ rows: messages, rowCount: 51 })
      .mockResolvedValueOnce({ rows: queued, rowCount: 1 })
      .mockResolvedValueOnce({ rows: cases, rowCount: 4 });
    const result = await conversationDetail(profile, ID, new URLSearchParams({ before: NOW.toISOString(), beforeId: OTHER }));
    expect(mocks.query.mock.calls[1]).toEqual([
      expect.stringContaining("(created_at,id)<($2::timestamptz,$3::uuid)"), [ID, NOW.toISOString(), OTHER],
    ]);
    expect(mocks.query.mock.calls[1][0]).toContain("ORDER BY created_at DESC,id DESC LIMIT 51");
    expect(mocks.query.mock.calls[2][0]).toContain("NOT EXISTS");
    expect(mocks.query.mock.calls[3][1]).toEqual(["synthetic-case", "synthetic-driver", conversation.phone, "BASE A", "SP"]);
    expect(result).toMatchObject({ messages: messages.slice(0, 50).reverse(), queued, cases: [cases[0]], hasMore: true });
    expect(mocks.query.mock.calls.every(([sql]) => !sql.startsWith("UPDATE"))).toBe(true);
  });

  it.each(invalidCursors)("rejects incomplete or malformed detail cursors: %j", async (cursor) => {
    mocks.query.mockResolvedValueOnce({ rows: [conversation], rowCount: 1 });
    await expect(conversationDetail(profile, ID, new URLSearchParams(cursor))).rejects.toThrow();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});

describe("conversation actions and transactions", () => {
  it.each([
    { id: "invalid", action: "read" }, { id: ID, action: "delete" },
    { id: ID, action: "reply", body: " " }, { id: ID, action: "reply", body: "x".repeat(4001) },
    { id: ID, action: "assign", assignedTo: "invalid" },
    { id: ID, action: "labels", labels: [""] }, { id: ID, action: "labels", labels: ["x".repeat(41)] },
    { id: ID, action: "labels", labels: Array(13).fill("label") },
    { id: ID, action: "read", injected: true },
  ])("rejects invalid action input before connecting: %j", async (input) => {
    expect(conversationActionSchema.safeParse(input).success).toBe(false);
    await expect(mutateConversation(profile, input)).rejects.toThrow();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(queueText).not.toHaveBeenCalled();
  });

  it.each(["reply", "note", "labels"])("rejects missing %s data and rolls back", async (action) => {
    await expect(mutateConversation(profile, { id: ID, action })).rejects.toMatchObject({ status: 400 });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery).not.toHaveBeenCalledWith("COMMIT");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it("commits an audited internal note without ever queueing WhatsApp", async () => {
    Object.assign(conversation, { status: "pending", assigned_to: OTHER });
    expect(await mutateConversation(profile, { id: ID, action: "note", body: "  Internal only  " })).toEqual({ ok: true });
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(2, "SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))");
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(3, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [ID]);
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(4, expect.stringContaining("FOR UPDATE"), [ID]);
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining("VALUES($1,'note',$2,$3,'human',$3,$4)"), [ID, "Internal only", OWN, profile.fullName],
    );
    expect(mocks.audit).toHaveBeenCalledWith(OWN, "note", ID, {}, mocks.transaction);
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.transactionQuery.mock.invocationCallOrder.at(-1)!);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
    expect(queueText).not.toHaveBeenCalled();
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO alc_atendimento.outbox"))).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rolls back audit failures instead of committing a partial action", async () => {
    const failure = new Error("Synthetic audit failure");
    mocks.audit.mockRejectedValueOnce(failure);
    await expect(mutateConversation(profile, { id: ID, action: "note", body: "Internal" })).rejects.toBe(failure);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery).not.toHaveBeenCalledWith("COMMIT");
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it("rolls back persistence failures without audit or outbound messages", async () => {
    const failure = new Error("Synthetic insert failure");
    mocks.transactionQuery.mockImplementation(async (sql) => {
      if (sql.startsWith("SELECT *")) return { rows: [conversation], rowCount: 1 };
      if (sql.startsWith("INSERT")) throw failure;
      return empty();
    });
    await expect(mutateConversation(profile, { id: ID, action: "note", body: "Internal" })).rejects.toBe(failure);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(queueText).not.toHaveBeenCalled();
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", null], ["outside scope", { base_key: "BASE B" }], ["blank scope", { base_key: "", sigla: "" }],
  ])("rolls back %s targets without mutating or auditing", async (_name, row) => {
    mocks.transactionQuery.mockImplementation(async (sql) => sql.startsWith("SELECT *")
      ? { rows: row ? [{ ...conversation, ...row }] : [], rowCount: row ? 1 : 0 } : empty());
    await expect(mutateConversation(profile, { id: ID, action: "takeover" })).rejects.toMatchObject({ status: 404 });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(queueText).not.toHaveBeenCalled();
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it.each([
    ["bot", null], ["human", null], ["human", OTHER], ["pending", OWN], ["resolved", OWN],
  ])("rejects replies without own human takeover: %s / %s", async (status, assignedTo) => {
    Object.assign(conversation, { status, assigned_to: assignedTo });
    await expect(mutateConversation(profile, { id: ID, action: "reply", body: "Reply" })).rejects.toMatchObject({ status: 409 });
    expect(queueText).not.toHaveBeenCalled();
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
  });

  it("queues a reply only after own takeover and audits it in the same transaction", async () => {
    await mutateConversation(profile, { id: ID, action: "takeover" });
    expect(conversation).toMatchObject({ status: "human", assigned_to: OWN });
    vi.clearAllMocks();
    await mutateConversation(profile, { id: ID, action: "reply", body: "  Staff reply  " });
    expect(queueText).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID, status: "human", assigned_to: OWN }),
      "Staff reply", expect.stringMatching(/^staff:/), OWN, mocks.transaction, profile.fullName,
    );
    expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO alc_atendimento.outbox"), [
      expect.stringMatching(/^staff:/), ID, "client", conversation.phone,
      { messaging_product: "whatsapp", to: conversation.phone, type: "text", text: { body: "Staff reply" } },
      "human", OWN, profile.fullName,
    ]);
    expect(mocks.audit).toHaveBeenCalledWith(OWN, "reply_queued", ID, {}, mocks.transaction);
    expect(mocks.audit).toHaveBeenCalledWith(OWN, "reply", ID, {}, mocks.transaction);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([null, "2026-10-07T14:59:59.999Z"])("rejects own staff reply outside the 24h window: %s", async (lastInbound) => {
    Object.assign(conversation, { status: "human", assigned_to: OWN, last_inbound_at: lastInbound });
    await expect(mutateConversation(profile, { id: ID, action: "reply", body: "Reply" })).rejects.toThrow("Janela");
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it.each([
    ["pending", "human", "pending"], ["reopen", "resolved", "human"], ["resolve", "human", "resolved"],
  ])("persists %s, retains own assignment and cancels pending bot and staff replies", async (action, from, to) => {
    Object.assign(conversation, { status: from, assigned_to: OWN });
    await mutateConversation(profile, { id: ID, action });
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET status=$2,assigned_to=$3,agent_state=$4,unread=0"),
      [ID, to, OWN, { step: "staff" }],
    );
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining(replyCancellationWhere), [ID],
    );
    expect(mocks.audit).toHaveBeenCalledWith(OWN, action, ID, {}, mocks.transaction);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(queueText).not.toHaveBeenCalled();
  });

  it.each(["resume", "assign"])("cancels old staff and bot replies on %s without cancelling initial templates", async (action) => {
    Object.assign(conversation, { status: "human", assigned_to: OWN });
    await mutateConversation(action === "assign" ? { ...profile, role: "director" } : profile, action === "assign"
      ? { id: ID, action, assignedTo: OTHER } : { id: ID, action });
    expect(conversation).toMatchObject(action === "resume"
      ? { status: "bot", assigned_to: null } : { status: "human", assigned_to: OTHER });
    const cancellations = mocks.transactionQuery.mock.calls.filter(([sql]) => sql.startsWith("UPDATE alc_atendimento.outbox"));
    expect(cancellations).toEqual([[expect.stringContaining(replyCancellationWhere), [ID]]]);
    expect(cancellations[0][0].endsWith(replyCancellationWhere)).toBe(true);
    expect(cancellations[0][0]).not.toContain("initial");
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(queueText).not.toHaveBeenCalled();
  });

  it.each(["takeover", "pending", "reopen", "resume"])("does not let an ordinary agent %s another owner's conversation", async (action) => {
    Object.assign(conversation, { status: "human", assigned_to: OTHER });
    await expect(mutateConversation(profile, { id: ID, action, assignedTo: null })).rejects.toMatchObject({ status: 409 });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("assigns only an active eligible agent whose base scope contains the conversation", async () => {
    await mutateConversation({ ...profile, role: "director" }, { id: ID, action: "assign", assignedTo: OTHER });
    expect(mocks.scopeFor).toHaveBeenCalledWith(expect.objectContaining({ id: OTHER, baseScope: ["BASE A"] }));
    expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining("SET status=$2,assigned_to=$3"), [ID, "human", OTHER, { step: "staff" }]);
    expect(mocks.audit).toHaveBeenCalledWith(OWN, "assign", ID, { assignedTo: OTHER }, mocks.transaction);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("COMMIT");
  });

  it.each([
    ["inactive", { active: false }, []],
    ["revoked", {}, [{ key: `access_${OTHER}`, value: { active: false } }]],
    ["forbidden role", { role: "driver" }, []], ["invalid role", { role: "unknown" }, []],
  ])("rejects assignment to an %s agent before connecting", async (_name, overrides, access) => {
    mocks.agentLimit.mockResolvedValueOnce({ data: [agent(overrides)], error: null });
    mocks.query.mockResolvedValueOnce({ rows: access, rowCount: access.length });
    await expect(mutateConversation({ ...profile, role: "director" }, { id: ID, action: "assign", assignedTo: OTHER })).rejects.toMatchObject({ status: 403 });
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects an active assignee outside the conversation base and rolls back", async () => {
    mocks.scopeFor.mockImplementation(async (p: AuthProfile) => p.id === OTHER
      ? { full: false, pairs: new Set(["SP|BASE B"]), safe: new Set() } : scope);
    await expect(mutateConversation({ ...profile, role: "director" }, { id: ID, action: "assign", assignedTo: OTHER })).rejects.toMatchObject({ status: 403 });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("explicitly removes assignment without consulting the agent directory", async () => {
    Object.assign(conversation, { status: "human", assigned_to: OWN });
    await mutateConversation({ ...profile, role: "director" }, { id: ID, action: "assign", assignedTo: null });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining("SET status=$2,assigned_to=$3"), [ID, "human", null, { step: "staff" }]);
    expect(mocks.audit).toHaveBeenCalledWith(OWN, "assign", ID, { assignedTo: null }, mocks.transaction);
  });

  it("marks read only through the explicit read action without audit or WhatsApp", async () => {
    await mutateConversation(profile, { id: ID, action: "read" });
    expect(mocks.transactionQuery).toHaveBeenCalledWith("UPDATE alc_atendimento.conversations SET unread=0 WHERE id=$1", [ID]);
    expect(mocks.transactionQuery).not.toHaveBeenCalledWith("UPDATE alc_atendimento.conversations SET updated_at=now() WHERE id=$1", [ID]);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(queueText).not.toHaveBeenCalled();
  });

  it.each([[" urgent ", "urgent", "review"], []])("persists explicit deduplicated labels, including clearing: %j", async (...labels) => {
    await mutateConversation(profile, { id: ID, action: "labels", labels });
    const normalized = labels.map((label) => label.trim());
    expect(mocks.transactionQuery).toHaveBeenCalledWith("UPDATE alc_atendimento.conversations SET labels=$2 WHERE id=$1", [ID, [...new Set(normalized)]]);
    expect(mocks.audit).toHaveBeenCalledWith(OWN, "labels", ID, { labels: normalized }, mocks.transaction);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(queueText).not.toHaveBeenCalled();
  });
});

describe("transactional driver verification", () => {
  const manager: AuthProfile = { ...profile, role: "director" };
  const driver = { driverId: "synthetic-driver", driverName: "Synthetic driver", baseKey: "BASE A", sigla: "SP" };
  const input = { id: ID, action: "verify_driver", driverId: driver.driverId, baseKey: driver.baseKey };
  let candidates: typeof driver[];

  beforeEach(() => {
    Object.assign(conversation, { channel: "driver", identity_verified: false, driver_id: "", agent_state: { step: "driver_name" } });
    candidates = [driver];
    const query = mocks.transactionQuery.getMockImplementation()!;
    mocks.transactionQuery.mockImplementation(async (sql, values) => sql.startsWith("SELECT record FROM alc_atendimento.cases")
      ? { rows: candidates.map((record) => ({ record })), rowCount: candidates.length } : query(sql, values));
  });

  it.each([
    { driverId: " " }, { baseKey: " " }, { driverId: "x".repeat(201) },
    { baseKey: "x".repeat(201) }, { driverId: null }, { baseKey: 123 },
  ])("rejects malformed verification identifiers before connecting: %j", async (overrides) => {
    await expect(mutateConversation(manager, { ...input, ...overrides })).rejects.toThrow();
    expect(mocks.scopeFor).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("requires admin authorization before scope lookup or opening a verification transaction", async () => {
    await expect(mutateConversation(profile, input)).rejects.toMatchObject({ status: 403 });
    expect(mocks.scopeFor).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(queueText).not.toHaveBeenCalled();
  });

  it.each([
    { driverId: undefined }, { baseKey: undefined },
  ])("rolls back verification with a missing required identifier: %j", async (overrides) => {
    expect(conversationActionSchema.safeParse({ ...input, ...overrides }).success).toBe(true);
    await expect(mutateConversation(manager, { ...input, ...overrides })).rejects.toMatchObject({ status: 400 });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("SELECT record"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it("rejects verification on a customer conversation without reading driver candidates", async () => {
    conversation.channel = "client";
    await expect(mutateConversation(manager, input)).rejects.toMatchObject({ status: 400 });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("SELECT record"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("verifies a normalized unique unit under lock and binds only exact driver, base and sigla cases", async () => {
    candidates = [driver, { ...driver, baseKey: " B\u00e1se  A ", sigla: " sp " }, { ...driver, baseKey: "BASE B", sigla: "RJ" }];
    Object.assign(conversation, { assigned_to: OTHER, status: "pending" });
    expect(await mutateConversation(manager, { ...input, driverId: ` ${driver.driverId} `, baseKey: " b\u00e1se   a " })).toEqual({ ok: true });
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(2, "SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))");
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(3, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [ID]);
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(4, "SELECT * FROM alc_atendimento.conversations WHERE id=$1 FOR UPDATE", [ID]);
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(5, "SELECT record FROM alc_atendimento.cases WHERE driver_id=$1", [driver.driverId]);
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      "UPDATE alc_atendimento.conversations SET driver_id=$2,base_key=$3,sigla=$4,name=$5,identity_verified=true,status='human',assigned_to=$6,agent_state=jsonb_set(agent_state,'{step}','\"staff\"'),unread=0 WHERE id=$1",
      [ID, driver.driverId, "BASE A", "SP", driver.driverName, OTHER],
    );
    const bindings = mocks.transactionQuery.mock.calls.filter(([sql]) => sql.startsWith("UPDATE alc_atendimento.cases"));
    expect(bindings).toEqual([[
      "UPDATE alc_atendimento.cases SET driver_phone=$4,record=jsonb_set(record,'{driverPhone}',to_jsonb($4::text)) WHERE driver_id=$1 AND base_key=$2 AND sigla=$3",
      [driver.driverId, "BASE A", "SP", conversation.phone],
    ]]);
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining(replyCancellationWhere), [ID],
    );
    const cancellations = mocks.transactionQuery.mock.calls.filter(([sql]) => sql.startsWith("UPDATE alc_atendimento.outbox"));
    expect(cancellations).toHaveLength(1);
    expect(cancellations[0][0].endsWith(replyCancellationWhere)).toBe(true);
    expect(cancellations[0][0]).not.toContain("initial");
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(OWN, "verify_driver", ID, {}, mocks.transaction);
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.transactionQuery.mock.invocationCallOrder.at(-1)!);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(queueText).not.toHaveBeenCalled();
  });

  it.each([
    ["no candidates", []], ["different base", [{ ...driver, baseKey: "BASE B" }]],
  ])("rejects %s rather than guessing the driver unit", async (_name, rows) => {
    candidates = rows;
    await expect(mutateConversation(manager, input)).rejects.toMatchObject({ status: 400 });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it("rejects ambiguous normalized sigla and base pairs before phone binding", async () => {
    candidates = [driver, { ...driver, baseKey: " b\u00e1se a ", sigla: "RJ" }];
    await expect(mutateConversation(manager, input)).rejects.toMatchObject({ status: 409 });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects an out-of-scope driver candidate even when the conversation itself is visible", async () => {
    candidates = [{ ...driver, sigla: "RJ" }];
    await expect(mutateConversation(manager, input)).rejects.toMatchObject({ status: 403 });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(queueText).not.toHaveBeenCalled();
  });

  it("rejects an out-of-scope verification conversation before reading candidates", async () => {
    conversation.base_key = "BASE B";
    await expect(mutateConversation(manager, input)).rejects.toMatchObject({ status: 404 });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("SELECT record"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rolls back verification and does not audit or cancel bot jobs when phone binding fails", async () => {
    const failure = new Error("Synthetic phone binding failure");
    const query = mocks.transactionQuery.getMockImplementation()!;
    mocks.transactionQuery.mockImplementation(async (sql, values) => {
      if (sql.startsWith("UPDATE alc_atendimento.cases")) throw failure;
      return query(sql, values);
    });
    await expect(mutateConversation(manager, input)).rejects.toBe(failure);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery).not.toHaveBeenCalledWith("COMMIT");
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("UPDATE alc_atendimento.outbox"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });

  it("rolls back verification, phone binding and bot and staff cancellation if the transactional audit fails", async () => {
    const failure = new Error("Synthetic verification audit failure");
    mocks.audit.mockRejectedValueOnce(failure);
    await expect(mutateConversation(manager, input)).rejects.toBe(failure);
    expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE alc_atendimento.cases SET driver_phone=$4"), [driver.driverId, "BASE A", "SP", conversation.phone]);
    expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining(replyCancellationWhere), [ID]);
    expect(mocks.audit).toHaveBeenCalledWith(OWN, "verify_driver", ID, {}, mocks.transaction);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery).not.toHaveBeenCalledWith("COMMIT");
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
  });
});

describe("eligible agent directory", () => {
  it("honors explicit grants and revocations while keeping inactive and forbidden roles out", async () => {
    mocks.agentLimit.mockResolvedValueOnce({ data: [
      agent(), agent({ id: OWN, module_scope: [], active: true }),
      agent({ id: ID, active: false }), agent({ id: "driver", role: "driver" }),
    ], error: null });
    mocks.query.mockResolvedValueOnce({ rows: [
      { key: `access_${OTHER}`, value: { active: false } },
      { key: `access_${OWN}`, value: { active: true } },
    ], rowCount: 2 });
    expect(await eligibleAgents()).toEqual([expect.objectContaining({ id: OWN, atendimentoAccess: true })]);
    expect(mocks.createClient).toHaveBeenCalledWith("https://example.test", "synthetic-service-key", { auth: { persistSession: false, autoRefreshToken: false } });
    expect(mocks.agentLimit).toHaveBeenCalledWith(500);
  });

  it("fails closed when the agent directory is unavailable", async () => {
    mocks.agentLimit.mockResolvedValueOnce({ data: null, error: new Error("Synthetic directory failure") });
    await expect(eligibleAgents()).rejects.toMatchObject({ status: 503 });
    expect(mocks.query).not.toHaveBeenCalled();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(eligibleAgents()).rejects.toMatchObject({ status: 503 });
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
  });
});
