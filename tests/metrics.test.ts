import { describe, expect, it } from "vitest";
import { duplicateGroups, filterOptions, fortnightFromDate, latestPnrByShipment, monthFromFortnight, normalizeFortnight, pnrDecisionRows, reconciliation, scopeData, sumByUniqueShipment, uniqueByShipment } from "@/lib/metrics";
import type { ScopedData } from "@/lib/metrics";
import { EMPTY_FILTERS, type DashboardData, type ImportEntry, type PnrRecord } from "@/lib/types";

describe("grão por ID de pacote", () => {
  it("mantém IDs diferentes na mesma rota como produtos separados", () => {
    const rows = [
      { shipmentId: "100", routeId: "R1", value: 30 },
      { shipmentId: "101", routeId: "R1", value: 30 },
    ];
    expect(uniqueByShipment(rows)).toHaveLength(2);
    expect(sumByUniqueShipment(rows, (row) => row.value)).toBe(60);
  });

  it("consolida somente o mesmo ID e expõe a duplicidade", () => {
    const rows = [
      { shipmentId: "100", value: 30 },
      { shipmentId: "100", value: 30 },
    ];
    expect(uniqueByShipment(rows)).toHaveLength(1);
    expect(sumByUniqueShipment(rows, (row) => row.value)).toBe(30);
    expect(duplicateGroups(rows)[0][0]).toBe("100");
  });
});

describe("conciliação entre fontes", () => {
  it("usa exclusivamente o ID como chave", () => {
    const scoped = {
      hierarchy: [],
      drivers: [],
      prefatura: [
        { shipmentId: "A", value: 50 },
        { shipmentId: "B", value: 50 },
      ],
      pnr: [{ shipmentId: "A", purchaseValue: 50 }],
      risk: [{ shipmentId: "C", gmvBrl: 50 }],
    } as unknown as ScopedData;
    const rows = reconciliation(scoped);
    expect(rows.find((row) => row.shipmentId === "A")?.status).toBe("Conciliado");
    expect(rows.find((row) => row.shipmentId === "B")?.status).toBe("Isolado");
    expect(rows.find((row) => row.shipmentId === "C")?.status).toBe("Isolado");
  });

  it("não trata atualização de PNR em novo upload como duplicidade operacional", () => {
    const scoped = {
      hierarchy: [],
      drivers: [],
      prefatura: [{ shipmentId: "A", value: 50 }],
      pnr: [
        { batchId: "old", shipmentId: "A", purchaseValue: 50, status: "Aguardando comprovante" },
        { batchId: "new", shipmentId: "A", purchaseValue: 50, status: "Anulado" },
      ],
      risk: [],
    } as unknown as ScopedData;
    const imports = [
      { batchId: "old", importedAt: "2026-07-01T10:00:00.000Z" },
      { batchId: "new", importedAt: "2026-07-02T10:00:00.000Z" },
    ] as unknown as ImportEntry[];
    const rows = reconciliation(scoped, imports);
    expect(rows.find((row) => row.shipmentId === "A")).toMatchObject({
      pnr: 1,
      sources: 2,
      status: "Conciliado",
    });
  });
});

describe("atualização de status PNR", () => {
  it("usa o status do lote mais recente para o mesmo ID de envio", () => {
    const pnr = [
      { batchId: "old", shipmentId: "47086532633", status: "Aguardando comprovante" },
      { batchId: "new", shipmentId: "47086532633", status: "Anulado" },
    ] as unknown as PnrRecord[];
    const imports = [
      { batchId: "old", importedAt: "2026-07-01T10:00:00.000Z" },
      { batchId: "new", importedAt: "2026-07-01T11:00:00.000Z" },
    ] as unknown as ImportEntry[];
    const rows = latestPnrByShipment(pnr, imports);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("Anulado");
  });
});

