import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseRecord } from "../lib/domain";
import type { AuthProfile } from "@alc/identity/auth";
import { mockSender, providerCatalog, reviewedRow } from "./meta-contract-fixtures";

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };
const mocks = vi.hoisted(() => {
  const query =
    vi.fn<(sql: string, values?: unknown[]) => Promise<QueryResult>>();
  const coreQuery =
    vi.fn<(sql: string, values?: unknown[]) => Promise<QueryResult>>();
  const transactionQuery =
    vi.fn<(sql: string, values?: unknown[]) => Promise<QueryResult>>();
  const transaction = { query: transactionQuery, release: vi.fn() };
  return {
    query,
    coreQuery,
    transactionQuery,
    transaction,
    connect: vi.fn(),
    setting: vi.fn(),
    audit: vi.fn(),
    templates: vi.fn(),
    channelConfig: vi.fn(),
    graph: vi.fn(),
    assignCase: vi.fn(),
    syncLock: vi.fn(),
    syncRelease: vi.fn(),
  };
});
vi.mock("../lib/db", () => ({
  db: () => ({ query: mocks.query, connect: mocks.connect }),
  core: () => ({ query: mocks.coreQuery }),
  setting: mocks.setting,
  audit: mocks.audit,
}));
vi.mock("../lib/meta", () => ({
  templates: mocks.templates,
  channelConfig: mocks.channelConfig,
  graph: mocks.graph,
}));
vi.mock("../lib/assignment-engine", () => ({ assignCase: mocks.assignCase }));
vi.mock("../lib/dispatch-authorization", () => ({
  authorizeDispatch: vi.fn(async () => ({
    owner: {
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Synthetic operator",
    },
    assignment: { version: 1 },
    unit: { base_key: "BASE A", sigla: "SP" },
  })),
  validateQueuedAuthor: vi.fn(),
}));

import { queueTemplate, upsertCases, syncCore, fromCore } from "../lib/source";
import { processEvents } from "../lib/worker";

const ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-08T15:00:00Z");
const OPERATOR: AuthProfile = {
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Synthetic operator",
  email: "synthetic@example.test",
  role: "supervisor",
  baseScope: [],
  siglaScope: [],
  globalAccess: false,
};
let recentRecord: CaseRecord;
const record = (overrides: Partial<CaseRecord> = {}): CaseRecord =>
  (recentRecord = {
    caseId: "synthetic-case",
    shipmentId: "synthetic-shipment",
    competence: "202610Q1",
    caseDate: "2026-10-08",
    baseKey: "BASE A",
    sigla: "SP",
    driverId: "synthetic-driver",
    driverName: "Synthetic driver",
    driverPhone: "5511999990000",
    mainStatus: "NEW",
    subStatus: "WAITING_RECEIPT",
    classification: "aguardando_comprovante",
    customerName: "Synthetic buyer",
    customerPhone: "5511988880000",
    customerVerified: true,
    customerSource: "validado_pela_equipe",
    customerCapturedAt: NOW.toISOString(),
    products: [{ title: "Synthetic product" }],
    deliveryAt: "2026-10-07T12:00:00Z",
    purchaseValue: 10,
    ...overrides,
  });
