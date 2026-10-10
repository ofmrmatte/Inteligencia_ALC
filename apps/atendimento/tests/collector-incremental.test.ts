import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptySyncCounts } from "../lib/sync-delta";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), query: vi.fn(), coreQuery: vi.fn(),
  upsert: vi.fn(), setting: vi.fn(), audit: vi.fn(),
}));
vi.mock("../lib/auth", async original => ({ ...await original<object>(), currentProfile: mocks.profile }));
vi.mock("../lib/db", () => ({
  db: () => ({ query: mocks.query }), core: () => ({ query: mocks.coreQuery }),
  setting: mocks.setting, audit: mocks.audit,
}));
vi.mock("../lib/source", () => ({ upsertCases: mocks.upsert, syncCore: vi.fn(), queueTemplate: vi.fn() }));
import { POST } from "../app/api/[resource]/route";

const origin = "https://atendimento.example";
const batch = [
  { caseId: "10001", shipmentId: "90001", mainStatus: "NEW", subStatus: "WAITING_RECEIPT" },
  { caseId: "10002", shipmentId: "90002", mainStatus: "NEW", subStatus: "WAITING_RECEIPT" },
  { caseId: "10003", shipmentId: "90003", mainStatus: "CLOSED", subStatus: "" },
];
const full = { ...batch[0], caseDate: "2026-10-09", originStation: "BASE", driverName: "Motorista", purchaseValue: 100 };
const call = (resource: string, payload: object) =>
  POST(new Request(`${origin}/api/${resource}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(payload),
  }), { params: Promise.resolve({ resource }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  mocks.profile.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", role: "developer", globalAccess: true });
  mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mocks.coreQuery.mockResolvedValue({ rows: [] });
  mocks.setting.mockResolvedValue(null);
  mocks.audit.mockResolvedValue(undefined);
  mocks.upsert.mockResolvedValue({ ...emptySyncCounts(), byUnit: [] });
});
afterEach(() => vi.useRealTimers());

describe("deduplicação da extensão por lote", () => {
  it("separa PNR nova, alteração somente de status e PNR idêntica", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [
      { case_id: "10002", shipment_id: "90002", competence: "202610Q1", main_status: "NEW", sub_status: "WAITING_RECEIPT" },
      { case_id: "10003", shipment_id: "90003", competence: "202610Q1", main_status: "NEW", sub_status: "" },
    ], rowCount: 2 });
    const response = await call("collector-lookup", { competence: "202610Q1", records: batch });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ decisions: [
      { caseId: "10001", action: "full" }, { caseId: "10002", action: "skip" }, { caseId: "10003", action: "status" },
    ] });
    expect(mocks.query.mock.calls[0][0]).toContain("WHERE case_id = ANY($1::text[])");
    expect(mocks.query.mock.calls[0][1]).toEqual(["10001", "10002", "10003"]);
  });
  it("não ignora uma PNR de outra competência ou com envio diferente", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ case_id: "10001", shipment_id: "90001", competence: "202609Q2", main_status: "NEW", sub_status: "WAITING_RECEIPT" }], rowCount: 1 });
    const res = await call("collector-lookup", { competence: "202610Q1", records: [batch[0]] });
    expect((await res.json()).decisions[0].action).toBe("full");
    mocks.query.mockResolvedValueOnce({ rows: [{ case_id: "10001", shipment_id: "99999", competence: "202610Q1", main_status: "NEW", sub_status: "WAITING_RECEIPT" }], rowCount: 1 });
    const mismatch = await call("collector-lookup", { competence: "202610Q1", records: [batch[0]] });
    expect(mismatch.status).toBe(409);
  });
  it("impede identificação repetida e consulta de outra origem", async () => {
    expect((await call("collector-lookup", { competence: "202610Q1", records: [batch[0], batch[0]] })).status).toBe(400);
    const foreign = await POST(new Request(`${origin}/api/collector-lookup`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://unrelated.example" },
      body: JSON.stringify({ competence: "202610Q1", records: [batch[0]] }),
    }), { params: Promise.resolve({ resource: "collector-lookup" }) });
    expect(foreign.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("registra PNRs ignoradas no resumo sem enriquecer nem disparar mensagens", async () => {
    mocks.upsert.mockResolvedValueOnce({ ...emptySyncCounts(), processed: 1, found: 1, new: 1, byUnit: [] });
    mocks.query.mockResolvedValueOnce({ rows: [{ case_id: "10002", base_key: "BASE", sigla: "SP" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const response = await call("import", {
      competence: "202610Q1", syncId: "22222222-2222-4222-8222-222222222222",
      channel: null, collectOnly: true, completed: true,
      records: [full], skippedCaseIds: ["10002"],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processed: 2, found: 2, new: 1, unchanged: 1 });
    expect(mocks.upsert.mock.calls[0][4]).toBe(false);
    expect(mocks.query.mock.calls[0][1]).toEqual([["10002"], "202610Q1"]);
    const stored = mocks.query.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO alc_atendimento.settings"));
    expect(stored?.[1]?.[0]).toMatchObject({ stats: { new: 1, unchanged: 1, processed: 2 } });
  });
  it("envia mudança de status com statusOnly para o importador", async () => {
    mocks.upsert.mockResolvedValueOnce({ ...emptySyncCounts(), processed: 1, found: 1, updated: 1, byUnit: [] });
    const response = await call("import", {
      competence: "202610Q1", syncId: "22222222-2222-4222-8222-222222222222",
      collectOnly: true, completed: true, records: [{ ...full, statusOnly: true }],
    });
    expect(response.status).toBe(200);
    expect(mocks.upsert.mock.calls[0][6]).toBe(false);
    expect(mocks.upsert.mock.calls[0][7]).toEqual(new Set(["10001"]));
    expect(mocks.upsert.mock.calls[0][4]).toBe(false);
  });
});
