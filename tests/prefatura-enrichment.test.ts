import { describe, expect, it } from "vitest";
import { enrichPrefaturaRows, prefaturaMergePatch, type DriverMasterRecord, type PrefaturaHistoryRecord } from "@/lib/prefatura-enrichment";
import type { PrefaturaRecord } from "@/lib/types";

const drivers: DriverMasterRecord[] = [
  { driverId: "123", name: "João da Silva", baseKey: "RAO01", baseName: "Ribeirão", sigla: "RAO" },
  { driverId: "456", name: "Carlos Santos", baseKey: "SMG5", baseName: "Guaxupé", sigla: "SMG5" },
  { driverId: "789", name: "Nome Repetido", baseKey: "BASE A", baseName: "Base A", sigla: "A" },
  { driverId: "790", name: "Nome Repetido", baseKey: "BASE B", baseName: "Base B", sigla: "B" },
];

function row(overrides: Partial<PrefaturaRecord>): PrefaturaRecord {
  return {
    batchId: "new",
    sourceFile: "prefatura.xlsx",
    sourceSheet: "SVC",
    rowNumber: 2,
    period: "01Q072026",
    baseLabel: "",
    baseName: "",
    baseKey: "",
    sigla: "",
    driverId: "",
    driverName: "",
    plate: "",
    description: "",
    routeDate: "2026-07-05",
    shipmentId: "SHIP1",
    routeId: "ROUTE1",
    value: 100,
    operation: "SVC",
    ...overrides,
  };
}

describe("enriquecimento da pré-fatura", () => {
  it("preenche nome e base pelo ID do motorista", () => {
    const [result] = enrichPrefaturaRows([row({ driverId: "123" })], { drivers, history: [] });
    expect(result.driverName).toBe("João da Silva");
    expect(result.baseKey).toBe("RAO01");
    expect(result.qualityStatus).toBe("ENRICHED");
    expect(result.driverIdSource).toBe("UPLOAD");
    expect(result.baseSource).toBe("DRIVER_MASTER");
  });

  it("preenche por nome somente quando o cadastro é único", () => {
    const [unique, duplicated] = enrichPrefaturaRows([
      row({ shipmentId: "SHIP2", driverName: "carlos santos" }),
      row({ shipmentId: "SHIP3", driverName: "Nome Repetido" }),
    ], { drivers, history: [] });
    expect(unique.driverId).toBe("456");
    expect(unique.baseKey).toBe("SMG5");
    expect(duplicated.driverId).toBe("");
    expect(duplicated.qualityStatus).toBe("PENDING");
  });

  it("usa histórico determinístico por shipment quando o cadastro não resolve", () => {
    const history: PrefaturaHistoryRecord[] = [{
      id: "old",
      shipmentId: "SHIP4",
      routeId: "R4",
      period: "01Q062026",
      routeDate: "2026-06-01",
      operation: "SVC",
      driverId: "999",
      driverName: "Histórico Seguro",
      baseLabel: "BASE HIST - HIS",
      baseName: "BASE HIST",
      baseKey: "BASE HIST",
      sigla: "HIS",
    }];
    const [result] = enrichPrefaturaRows([row({ shipmentId: "SHIP4" })], { drivers: [], history });
    expect(result.driverId).toBe("999");
    expect(result.baseKey).toBe("BASE HIST");
    expect(result.qualityStatus).toBe("ENRICHED");
  });

  it("mantém pendente quando não há fonte confiável", () => {
    const [result] = enrichPrefaturaRows([row({ shipmentId: "SHIP5" })], { drivers: [], history: [] });
    expect(result.qualityStatus).toBe("PENDING");
    expect(result.baseKey).toBe("");
  });

  it("monta patch de reupload só para campos vazios", () => {
    const existing: PrefaturaHistoryRecord = {
      id: "old",
      shipmentId: "SHIP6",
      routeId: "",
      period: "01Q072026",
      routeDate: null,
      operation: "SVC",
      driverId: "",
      driverName: "Carlos Santos",
      baseLabel: "",
      baseName: "",
      baseKey: "",
      sigla: "",
    };
    const patch = prefaturaMergePatch(existing, row({
      shipmentId: "SHIP6",
      driverId: "456",
      driverName: "",
      baseLabel: "GUAXUPÉ - SMG5",
      baseName: "GUAXUPÉ",
      baseKey: "GUAXUPE",
      sigla: "SMG5",
    }));
    expect(patch).toMatchObject({
      driver_id: "456",
      base_key: "GUAXUPE",
      quality_status: "UPDATED",
    });
    expect(patch).not.toHaveProperty("driver_name");
  });
});