describe("atividade operacional de bases e motoristas", () => {
  it("inativa motorista e base que não aparecem na quinzena mais recente sem apagar histórico", () => {
    const data = {
      hierarchy: [
        { coordinator: "Gestor", supervisor: "Supervisor", sigla: "OLD", base: "Base Antiga", baseKey: "BASE ANTIGA" },
        { coordinator: "Gestor", supervisor: "Supervisor", sigla: "NEW", base: "Base Nova", baseKey: "BASE NOVA" },
      ],
      prefatura: [
        { batchId: "jan", period: "01Q012026", baseKey: "BASE ANTIGA", sigla: "OLD", driverName: "Motorista Bloqueado", shipmentId: "A", value: 20000 },
        { batchId: "feb", period: "02Q012026", baseKey: "BASE NOVA", sigla: "NEW", driverName: "Motorista Ativo", shipmentId: "B", value: 200 },
      ],
      pnr: [],
      risk: [
        { batchId: "jan", failureDate: "2026-01-05", baseKey: "BASE ANTIGA", sigla: "OLD", driverId: "D1", shipmentId: "A", gmvBrl: 20000 },
        { batchId: "feb", failureDate: "2026-01-20", baseKey: "BASE NOVA", sigla: "NEW", driverId: "D2", shipmentId: "B", gmvBrl: 200 },
      ],
      drivers: [
        { driverId: "D1", name: "Motorista Bloqueado" },
        { driverId: "D2", name: "Motorista Ativo" },
      ],
      imports: [],
      isDemo: false,
    } as unknown as DashboardData;

    const current = scopeData(data, EMPTY_FILTERS);
    expect(current.drivers.map((driver) => driver.driverId)).toEqual(["D2"]);
    expect(current.risk.map((row) => row.shipmentId)).toEqual(["B"]);
    expect(current.prefatura.map((row) => row.shipmentId)).toEqual(["B"]);
    expect(filterOptions(data, EMPTY_FILTERS).bases).toEqual(["Base Nova"]);

    const january = scopeData(data, { ...EMPTY_FILTERS, month: "2026-01", fortnight: "Q1" });
    expect(january.drivers.map((driver) => driver.driverId)).toEqual(["D1"]);
    expect(january.risk.map((row) => row.shipmentId)).toEqual(["A"]);
    expect(january.prefatura.map((row) => row.shipmentId)).toEqual(["A"]);
  });

  it("reativa o motorista quando o mesmo ID volta em uma quinzena posterior", () => {
    const data = {
      hierarchy: [{ coordinator: "Gestor", supervisor: "Supervisor", sigla: "BASE", base: "Base", baseKey: "BASE" }],
      prefatura: [],
      pnr: [],
      risk: [
        { batchId: "jan", failureDate: "2026-01-05", baseKey: "BASE", sigla: "BASE", driverId: "D1", shipmentId: "A", gmvBrl: 20000 },
        { batchId: "feb", failureDate: "2026-01-20", baseKey: "BASE", sigla: "BASE", driverId: "D1", shipmentId: "B", gmvBrl: 100 },
      ],
      drivers: [{ driverId: "D1", name: "Motorista Reativado" }],
      imports: [],
      isDemo: false,
    } as unknown as DashboardData;

    const current = scopeData(data, EMPTY_FILTERS);
    expect(current.drivers.map((driver) => driver.driverId)).toEqual(["D1"]);
    expect(current.risk.map((row) => row.shipmentId)).toEqual(["A", "B"]);
  });

  it("usa o período do lote quando a linha não traz período ou data válida", () => {
    const data = {
      hierarchy: [{ coordinator: "Gestor", supervisor: "Supervisor", sigla: "SMG", base: "Base Julho", baseKey: "BASE JULHO" }],
      prefatura: [{ batchId: "pref", period: "02Q072026", routeDate: "2026-07-31", baseKey: "BASE JULHO", sigla: "SMG", driverName: "Motorista Julho", shipmentId: "PREF", value: 120 }],
      pnr: [],
      risk: [{ batchId: "risk", failureDate: null, baseKey: "BASE JULHO", sigla: "SMG", driverId: "D1", shipmentId: "RISK", gmvBrl: 300 }],
      drivers: [{ driverId: "D1", name: "Motorista Julho" }],
      imports: [
        { batchId: "pref", fortnight: "02Q072026", month: "2026-07", importedAt: "2026-08-15T20:00:00.000Z" },
        { batchId: "risk", fortnight: "02Q072026", month: "2026-07", importedAt: "2026-08-15T21:00:00.000Z" },
      ],
      isDemo: false,
    } as unknown as DashboardData;

    expect(filterOptions(data, EMPTY_FILTERS).months).toEqual(["2026-07"]);
    const current = scopeData(data, EMPTY_FILTERS);
    expect(current.prefatura.map((row) => row.shipmentId)).toEqual(["PREF"]);
    expect(current.risk.map((row) => row.shipmentId)).toEqual(["RISK"]);
  });
});

describe("quadro de decisão PNR", () => {
  it("calcula prioridade e ação sugerida por status operacional", () => {
    const rows = pnrDecisionRows([
      { status: "Aguardando comprovante", purchaseValue: 100 },
      { status: "Aguardando comprovante", purchaseValue: 50 },
      { status: "Anulado", purchaseValue: 25 },
    ] as never);
    expect(rows.find((row) => row.status === "Aguardando comprovante")).toMatchObject({
      cases: 2,
      value: 150,
      priority: "Alta",
      action: "Cobrar comprovante",
    });
    expect(rows.find((row) => row.status === "Anulado")?.percentage).toBeCloseTo(33.333, 2);
  });
});

describe("filtro por quinzena", () => {
  it("deriva a quinzena a partir da data quando a fonte não traz período explícito", () => {
    expect(fortnightFromDate("2026-08-15")).toBe("01Q082026");
    expect(fortnightFromDate("2026-08-16")).toBe("02Q082026");
  });

  it("normaliza códigos de quinzena importados", () => {
    expect(normalizeFortnight("1Q082026")).toBe("01Q082026");
    expect(normalizeFortnight("02Q082026")).toBe("02Q082026");
    expect(normalizeFortnight("202608Q1")).toBe("01Q082026");
    expect(normalizeFortnight("LOGISTICS_PNR - 202608Q2")).toBe("02Q082026");
    expect(monthFromFortnight("01Q082026")).toBe("2026-08");
  });
});
