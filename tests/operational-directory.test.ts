import { describe, expect, it } from "vitest";
import { applyOperationalDirectory, type OperationalDirectoryPayload } from "@/lib/operational-directory";
import type { DashboardData } from "@/lib/types";

const baseData = {
  hierarchy: [],
  prefatura: [],
  pnr: [],
  risk: [],
  drivers: [],
  imports: [],
  isDemo: false,
} as DashboardData;

const payload: OperationalDirectoryPayload = {
  units: [
    { unitKey: "SMG5|GUAXUPE", sigla: "SMG5", baseName: "GUAXUPÉ", baseKey: "GUAXUPE", xptCode: "EMG7", coordinator: "BRUNO HUNGRIA", supervisors: ["SUP A"], active: true },
    { unitKey: "SMG5|POCOS DE CALDAS", sigla: "SMG5", baseName: "POÇOS DE CALDAS", baseKey: "POCOS DE CALDAS", xptCode: "EMG7", coordinator: "BRUNO HUNGRIA", supervisors: ["SUP B"], active: true },
    { unitKey: "SSP28|JALES", sigla: "SSP28", baseName: "JALES", baseKey: "JALES", xptCode: "EPR7", coordinator: "VIVIANE PANSANI", supervisors: ["SUP C"], active: true },
  ],
  driverMappings: [
    { driverId: "123", unitKey: "SMG5|GUAXUPE" },
    { driverId: "321", unitKey: "SSP28|JALES" },
  ],
  ambiguousSiglas: ["SMG5"],
  ambiguousBaseKeys: [],
  fullAccess: false,
};

describe("cadastro mestre de unidades operacionais", () => {
  it("usa o ID do motorista para resolver uma SVC que possui mais de uma base", () => {
    const data = {
      ...baseData,
      pnr: [{
        batchId: "b1", sourceFile: "pnr.csv", sourceSheet: "Sheet1", rowNumber: 2,
        caseDate: "2026-08-17", status: "Em revisão", billingPeriod: "02Q082026",
        shipmentId: "PKG1", products: "", purchaseValue: 55, carrier: "",
        originStation: "SMG5", baseKey: "SMG5", sigla: "SMG5", routeId: "R1", driverId: "123", custom: "",
      }],
    } as DashboardData;

    const result = applyOperationalDirectory(data, payload);
    expect(result.pnr).toHaveLength(1);
    expect(result.pnr[0]).toMatchObject({
      unitKey: "SMG5|GUAXUPE",
      sigla: "SMG5",
      baseKey: "GUAXUPE",
      baseName: "GUAXUPÉ",
      originStation: "SMG5 - GUAXUPÉ",
      xptCode: "EMG7",
    });
  });

  it("não adivinha a base quando a SVC é ambígua e não há evidência do motorista", () => {
    const data = {
      ...baseData,
      pnr: [{
        batchId: "b1", sourceFile: "pnr.csv", sourceSheet: "Sheet1", rowNumber: 2,
        caseDate: "2026-08-17", status: "Em revisão", billingPeriod: "02Q082026",
        shipmentId: "PKG2", products: "", purchaseValue: 55, carrier: "",
        originStation: "SMG5", baseKey: "SMG5", sigla: "SMG5", routeId: "R2", driverId: "999", custom: "",
      }],
    } as DashboardData;

    const result = applyOperationalDirectory(data, payload);
    expect(result.pnr).toHaveLength(0);
  });

  it("nunca troca uma estação informada por outra SVC apenas pelo histórico do motorista", () => {
    const data = {
      ...baseData,
      pnr: [{
        batchId: "b1", sourceFile: "pnr.csv", sourceSheet: "Sheet1", rowNumber: 2,
        caseDate: "2026-08-17", status: "Em revisão", billingPeriod: "02Q082026",
        shipmentId: "PKG3", products: "", purchaseValue: 55, carrier: "",
        originStation: "SMS1", baseKey: "SMS1", sigla: "SMS1", routeId: "R3", driverId: "321", custom: "",
      }],
    } as DashboardData;

    const result = applyOperationalDirectory(data, { ...payload, fullAccess: true });
    expect(result.pnr).toHaveLength(1);
    expect(result.pnr[0]).toMatchObject({ originStation: "SMS1", sigla: "SMS1", baseKey: "SMS1" });
    expect(result.pnr[0].unitKey).toBeUndefined();
  });

  it("substitui a hierarquia importada pelo cadastro oficial de coordenadores e supervisores", () => {
    const result = applyOperationalDirectory(baseData, { ...payload, fullAccess: true });
    expect(result.hierarchy).toEqual(expect.arrayContaining([
      expect.objectContaining({ coordinator: "BRUNO HUNGRIA", supervisor: "SUP A", sigla: "SMG5", base: "GUAXUPÉ", xptCode: "EMG7" }),
      expect.objectContaining({ coordinator: "BRUNO HUNGRIA", supervisor: "SUP B", sigla: "SMG5", base: "POÇOS DE CALDAS", xptCode: "EMG7" }),
    ]));
  });
});
