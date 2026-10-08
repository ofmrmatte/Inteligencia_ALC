import { describe, expect, it } from "vitest";
import { DriverIdentityResolver } from "@/lib/driver-identity-resolver";
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
    expect(result.qualityStatus).toBe("resolved");
    expect(result.driverIdSource).toBe("direct");
    expect(result.baseSource).toBe("driver_database");
  });

  it("preenche por nome somente quando o cadastro é único", () => {
    const [unique, duplicated] = enrichPrefaturaRows([
      row({ shipmentId: "SHIP2", driverName: "carlos santos" }),
      row({ shipmentId: "SHIP3", driverName: "Nome Repetido" }),
    ], { drivers, history: [] });
    expect(unique.driverId).toBe("456");
    expect(unique.baseKey).toBe("SMG5");
    expect(duplicated.driverId).toBe("");
    expect(duplicated.qualityStatus).toBe("needs_review");
  });

  it("usa route_id único quando o cadastro não resolve", () => {
    const [result] = enrichPrefaturaRows([row({ routeId: "R4" })], {
      drivers: [{ driverId: "999", name: "Histórico Seguro", baseKey: "BASE HIST", baseName: "BASE HIST", sigla: "HIS" }],
      history: [],
      operationalEvidence: [{ driverId: "999", routeId: "R4", source: "pnr_records", baseKey: "BASE HIST", sigla: "HIS" }],
    });
    expect(result.driverId).toBe("999");
    expect(result.baseKey).toBe("BASE HIST");
    expect(result.driverIdSource).toBe("route_id_unique");
    expect(result.qualityStatus).toBe("resolved");
  });

  it("usa shipment único quando não há match por rota", () => {
    const [result] = enrichPrefaturaRows([row({ shipmentId: "SHIP4", routeId: "" })], {
      drivers: [{ driverId: "999", name: "Histórico Seguro", baseKey: "BASE HIST", baseName: "BASE HIST", sigla: "HIS" }],
      history: [],
      operationalEvidence: [{ driverId: "999", shipmentId: "SHIP4", source: "risk_lm_records", baseKey: "BASE HIST", sigla: "HIS" }],
    });
    expect(result.driverId).toBe("999");
    expect(result.driverIdSource).toBe("shipment_id");
  });

  it("mantém pendente quando não há fonte confiável", () => {
    const [result] = enrichPrefaturaRows([row({ shipmentId: "SHIP5" })], { drivers: [], history: [] });
    expect(result.qualityStatus).toBe("needs_review");
    expect(result.baseKey).toBe("");
  });

  it("não transforma nome numérico em driver_id", () => {
    const [result] = enrichPrefaturaRows([row({ driverName: "1013625" })], { drivers: [], history: [] });
    expect(result.driverId).toBe("");
    expect(result.qualityStatus).toBe("needs_review");
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
      quality_status: "resolved",
    });
    expect(patch).not.toHaveProperty("driver_name");
  });
});

describe("DriverIdentityResolver", () => {
  const resolver = new DriverIdentityResolver({
    drivers: [
      { driverId: "123", name: "João da Silva", baseKey: "RAO01", sigla: "RAO" },
      { driverId: "456", name: "Carlos Santos", baseKey: "SMG5", sigla: "SMG5" },
      { driverId: "777", name: "Nome Igual", baseKey: "A", sigla: "A" },
      { driverId: "778", name: "Nome Igual", baseKey: "B", sigla: "B" },
    ],
    operationalEvidence: [
      { driverId: "456", routeId: "R456", shipmentId: "S456", source: "pnr_records", baseKey: "SMG5", sigla: "SMG5" },
      { driverId: "777", routeId: "R777", source: "risk_lm_records", baseKey: "A", sigla: "A" },
      { driverId: "778", routeId: "R778", source: "risk_lm_records", baseKey: "B", sigla: "B" },
      { driverId: "777", routeId: "RMULTI", source: "pnr_records" },
      { driverId: "778", routeId: "RMULTI", source: "risk_lm_records" },
    ],
  });

  it("nome exato único resolve", () => {
    const result = resolver.resolveDriverIdentity({ driverName: "joao da silva" });
    expect(result.driverId).toBe("123");
    expect(result.matchedBy).toBe("driver_records_name_exact");
    expect(result.canAutoApply).toBe(true);
  });

  it("mesmo nome com dois IDs não resolve sem evidência inequívoca", () => {
    const result = resolver.resolveDriverIdentity({ driverName: "Nome Igual" });
    expect(result.driverId).toBeNull();
    expect(result.canAutoApply).toBe(false);
  });

  it("nome ambíguo mais rota coerente resolve", () => {
    const result = resolver.resolveDriverIdentity({ driverName: "Nome Igual", routeId: "R777", baseKey: "A" });
    expect(result.driverId).toBe("777");
    expect(result.canAutoApply).toBe(true);
  });

  it("nome e rota conflitantes geram conflict", () => {
    const result = resolver.resolveDriverIdentity({ driverName: "Carlos Santos", routeId: "R777" });
    expect(result.qualityStatus).toBe("conflict");
    expect(result.canAutoApply).toBe(false);
  });

  it("route_id com vários drivers não resolve", () => {
    const result = resolver.resolveDriverIdentity({ routeId: "RMULTI" });
    expect(result.driverId).toBeNull();
    expect(result.canAutoApply).toBe(false);
  });

  it("driver_id existente é preservado", () => {
    const result = resolver.resolveDriverIdentity({ driverId: "123", driverName: "Outro Nome" });
    expect(result.driverId).toBe("123");
    expect(result.matchedBy).toBe("direct");
  });
});
