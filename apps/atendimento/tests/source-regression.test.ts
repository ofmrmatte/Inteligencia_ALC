import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseRecord } from "../lib/domain";

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };
const mocks = vi.hoisted(() => {
  const query = vi.fn<(sql: string, values?: unknown[]) => Promise<QueryResult>>();
  const coreQuery = vi.fn<(sql: string, values?: unknown[]) => Promise<QueryResult>>();
  const transactionQuery = vi.fn<(sql: string, values?: unknown[]) => Promise<QueryResult>>();
  const transaction = { query: transactionQuery, release: vi.fn() };
  return {
    query, coreQuery, transactionQuery, transaction, connect: vi.fn(), setting: vi.fn(), audit: vi.fn(),
    templates: vi.fn(), channelConfig: vi.fn(), graph: vi.fn(),
  };
});
vi.mock("../lib/db", () => ({
  db: () => ({ query: mocks.query, connect: mocks.connect }),
  core: () => ({ query: mocks.coreQuery }), setting: mocks.setting, audit: mocks.audit,
}));
vi.mock("../lib/meta", () => ({
  templates: mocks.templates, channelConfig: mocks.channelConfig, graph: mocks.graph,
}));

import { queueTemplate, upsertCases, syncCore, fromCore } from "../lib/source";
import { processEvents } from "../lib/worker";

const ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-08T15:00:00Z");
const OPERATOR = "Synthetic operator";
const record = (overrides: Partial<CaseRecord> = {}): CaseRecord => ({
  caseId: "synthetic-case", shipmentId: "synthetic-shipment", competence: "202610Q1",
  caseDate: "2026-10-08", baseKey: "BASE A", sigla: "SP", driverId: "synthetic-driver",
  driverName: "Synthetic driver", driverPhone: "5511999990000", mainStatus: "NEW", subStatus: "WAITING_RECEIPT",
  classification: "aguardando_comprovante", customerName: "Synthetic buyer", customerPhone: "5511988880000",
  customerVerified: true, products: [{ title: "Synthetic product" }], deliveryAt: "2026-10-07T12:00:00Z",
  purchaseValue: 10, ...overrides,
});
const coreRow = (r: CaseRecord): Record<string, unknown> => ({
  case_id: r.caseId, shipment_id: r.shipmentId, competence: r.competence, case_date: r.caseDate,
  base_key: r.baseKey, sigla: r.sigla, driver_id: r.driverId, driver_name: r.driverName,
  main_status: r.mainStatus, sub_status: r.subStatus, purchase_value: r.purchaseValue,
  source_last_seen_at: NOW.toISOString(), raw_snapshot_jsonb: { detailSnapshot: {
    driverId: r.driverId, driverName: r.driverName, driverPhone: r.driverPhone,
    buyerName: r.customerName, products: r.products, deliveryAt: r.deliveryAt,
  } },
});
const empty = (): QueryResult => ({ rows: [], rowCount: 0 });
let persisted: Map<string, { record: unknown; sourceAt: string }>;
let queuedKeys: Set<string>;
let source: { baselineComplete: boolean };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
  persisted = new Map();
  queuedKeys = new Set();
  source = { baselineComplete: true };
  mocks.coreQuery.mockReset().mockResolvedValue(empty());
  mocks.connect.mockReset().mockResolvedValue(mocks.transaction);
  mocks.audit.mockReset().mockResolvedValue(undefined);
  mocks.setting.mockReset().mockImplementation(async (key: string) => key === "source" ? source : {
    driverNotifications: true, clientOutreach: true, bot: true, operatorName: OPERATOR, intervalMinutes: 30,
  });
  mocks.templates.mockReset().mockResolvedValue([
    { name: "pnraberta", status: "APPROVED", language: "pt_BR" },
    { name: "cliente_loss_v2", status: "APPROVED", language: "pt_BR" },
  ]);
  mocks.channelConfig.mockReset().mockResolvedValue({ phoneId: "synthetic-phone-id" });
  mocks.graph.mockReset().mockRejectedValue(new Error("Unexpected provider send"));
  mocks.query.mockReset().mockImplementation(async (sql, values) => {
    if (sql.startsWith("INSERT INTO alc_atendimento.conversations"))
      return { rows: [{ id: ID, case_id: values?.[5] }], rowCount: 1 };
    if (sql.startsWith("INSERT INTO alc_atendimento.outbox")) {
      const key = String(values?.[0]);
      if (queuedKeys.has(key)) return empty();
      queuedKeys.add(key);
      return { rows: [{ id: `synthetic-job-${queuedKeys.size}` }], rowCount: 1 };
    }
    return empty();
  });
  mocks.transactionQuery.mockReset().mockImplementation(async (sql, values) => {
    const id = String(values?.[0]);
    if (sql.startsWith("SELECT record FROM alc_atendimento.cases")) {
      const previous = persisted.get(id);
      return { rows: previous ? [{ record: previous.record }] : [], rowCount: previous ? 1 : 0 };
    }
    if (sql.startsWith("INSERT INTO alc_atendimento.cases")) {
      const sourceAt = String(values?.[9]);
      const previous = persisted.get(id);
      if (previous && previous.sourceAt > sourceAt) return empty();
      persisted.set(id, { record: values?.[8], sourceAt });
      return { rows: [{ case_id: id }], rowCount: 1 };
    }
    return empty();
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("source import regressions", () => {
  it("manual client/driver sync never queues outbound WhatsApp, even with automations on", async () => {
    const initial = record();
    expect(await upsertCases([initial], NOW.toISOString(), false, null, false)).toEqual({
      processed: 1, new: 1,
    });
    expect(persisted.get(initial.caseId)?.record).toMatchObject({ caseId: initial.caseId });
    expect(queuedKeys.size).toBe(0);
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.outbox"))).toBe(false);
    expect(mocks.setting).not.toHaveBeenCalledWith("automation");
  });

  it("manually synchronizing the Inteligência source is data-only", async () => {
    const initial = record();
    mocks.coreQuery.mockResolvedValueOnce({ rows: [coreRow(initial)], rowCount: 1 });
    expect(await syncCore(false, false)).toEqual({ processed: 1, new: 1 });
    expect(queuedKeys.size).toBe(0);
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(mocks.setting).not.toHaveBeenCalledWith("automation");
  });

  it("baseline imports current cases without initial outreach", async () => {
    source.baselineComplete = false;
    const initial = record();
    mocks.coreQuery.mockResolvedValueOnce({ rows: [coreRow(initial)], rowCount: 1 });
    expect(await syncCore()).toEqual({ processed: 1, new: 0 });
    expect(mocks.coreQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE ($1::boolean OR competence=$2)"), [false, "202610Q1"],
    );
    expect(persisted.get(initial.caseId)?.record).toMatchObject({ caseId: initial.caseId, classification: "aguardando_comprovante" });
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(mocks.transactionQuery).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(hashtext($1))", [`atendimento_case:${initial.caseId}`]);
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE key='source'"), [
      expect.objectContaining({ baselineComplete: true, lastSync: NOW.toISOString(), processed: 1, new: 0 }),
    ]);
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(queuedKeys.size).toBe(0);
    expect(mocks.graph).not.toHaveBeenCalled();
  });

  it("imports new verified contacts once and reimport does not queue duplicate outreach", async () => {
    const initial = record();
    expect(await upsertCases([initial], NOW.toISOString(), false)).toEqual({ processed: 1, new: 1 });
    expect([...queuedKeys]).toEqual([
      `driver:${initial.caseId}:${initial.driverPhone}:initial`,
      `client:${initial.caseId}:${initial.customerPhone}:initial`,
    ]);
    expect(mocks.audit).toHaveBeenCalledWith(null, "template_queued", initial.caseId, { channel: "driver", automatic: true });
    expect(mocks.audit).toHaveBeenCalledWith(null, "template_queued", initial.caseId, { channel: "client", automatic: true });
    expect(mocks.templates).toHaveBeenCalledTimes(2);
    expect(await upsertCases([initial], NOW.toISOString(), false)).toEqual({ processed: 1, new: 0 });
    expect(queuedKeys.size).toBe(2);
    expect(mocks.templates).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenCalledTimes(2);
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE alc_atendimento.cases.source_at<=excluded.source_at RETURNING case_id"), expect.any(Array),
    );
    expect(mocks.graph).not.toHaveBeenCalled();
  });

  it("reimport preserves verified buyer and delivery details missing from a list snapshot", async () => {
    const initial = record();
    await upsertCases([initial], NOW.toISOString(), true);
    const sparse = record({ driverId: "", driverPhone: "", customerName: "", customerPhone: "", customerVerified: false, products: [], deliveryAt: "" });
    expect(await upsertCases([sparse], NOW.toISOString(), false)).toEqual({ processed: 1, new: 0 });
    expect(persisted.get(initial.caseId)?.record).toMatchObject({
      driverId: initial.driverId, driverPhone: initial.driverPhone, customerName: initial.customerName,
      customerPhone: initial.customerPhone, customerVerified: true, products: initial.products, deliveryAt: initial.deliveryAt,
    });
    expect(queuedKeys.size).toBe(0);
    expect(mocks.templates).not.toHaveBeenCalled();
  });

  it("preserves historical closed cases and verified contact without automatic outreach or changing baseline", async () => {
    const historical = record({ competence: "202609Q2", mainStatus: "CLOSED", subStatus: "BILLED", classification: "encerrada" });
    persisted.set(historical.caseId, { record: historical, sourceAt: "2026-10-07T12:00:00Z" });
    mocks.coreQuery.mockResolvedValueOnce({ rows: [coreRow(historical)], rowCount: 1 });
    expect(await syncCore(true)).toEqual({ processed: 1, new: 0 });
    expect(mocks.coreQuery).toHaveBeenCalledWith(expect.stringContaining("WHERE ($1::boolean OR competence=$2)"), [true, "202610Q1"]);
    expect(persisted.get(historical.caseId)?.record).toMatchObject({
      competence: "202609Q2", classification: "encerrada", mainStatus: "CLOSED",
      customerPhone: historical.customerPhone, customerVerified: true,
    });
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("WHERE key='source'"))).toBe(false);
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(queuedKeys.size).toBe(0);
  });

  it("fromCore keeps closed classification and never treats snapshot buyer contact as verified", () => {
    const historical = record({ competence: "202609Q2", mainStatus: "CLOSED", subStatus: "TO_BILL" });
    expect(fromCore(coreRow(historical))).toMatchObject({
      competence: "202609Q2", classification: "encerrada", driverPhone: historical.driverPhone,
      customerPhone: "", customerVerified: false,
    });
  });

  it("driver historical inquiry queries previous competencies using the verified identity and base", async () => {
    const historical = record({ competence: "202609Q2", mainStatus: "CLOSED", subStatus: "BILLED", classification: "encerrada" });
    mocks.coreQuery.mockResolvedValueOnce({ rows: [coreRow(historical)], rowCount: 1 });
    const conversation = {
      id: ID, channel: "driver", phone: historical.driverPhone, status: "bot", identity_verified: true,
      driver_id: historical.driverId, base_key: historical.baseKey, sigla: historical.sigla,
      agent_state: { step: "driver_verified" }, last_inbound_at: NOW.toISOString(), assigned_to: null,
    };
    const event = { event_key: "synthetic-history", channel: "driver", payload: { entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "synthetic-phone-id" }, messages: [{
        id: "synthetic-inbound", from: historical.driverPhone, type: "text", timestamp: NOW.getTime() / 1000,
        text: { body: "PNRs anteriores encerradas" },
      }],
    } }] }] } };
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql, values) => sql.startsWith("SELECT * FROM alc_atendimento.webhook_events")
      ? { rows: [event], rowCount: 1 } : query(sql, values));
    const transactionQuery = mocks.transactionQuery.getMockImplementation()!;
    mocks.transactionQuery.mockImplementation(async (sql, values) => {
      if (sql.startsWith("INSERT INTO alc_atendimento.conversations")) return { rows: [conversation], rowCount: 1 };
      if (sql.startsWith("INSERT INTO alc_atendimento.messages")) return { rows: [{ id: "synthetic-message" }], rowCount: 1 };
      if (sql.includes("WHERE driver_id=$1 AND driver_phone=$2"))
        return { rows: [...persisted.values()].map(({ record }) => ({ record })), rowCount: persisted.size };
      if (sql.includes("SET agent_state=$2,status=$3")) return { rows: [{ id: ID }], rowCount: 1 };
      return transactionQuery(sql, values);
    });
    await processEvents();
    expect(mocks.coreQuery).toHaveBeenCalledWith(expect.any(String), [true, "202610Q1"]);
    const lookup = mocks.transactionQuery.mock.calls.find(([sql]) => sql.includes("WHERE driver_id=$1 AND driver_phone=$2"));
    expect(lookup).toEqual([
      "SELECT record FROM alc_atendimento.cases WHERE driver_id=$1 AND driver_phone=$2 AND base_key=$3 AND sigla=$4 ORDER BY competence DESC,source_at DESC",
      [historical.driverId, historical.driverPhone, "BASE A", "SP"],
    ]);
    expect(persisted.get(historical.caseId)?.record).toMatchObject({ competence: "202609Q2", classification: "encerrada" });
    expect(mocks.transactionQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO alc_atendimento.outbox"), [
      "reply:synthetic-inbound", ID, "driver", historical.driverPhone,
      expect.objectContaining({ type: "text", text: { body: expect.stringContaining("202609Q2") } }),
    ]);
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(mocks.graph).not.toHaveBeenCalled();
  });
});

