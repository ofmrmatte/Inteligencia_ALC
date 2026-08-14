import { describe, expect, it } from "vitest";
import { duplicateGroups, fortnightFromDate, monthFromFortnight, normalizeFortnight, reconciliation, sumByUniqueShipment, uniqueByShipment } from "@/lib/metrics";
import type { ScopedData } from "@/lib/metrics";

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
