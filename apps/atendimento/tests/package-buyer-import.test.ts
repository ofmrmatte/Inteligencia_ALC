import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), query: vi.fn(), coreQuery: vi.fn(), upsert: vi.fn(), setting: vi.fn(), audit: vi.fn() }));
vi.mock("../lib/auth", async load => ({ ...await load<object>(), currentProfile: mocks.profile }));
vi.mock("../lib/db", () => ({ db: () => ({ query: mocks.query }), core: () => ({ query: mocks.coreQuery }), setting: mocks.setting, audit: mocks.audit }));
vi.mock("../lib/source", () => ({ upsertCases: mocks.upsert, syncCore: vi.fn(), queueTemplate: vi.fn() }));
import { POST } from "../app/api/[resource]/route";
import { emptySyncCounts } from "../lib/sync-delta";
const record = { caseId: "10001", shipmentId: "10000000001", caseDate: "2026-10-08", originStation: "SYNTHETIC", driverName: "Motorista fictício", mainStatus: "NEW", subStatus: "WAITING_RECEIPT", purchaseValue: 10 };
const packageBuyer = { shipmentId: record.shipmentId, name: "Cliente fictício", phone: "21999990000", address: "Rua Exemplo, 10", sourceUrl: `https://envios.adminml.com/logistics/package-management/package/${record.shipmentId}`, capturedAt: "2026-10-08T12:00:00Z" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", role: "developer", globalAccess: true });
  mocks.query.mockResolvedValue({ rows: [], rowCount: 1 }); mocks.coreQuery.mockResolvedValue({ rows: [] });
  mocks.setting.mockResolvedValue(null); mocks.audit.mockResolvedValue(undefined); mocks.upsert.mockResolvedValue({ ...emptySyncCounts(), processed: 1, found: 1, new: 1, byUnit: [] });
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
});
async function call(row: object) {
  return POST(new Request("https://atendimento.example/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ syncId: "22222222-2222-4222-8222-222222222222", competence: "202610Q1", completed: true, collectOnly: true, channel: "client", records: [row] }) }), { params: Promise.resolve({ resource: "import" }) });
}
describe("importação dos dados de clientes pela extensão", () => {
  it("persiste comprador validado do envio sem enfileirar mensagens na coleta manual", async () => {
    expect((await call({ ...record, packageBuyer })).status).toBe(200);
    expect(mocks.upsert.mock.calls[0][0][0]).toMatchObject({ customerName: packageBuyer.name, customerPhone: "5521999990000", customerVerified: true, customerAddress: packageBuyer.address, customerSource: packageBuyer.sourceUrl });
    expect(mocks.upsert.mock.calls[0][4]).toBe(false);
    expect(mocks.upsert.mock.calls[0][0][0]).not.toHaveProperty("customerDocument");
    vi.useRealTimers();
  });
  it("não considera um telefone avulso da listagem como contato validado", async () => {
    expect((await call({ ...record, customerName: "Cliente fictício", customerPhone: packageBuyer.phone })).status).toBe(200);
    expect(mocks.upsert.mock.calls[0][0][0]).toMatchObject({ customerPhone: "", customerVerified: false }); vi.useRealTimers();
  });
  it("continua importando PNR com comprador inválido sem validar contato, e sinaliza pendência", async () => {
    const malformedBuyer = { ...packageBuyer, phone: "telefone-invalido" };
    const response = await call({ ...record, packageBuyer: malformedBuyer });
    expect(response.status).toBe(200);
    const stats = await response.json();
    expect(stats).toMatchObject({ processed: 1, errors: 1, buyerRejected: 1, caseRejected: 0, complete: false });
    expect(stats.rejectedFields).toContain("packageBuyer.phone");
    expect(mocks.upsert.mock.calls[0][0][0]).toMatchObject({
      caseId: record.caseId, customerVerified: false, customerPhone: "",
    });
    expect(mocks.upsert.mock.calls[0][4]).toBe(false);
    const update = mocks.query.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO alc_atendimento.settings"));
    expect(update?.[1]?.[0]).toMatchObject({ completed: false, importErrors: 1 });
    vi.useRealTimers();
  });
  it("isola registro com campo essencial inválido, mantendo os demais e sem concluir a sincronização", async () => {
    const response = await POST(new Request("https://atendimento.example/api/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        syncId: "22222222-2222-4222-8222-222222222222",
        competence: "202610Q1", completed: true, channel: "client", collectOnly: true,
        records: [record, { ...record, caseId: "invalid" }],
      }),
    }), { params: Promise.resolve({ resource: "import" }) });
    expect(response.status).toBe(200);
    const stats = await response.json();
    expect(stats).toMatchObject({ processed: 2, errors: 1, buyerRejected: 0, caseRejected: 1, complete: false });
    expect(stats.rejectedFields).toContain("caseId");
    expect(mocks.upsert.mock.calls[0][0]).toHaveLength(1);
    expect(mocks.upsert.mock.calls[0][4]).toBe(false);
    vi.useRealTimers();
  });
  it("recusa a mistura de comprador de outro envio antes de escrever no banco", async () => {
    expect((await call({ ...record, packageBuyer: { ...packageBuyer, shipmentId: "10000000002", sourceUrl: "https://envios.adminml.com/logistics/package-management/package/10000000002" } })).status).toBe(409);
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled(); vi.useRealTimers();
  });
});