const coreRow = (r: CaseRecord): Record<string, unknown> => ({
  case_id: r.caseId,
  shipment_id: r.shipmentId,
  competence: r.competence,
  case_date: r.caseDate,
  base_key: r.baseKey,
  sigla: r.sigla,
  driver_id: r.driverId,
  driver_name: r.driverName,
  main_status: r.mainStatus,
  sub_status: r.subStatus,
  purchase_value: r.purchaseValue,
  source_last_seen_at: NOW.toISOString(),
  raw_snapshot_jsonb: {
    detailSnapshot: {
      driverId: r.driverId,
      driverName: r.driverName,
      driverPhone: r.driverPhone,
      buyerName: r.customerName,
      products: r.products,
      deliveryAt: r.deliveryAt,
    },
  },
});
const empty = (): QueryResult => ({ rows: [], rowCount: 0 });
let persisted: Map<string, { record: unknown; sourceAt: string; fingerprint: string; comparisonVersion: number }>;
let queuedKeys: Set<string>;
let source: { baselineComplete: boolean; lastSync?: string; competence?: string };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network request");
    }),
  );
  persisted = new Map();
  queuedKeys = new Set();
  source = { baselineComplete: true, competence: "202610Q1" };
  mocks.coreQuery.mockReset().mockResolvedValue(empty());
  mocks.syncLock.mockReset().mockImplementation(async (sql: string) => ({
    rows: [sql.includes("pg_try_advisory_lock") ? { locked: true } : { unlocked: true }], rowCount: 1,
  }));
  mocks.connect.mockReset().mockImplementation(async () => {
    let syncLease = false;
    return {
      query: (sql: string, values?: unknown[]) => {
        if (sql.includes("atendimento_core_sync")) { syncLease = true; return mocks.syncLock(sql, values); }
        return values === undefined ? mocks.transactionQuery(sql) : mocks.transactionQuery(sql, values);
      },
      release: (error?: Error) => syncLease ? mocks.syncRelease(error) : mocks.transaction.release(),
    };
  });
  mocks.audit.mockReset().mockResolvedValue(undefined);
  mocks.setting.mockReset().mockImplementation(async (key: string) =>
    key === "source"
      ? source
      : {
          driverNotifications: true,
          clientOutreach: true,
          bot: true,
          operatorName: OPERATOR.fullName,
          intervalMinutes: 30,
        },
  );
  mocks.templates.mockReset().mockResolvedValue(providerCatalog);
  mocks.channelConfig
    .mockReset()
    .mockResolvedValue(mockSender);
  mocks.graph
    .mockReset()
    .mockRejectedValue(new Error("Unexpected provider send"));
  mocks.query.mockReset().mockImplementation(async (sql, values) => {
    if (sql.startsWith("SELECT channel,revision,baseline"))
      return { rows: [reviewedRow(values?.[0] as "driver" | "client")], rowCount: 1 };
    if (sql.startsWith("SELECT id FROM alc_atendimento.outbox"))
      return queuedKeys.has(`${values?.[1]}:${values?.[0]}:initial`)
        ? { rows: [{ id: "synthetic-job" }], rowCount: 1 }
        : empty();
    if (sql.startsWith("INSERT INTO alc_atendimento.conversations"))
      return { rows: [{ id: ID, case_id: values?.[5] }], rowCount: 1 };
    if (sql.startsWith("INSERT INTO alc_atendimento.outbox")) {
      const key = String(values?.[0]);
      if (queuedKeys.has(key)) return empty();
      queuedKeys.add(key);
      return {
        rows: [{ id: `synthetic-job-${queuedKeys.size}` }],
        rowCount: 1,
      };
    }
    return empty();
  });
  mocks.transactionQuery.mockReset().mockImplementation(async (sql, values) => {
    const id = String(values?.[0]);
    if (sql.startsWith("SELECT * FROM alc_atendimento.cases"))
      return {
        rows: [{ record: persisted.get(id)?.record || recentRecord }],
        rowCount: 1,
      };
    if (sql.startsWith("SELECT value FROM alc_atendimento.settings"))
      return {
        rows: [{ value: await mocks.setting("automation") }],
        rowCount: 1,
      };
    if (
      sql.startsWith("SELECT channel,revision,baseline") ||
      sql.startsWith("INSERT INTO alc_atendimento.outbox") ||
      sql.startsWith("INSERT INTO alc_atendimento.conversations") ||
      sql.startsWith("SELECT id FROM alc_atendimento.outbox") ||
      sql.startsWith("SELECT * FROM alc_atendimento.conversations")
    )
      return mocks.query(sql, values);
    if (sql.startsWith("SELECT record,source_at,comparison_version,fingerprint FROM alc_atendimento.cases")) {
      const previous = persisted.get(id);
      return {
        rows: previous
          ? [{ record: previous.record, source_at: previous.sourceAt, fingerprint: previous.fingerprint, comparison_version: previous.comparisonVersion }]
          : [],
        rowCount: previous ? 1 : 0,
      };
    }
    if (sql.startsWith("INSERT INTO alc_atendimento.cases")) {
      const sourceAt = String(values?.[9]);
      const previous = persisted.get(id);
      if (previous && Date.parse(previous.sourceAt) > Date.parse(sourceAt) && !values?.[11]) return empty();
      persisted.set(id, {
        record: values?.[8],
        sourceAt: previous && Date.parse(previous.sourceAt) > Date.parse(sourceAt) ? previous.sourceAt : sourceAt,
        fingerprint: String(values?.[10]),
        comparisonVersion: 2,
      });
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
    expect(
      await upsertCases([initial], NOW.toISOString(), false, null, false),
    ).toMatchObject({
      processed: 1,
      found: 1,
      new: 1,
    });
    expect(persisted.get(initial.caseId)?.record).toMatchObject({
      caseId: initial.caseId,
    });
    expect(queuedKeys.size).toBe(0);
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        sql.startsWith("INSERT INTO alc_atendimento.outbox"),
      ),
    ).toBe(false);
    expect(mocks.setting).not.toHaveBeenCalledWith("automation");
  });

  it("manually synchronizing the Inteligência source is data-only", async () => {
    const initial = record();
    mocks.coreQuery.mockResolvedValueOnce({
      rows: [coreRow(initial)],
      rowCount: 1,
    });
    expect(await syncCore(false, false)).toMatchObject({ processed: 1, found: 1, new: 1 });
    expect(queuedKeys.size).toBe(0);
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(mocks.setting).not.toHaveBeenCalledWith("automation");
  });

  it("baseline imports current cases without initial outreach", async () => {
    source.baselineComplete = false;
    const initial = record();
    mocks.coreQuery.mockResolvedValueOnce({
      rows: [coreRow(initial)],
      rowCount: 1,
    });
    expect(await syncCore()).toMatchObject({ processed: 1, found: 1, new: 1 });
    expect(mocks.coreQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE ($1::boolean OR competence=$2)"),
      [false, "202610Q1"],
    );
    expect(persisted.get(initial.caseId)?.record).toMatchObject({
      caseId: initial.caseId,
      classification: "aguardando_comprovante",
    });
    expect(mocks.transactionQuery).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`atendimento_case:${initial.caseId}`],
    );
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(mocks.transaction.release).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE key='source'"),
      [
        expect.objectContaining({
          baselineComplete: true,
          lastSync: NOW.toISOString(),
          processed: 1,
          new: 1,
        }),
      ],
    );
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(queuedKeys.size).toBe(0);
    expect(mocks.graph).not.toHaveBeenCalled();
  });

  it("reads the complete current slice regardless of the previous sync clock", async () => {
    source.baselineComplete = true;
    source.lastSync = "2026-10-08T14:55:00Z";
    expect(await syncCore(false, false)).toMatchObject({
      found: 0,
      new: 0,
      updated: 0,
      unchanged: 0,
    });
    expect(mocks.coreQuery).toHaveBeenCalledWith(
      expect.not.stringContaining("source_last_seen_at >="),
      [false, "202610Q1"],
    );
  });

  it("baselines the full new competence without outreach on rollover", async () => {
    vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
    source.lastSync = NOW.toISOString();
    const nextPeriod = record({ competence: "202610Q2", caseDate: "2026-10-16" });
    mocks.coreQuery.mockResolvedValueOnce({ rows: [{ ...coreRow(nextPeriod), source_last_seen_at: "2026-10-01T00:00:00Z" }], rowCount: 1 });
    expect(await syncCore()).toMatchObject({ found: 1, new: 1 });
    expect(mocks.coreQuery).toHaveBeenCalledWith(expect.any(String), [false, "202610Q2"]);
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE key='source'"), [expect.objectContaining({ competence: "202610Q2" })]);
  });

  it("does not finish a new competence baseline while Core is still empty", async () => {
    vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
    await syncCore(false, false);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE key='source'"), [expect.objectContaining({ competence: "202610Q2", baselineComplete: false })]);
  });

  it("uses a newer Core updated_at for details even when last-seen did not move", async () => {
    const initial = record();
    await upsertCases([initial], "2026-10-08T14:00:00Z", true, null, false);
    const row = { ...coreRow(initial), source_last_seen_at: "2026-10-07T00:00:00Z", updated_at: new Date("2026-10-08T15:00:00Z"),
      raw_snapshot_jsonb: { detailSnapshot: { products: [{ title: "New detail" }] } } };
    expect(fromCore(row)).toMatchObject({ sourceAt: "2026-10-08T15:00:00.000Z" });
    await upsertCases([fromCore(row)], NOW.toISOString(), false, null, false);
    expect(persisted.get(initial.caseId)?.record).toMatchObject({ products: [{ title: "New detail" }] });
  });

  it("imports a late Core commit even if both source timestamps predate an observed case", async () => {
    const initial = record();
    await upsertCases([initial], NOW.toISOString(), true, null, false);
    mocks.coreQuery.mockResolvedValueOnce({ rows: [{ ...coreRow(initial),
      source_last_seen_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-07T12:00:00Z",
      raw_snapshot_jsonb: { detailSnapshot: { products: [{ title: "Late committed detail" }] } },
    }], rowCount: 1 });
    expect(await syncCore(false, false)).toMatchObject({ found: 1, updated: 1, stale: 0 });
    expect(persisted.get(initial.caseId)?.record).toMatchObject({ products: [{ title: "Late committed detail" }] });
    expect(persisted.get(initial.caseId)?.sourceAt).toBe(NOW.toISOString());
    expect(mocks.syncLock).toHaveBeenLastCalledWith(expect.stringContaining("pg_advisory_unlock"), undefined);
    expect(mocks.syncRelease).toHaveBeenCalledWith(undefined);
  });

  it("fails closed when another Core sync owns the snapshot lock", async () => {
    mocks.syncLock.mockResolvedValueOnce({ rows: [{ locked: false }], rowCount: 1 });
    await expect(syncCore(false, false)).rejects.toThrow("Coleta Core em andamento");
    expect(mocks.coreQuery).not.toHaveBeenCalled();
    expect(mocks.transactionQuery).not.toHaveBeenCalled();
    expect(mocks.syncRelease).toHaveBeenCalledWith(undefined);
  });

  it("releases the Core snapshot lock after a source failure and destroys an ambiguous lock connection", async () => {
    mocks.coreQuery.mockRejectedValueOnce(new Error("Core unavailable"));
    await expect(syncCore(false, false)).rejects.toThrow("Core unavailable");
    expect(mocks.syncLock).toHaveBeenLastCalledWith(expect.stringContaining("pg_advisory_unlock"), undefined);
    mocks.syncLock.mockRejectedValueOnce(new Error("Lost connection during acquisition"));
    await expect(syncCore(false, false)).rejects.toThrow("Lost connection during acquisition");
    expect(mocks.syncRelease).toHaveBeenLastCalledWith(expect.any(Error));
  });

  it("refuses to send the old C01 Meta template without the approved purchase value", async () => {
    mocks.templates.mockResolvedValueOnce([
      { ...providerCatalog[1], name: "cliente_loss" },
    ]);
    await expect(queueTemplate("client", record(), OPERATOR)).rejects.toThrow(
      "Modelo aprovado indisponível",
    );
    expect(queuedKeys.size).toBe(0);
    expect(mocks.graph).not.toHaveBeenCalled();
  });

  it("imports new verified contacts once and reimport does not queue duplicate outreach", async () => {
    const initial = record();
    expect(await upsertCases([initial], NOW.toISOString(), false)).toMatchObject({
      processed: 1,
      found: 1,
      new: 1,
      updated: 0,
      unchanged: 0,
    });
    const initialEnrichment = mocks.transactionQuery.mock.calls.find(([sql]) =>
      sql.startsWith("INSERT INTO alc_atendimento.pnr_enrichment_outbox"),
    );
    expect(initialEnrichment?.[1]?.[2]).toMatchObject({
      schemaVersion: 2,
      caseId: initial.caseId,
      verified: true,
    });
    expect(
      mocks.transactionQuery.mock.calls.findIndex(([sql]) =>
        sql.startsWith("INSERT INTO alc_atendimento.pnr_enrichment_outbox"),
      ),
    ).toBeLessThan(
      mocks.transactionQuery.mock.calls.findIndex(([sql]) => sql === "COMMIT"),
    );
    expect([...queuedKeys]).toEqual([
      `driver:${initial.caseId}:initial`,
      `client:${initial.caseId}:initial`,
    ]);
    expect(mocks.audit).toHaveBeenCalledWith(
      null,
      "template_queued",
      initial.caseId,
      expect.objectContaining({ channel: "driver", automatic: true }),
      expect.objectContaining({ query: expect.any(Function), release: expect.any(Function) }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      null,
      "template_queued",
      initial.caseId,
      expect.objectContaining({ channel: "client", automatic: true }),
      expect.objectContaining({ query: expect.any(Function), release: expect.any(Function) }),
    );
    expect(mocks.templates).toHaveBeenCalledTimes(2);
    expect(await upsertCases([initial], NOW.toISOString(), false)).toMatchObject({
      processed: 1,
      found: 1,
      new: 0,
      updated: 0,
      unchanged: 1,
    });
    const enrichmentWrites = mocks.transactionQuery.mock.calls.filter(([sql]) =>
      sql.startsWith("INSERT INTO alc_atendimento.pnr_enrichment_outbox"),
    );
    expect(enrichmentWrites).toHaveLength(2);
    expect(enrichmentWrites[1][1]?.[0]).toBe(enrichmentWrites[0][1]?.[0]);
    expect(queuedKeys.size).toBe(2);
    expect(mocks.templates).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenCalledTimes(2);
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        "WHERE alc_atendimento.cases.source_at<=excluded.source_at OR $12::boolean RETURNING case_id",
      ),
      expect.any(Array),
    );
    expect(mocks.graph).not.toHaveBeenCalled();
  });

  it("reimport preserves verified buyer and delivery details missing from a list snapshot", async () => {
    const initial = record();
    await upsertCases([initial], NOW.toISOString(), true);
    const sparse = record({
      driverId: "",
      driverPhone: "",
      customerName: "",
      customerPhone: "",
      customerVerified: false,
      products: [],
      deliveryAt: "",
    });
    expect(await upsertCases([sparse], NOW.toISOString(), false)).toMatchObject({
      processed: 1,
      found: 1,
      new: 0,
      updated: 0,
      unchanged: 1,
    });
    expect(persisted.get(initial.caseId)?.record).toMatchObject({
      driverId: initial.driverId,
      driverPhone: initial.driverPhone,
      customerName: initial.customerName,
      customerPhone: initial.customerPhone,
      customerVerified: true,
      products: initial.products,
      deliveryAt: initial.deliveryAt,
    });
    expect(queuedKeys.size).toBe(0);
    expect(mocks.templates).not.toHaveBeenCalled();
  });

  it("does not replace a verified buyer contact with an older verified capture", async () => {
    const existing = record();
    await upsertCases([existing], NOW.toISOString(), true, null, false);
    const older = record({
      customerName: "Older buyer name",
      customerPhone: "5511977770000",
      customerCapturedAt: "2026-10-07T15:00:00Z",
    }) as CaseRecord & { sourceAt: string };
    older.sourceAt = "2026-10-08T15:01:00Z";
    expect(await upsertCases([older], NOW.toISOString(), false, null, false)).toMatchObject({
      updated: 0,
      unchanged: 1,
      verifiedPhoneAdded: 0,
    });
    expect(persisted.get(existing.caseId)?.record).toMatchObject({
      customerName: existing.customerName,
      customerPhone: existing.customerPhone,
      customerCapturedAt: existing.customerCapturedAt,
    });
  });

  it("counts fingerprint backfill as unchanged rather than a new or updated PNR", async () => {
    const initial = record();
    persisted.set(initial.caseId, { record: initial, sourceAt: NOW.toISOString(), fingerprint: "", comparisonVersion: 1 });
    expect(await upsertCases([initial], NOW.toISOString(), true, null, false))
      .toMatchObject({ found: 1, new: 0, updated: 0, unchanged: 1 });
    expect(persisted.get(initial.caseId)?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.templates).not.toHaveBeenCalled();
  });

  it("refuses to carry a verified contact to another shipment under the same case ID", async () => {
    const initial = record();
    await upsertCases([initial], NOW.toISOString(), true, null, false);
    mocks.transactionQuery.mockClear();
    await expect(upsertCases([record({ shipmentId: "other-shipment" })], NOW.toISOString(), false, null, false))
      .rejects.toThrow("PNR/envio divergente");
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.transactionQuery.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
    expect(persisted.get(initial.caseId)?.record).toEqual(initial);
  });

  it("counts a real source change and ignores stale source snapshots", async () => {
    const initial = record({ customerVerified: false, customerSource: "", customerCapturedAt: "" });
    await upsertCases([initial], NOW.toISOString(), true, null, false);
    const changed = record({
      mainStatus: "CLOSED",
      subStatus: "BILLED",
      classification: "encerrada",
      baseKey: "BASE B",
    });
    expect(
      await upsertCases(
        [changed as CaseRecord & { sourceAt: string }],
        NOW.toISOString(),
        false,
        null,
        false,
      ),
    ).toMatchObject({
      found: 1,
      new: 0,
      updated: 1,
      unchanged: 0,
      classificationChanged: 1,
      scopeChanged: 1,
      verifiedPhoneAdded: 1,
    });

    const stale = { ...changed, mainStatus: "NEW", sourceAt: "2026-10-07T00:00:00Z" };
    expect(await upsertCases([stale], NOW.toISOString(), false, null, false)).toMatchObject({
      found: 1,
      updated: 0,
      unchanged: 0,
      stale: 1,
    });
    expect(persisted.get(initial.caseId)?.record).toMatchObject({
      mainStatus: "CLOSED",
      baseKey: "BASE B",
    });
  });

  it("never assigns a historical case or lets a stale historical snapshot reassign a current case", async () => {
    const settings = mocks.setting.getMockImplementation()!;
    mocks.setting.mockImplementation((key: string) => key === "assignment_policy"
      ? Promise.resolve({ mode: "primary_then_least_loaded" }) : settings(key));
    await upsertCases([record({ caseId: "history-case", competence: "202609Q2", classification: "encerrada" })], NOW.toISOString(), true, null, false);
    expect(mocks.assignCase).not.toHaveBeenCalled();
    const current = record();
    await upsertCases([current], NOW.toISOString(), true, null, false);
    mocks.assignCase.mockClear();
    const stale = { ...current, competence: "202609Q2", classification: "encerrada", sourceAt: "2026-10-07T00:00:00Z" };
    expect(await upsertCases([stale], NOW.toISOString(), false, null, false)).toMatchObject({ stale: 1, updated: 0 });
    expect(mocks.assignCase).not.toHaveBeenCalled();
    expect(persisted.get(current.caseId)?.record).toMatchObject({ competence: "202610Q1", classification: "aguardando_comprovante" });
  });

  it("preserves historical closed cases and verified contact without automatic outreach or changing baseline", async () => {
    const historical = record({
      competence: "202609Q2",
      mainStatus: "CLOSED",
      subStatus: "BILLED",
      classification: "encerrada",
    });
    persisted.set(historical.caseId, {
      record: historical,
      sourceAt: "2026-10-07T12:00:00Z",
      fingerprint: "",
      comparisonVersion: 0,
    });
    mocks.coreQuery.mockResolvedValueOnce({
      rows: [coreRow(historical)],
      rowCount: 1,
    });
    expect(await syncCore(true)).toMatchObject({ processed: 1, found: 1, new: 0 });
    expect(mocks.coreQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE ($1::boolean OR competence=$2)"),
      [true, "202610Q1"],
    );
    expect(persisted.get(historical.caseId)?.record).toMatchObject({
      competence: "202609Q2",
      classification: "encerrada",
      mainStatus: "CLOSED",
      customerPhone: historical.customerPhone,
      customerVerified: true,
    });
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        sql.includes("WHERE key='source'"),
      ),
    ).toBe(false);
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(queuedKeys.size).toBe(0);
  });

  it("fromCore keeps closed classification and never treats snapshot buyer contact as verified", () => {
    const historical = record({
      competence: "202609Q2",
      mainStatus: "CLOSED",
      subStatus: "TO_BILL",
    });
    expect(fromCore(coreRow(historical))).toMatchObject({
      competence: "202609Q2",
      classification: "encerrada",
      driverPhone: historical.driverPhone,
      customerPhone: "",
      customerVerified: false,
    });
  });

  it("driver historical inquiry queries previous competencies using the verified identity and base", async () => {
    const historical = record({
      competence: "202609Q2",
      mainStatus: "CLOSED",
      subStatus: "BILLED",
      classification: "encerrada",
    });
    mocks.coreQuery.mockResolvedValueOnce({
      rows: [coreRow(historical)],
      rowCount: 1,
    });
    const conversation = {
      id: ID,
      channel: "driver",
      phone: historical.driverPhone,
      status: "bot",
      identity_verified: true,
      driver_id: historical.driverId,
      base_key: historical.baseKey,
      sigla: historical.sigla,
      agent_state: { step: "driver_verified" },
      last_inbound_at: NOW.toISOString(),
      assigned_to: null,
    };
    const event = {
      event_key: "synthetic-history",
      channel: "driver",
      payload: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "synthetic-phone-id" },
                  messages: [
                    {
                      id: "synthetic-inbound",
                      from: historical.driverPhone,
                      type: "text",
                      timestamp: NOW.getTime() / 1000,
                      text: { body: "PNRs anteriores encerradas" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql, values) =>
      sql.startsWith("SELECT * FROM alc_atendimento.webhook_events")
        ? { rows: [event], rowCount: 1 }
        : query(sql, values),
    );
    const transactionQuery = mocks.transactionQuery.getMockImplementation()!;
    mocks.transactionQuery.mockImplementation(async (sql, values) => {
      if (sql.startsWith("INSERT INTO alc_atendimento.conversations"))
        return { rows: [conversation], rowCount: 1 };
      if (sql.startsWith("INSERT INTO alc_atendimento.messages"))
        return { rows: [{ id: "synthetic-message" }], rowCount: 1 };
      if (sql.includes("WHERE driver_id=$1 AND driver_phone=$2"))
        return {
          rows: [...persisted.values()].map(({ record }) => ({ record })),
          rowCount: persisted.size,
        };
      if (sql.includes("SET agent_state=$2,status=$3"))
        return { rows: [{ id: ID }], rowCount: 1 };
      return transactionQuery(sql, values);
    });
    await processEvents();
    expect(mocks.coreQuery).toHaveBeenCalledWith(expect.any(String), [
      true,
      "202610Q1",
    ]);
    const lookup = mocks.transactionQuery.mock.calls.find(([sql]) =>
      sql.includes("WHERE driver_id=$1 AND driver_phone=$2"),
    );
    expect(lookup).toEqual([
      "SELECT record FROM alc_atendimento.cases WHERE driver_id=$1 AND driver_phone=$2 AND base_key=$3 AND sigla=$4 ORDER BY competence DESC,source_at DESC",
      [historical.driverId, historical.driverPhone, "BASE A", "SP"],
    ]);
    expect(persisted.get(historical.caseId)?.record).toMatchObject({
      competence: "202609Q2",
      classification: "encerrada",
    });
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO alc_atendimento.outbox"),
      [
        "reply:synthetic-inbound",
        ID,
        "driver",
        historical.driverPhone,
        expect.objectContaining({
          type: "text",
          text: { body: expect.stringContaining("202609Q2") },
        }),
        "ai",
        null,
        "Ellie",
      ],
    );
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(mocks.graph).not.toHaveBeenCalled();
  });
});