describe("initial template regressions", () => {
  it.each(["driver", "client"] as const)("deduplicates repeated %s initial templates and audits the duplicate", async (channel) => {
    const initial = record();
    expect(await queueTemplate(channel, initial, OPERATOR)).toBe(true);
    expect(await queueTemplate(channel, initial, OPERATOR)).toBe(false);
    const to = channel === "driver" ? initial.driverPhone : initial.customerPhone;
    expect([...queuedKeys]).toEqual([`${channel}:${initial.caseId}:${to}:initial`]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT(dedupe_key) DO NOTHING RETURNING id"), [
      `${channel}:${initial.caseId}:${to}:initial`, ID, initial.caseId, channel, to,
      expect.objectContaining({ type: "template", template: expect.objectContaining({ name: channel === "driver" ? "pnraberta" : "cliente_loss" }) }),
    ]);
    expect(mocks.audit).toHaveBeenLastCalledWith(null, "template_duplicate", initial.caseId, { channel, automatic: false });
    expect(mocks.graph).not.toHaveBeenCalled();
  });

  it.each(["driver", "client"] as const)("rejects historical or closed %s initial outreach before querying", async (channel) => {
    await expect(queueTemplate(channel, record({ competence: "202609Q2" }), OPERATOR)).rejects.toThrow("competência");
    await expect(queueTemplate(channel, record({ classification: "encerrada" }), OPERATOR)).rejects.toThrow("encerrada");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(queuedKeys.size).toBe(0);
  });

  it("rejects an inappropriate customer classification before querying or selecting a template", async () => {
    await expect(queueTemplate("client", record({ classification: "aberta" }), OPERATOR)).rejects.toThrow("Classificação");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(queuedKeys.size).toBe(0);
  });

  it("blocks proactive driver outreach for review without looking up the service window", async () => {
    await expect(queueTemplate("driver", record({ classification: "aberta" }), OPERATOR))
      .rejects.toThrow("Classificação fora das notificações");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(queuedKeys.size).toBe(0);
  });

  it("allows penalty via approved driver template, not a free-text exception", async () => {
    expect(await queueTemplate("driver", record({ classification: "penalidade" }), OPERATOR)).toBe(true);
    expect(queuedKeys.size).toBe(1);
    expect(mocks.templates).toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("WHERE channel='driver' AND phone"))).toBe(false);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO alc_atendimento.outbox"),
      expect.arrayContaining([expect.objectContaining({
        type: "template", template: expect.objectContaining({ name: "pnraberta" }),
      })]),
    );
  });

  it("refuses penalty notification when Meta has no approved driver template", async () => {
    mocks.templates.mockResolvedValueOnce([]);
    await expect(queueTemplate("driver", record({ classification: "penalidade" }), OPERATOR))
      .rejects.toThrow("Modelo aprovado indisponível");
    expect(queuedKeys.size).toBe(0);
  });

  it("rejects unverified buyer contact without creating a conversation or outbox job", async () => {
    await expect(queueTemplate("client", record({ customerVerified: false }), OPERATOR)).rejects.toThrow("incompletos");
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(queuedKeys.size).toBe(0);
  });

  it("rejects initial customer contact already owned by an active different shipment", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ case_id: "other-synthetic-case", status: "human" }], rowCount: 1 });
    await expect(queueTemplate("client", record(), OPERATOR)).rejects.toThrow("outro envio");
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
    expect(queuedKeys.size).toBe(0);
  });
});