describe("initial template regressions", () => {
  it.each(["driver", "client"] as const)(
    "deduplicates repeated %s initial templates and audits the duplicate",
    async (channel) => {
      const initial = record();
      expect(await queueTemplate(channel, initial, OPERATOR)).toBe(true);
      expect(await queueTemplate(channel, initial, OPERATOR)).toBe(false);
      const to =
        channel === "driver" ? initial.driverPhone : initial.customerPhone;
      expect([...queuedKeys]).toEqual([`${channel}:${initial.caseId}:initial`]);
      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringContaining(
          "ON CONFLICT(dedupe_key) DO NOTHING RETURNING id",
        ),
        expect.arrayContaining([
          `${channel}:${initial.caseId}:initial`,
          ID,
          initial.caseId,
          channel,
          to,
          expect.objectContaining({
            type: "template",
            template: expect.objectContaining({
              name: channel === "driver" ? "pnraberta" : "cliente_loss_v2",
            }),
          }),
        ]),
      );
      expect(mocks.audit).toHaveBeenLastCalledWith(
        OPERATOR.id,
        "template_duplicate",
        initial.caseId,
        { channel, automatic: false },
        expect.objectContaining({ query: expect.any(Function), release: expect.any(Function) }),
      );
      expect(mocks.graph).not.toHaveBeenCalled();
    },
  );

  it.each(["driver", "client"] as const)(
    "rejects historical or closed %s initial outreach before querying",
    async (channel) => {
      await expect(
        queueTemplate(channel, record({ competence: "202609Q2" }), OPERATOR),
      ).rejects.toThrow("competência");
      await expect(
        queueTemplate(
          channel,
          record({ classification: "encerrada" }),
          OPERATOR,
        ),
      ).rejects.toThrow("encerrada");
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.templates).not.toHaveBeenCalled();
      expect(queuedKeys.size).toBe(0);
    },
  );

  it("rejects an inappropriate customer classification before querying or selecting a template", async () => {
    await expect(
      queueTemplate("client", record({ classification: "aberta" }), OPERATOR),
    ).rejects.toThrow("Classificação");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(queuedKeys.size).toBe(0);
  });

  it("blocks proactive driver outreach for review without looking up the service window", async () => {
    await expect(
      queueTemplate("driver", record({ classification: "aberta" }), OPERATOR),
    ).rejects.toThrow("Classificação fora das notificações");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(queuedKeys.size).toBe(0);
  });

  it("allows penalty via approved driver template, not a free-text exception", async () => {
    expect(
      await queueTemplate(
        "driver",
        record({ classification: "penalidade" }),
        OPERATOR,
      ),
    ).toBe(true);
    expect(queuedKeys.size).toBe(1);
    expect(mocks.templates).toHaveBeenCalled();
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        sql.includes("WHERE channel='driver' AND phone"),
      ),
    ).toBe(false);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO alc_atendimento.outbox"),
      expect.arrayContaining([
        expect.objectContaining({
          type: "template",
          template: expect.objectContaining({ name: "pnraberta" }),
        }),
      ]),
    );
  });

  it("refuses penalty notification when Meta has no approved driver template", async () => {
    mocks.templates.mockResolvedValueOnce([]);
    await expect(
      queueTemplate(
        "driver",
        record({ classification: "penalidade" }),
        OPERATOR,
      ),
    ).rejects.toThrow("Modelo aprovado indisponível");
    expect(queuedKeys.size).toBe(0);
  });

  it("rejects unverified buyer contact without creating a conversation or outbox job", async () => {
    await expect(
      queueTemplate("client", record({ customerVerified: false }), OPERATOR),
    ).rejects.toThrow("incompletos");
    expect(
      mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT")),
    ).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(queuedKeys.size).toBe(0);
  });

  it("rejects initial customer contact already owned by an active different shipment", async () => {
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql, values) =>
      sql.startsWith("SELECT * FROM alc_atendimento.conversations")
        ? {
            rows: [
              { id: ID, case_id: "other-synthetic-case", status: "human" },
            ],
            rowCount: 1,
          }
        : query(sql, values),
    );
    await expect(queueTemplate("client", record(), OPERATOR)).rejects.toThrow(
      "tratativa incompatível",
    );
    expect(mocks.templates).toHaveBeenCalledOnce();
    expect(
      mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT")),
    ).toBe(false);
    expect(queuedKeys.size).toBe(0);
  });
});
