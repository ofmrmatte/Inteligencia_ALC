import { describe, expect, it } from "vitest";
import {
  auditPnrClassification,
  normalizePnrBillingType,
  normalizePnrCancellationType,
  pnrClassificationFamily,
  pnrClassificationLabel,
} from "@/lib/pnr-classification";
import type { PnrRecord } from "@/lib/types";

function row(patch: Partial<PnrRecord>): PnrRecord {
  return {
    batchId: "b",
    sourceFile: "pnr.xlsx",
    sourceSheet: "PNR",
    rowNumber: 2,
    caseDate: "2026-08-12",
    status: "Enviados para faturamento",
    billingPeriod: "01Q082026",
    shipmentId: "1",
    products: "",
    purchaseValue: 100,
    carrier: "",
    originStation: "SMR1 - CUIABÁ",
    baseKey: "CUIABA",
    sigla: "SMR1",
    routeId: "",
    driverId: "",
    custom: "",
    billingType: "",
    cancellationType: "",
    classificationColumnsPresent: true,
    ...patch,
  };
}

describe("auditoria de classificação PNR", () => {
  it("padroniza aliases das classificações", () => {
    expect(normalizePnrBillingType("Automatica Meli")).toBe("AUTOMÁTICA MELI");
    expect(normalizePnrBillingType("MLP ALC Loss Dispatcher")).toBe("MLP ALC - LOSS/DISPATCHER");
    expect(normalizePnrCancellationType("Anulada Tony")).toBe("TONY");
  });

  it("classifica faturamento válido", () => {
    expect(auditPnrClassification(row({ billingType: "REVISADA MELI" }))).toBe("CLASSIFICADO");
  });

  it("classifica anulação válida", () => {
    expect(auditPnrClassification(row({ status: "Anulado", cancellationType: "TONY" }))).toBe("CLASSIFICADO");
  });

  it("marca ausência de tipo como pendência apenas quando as novas colunas existem", () => {
    expect(auditPnrClassification(row({}))).toBe("PENDENTE");
    expect(auditPnrClassification(row({ classificationColumnsPresent: false }))).toBe("NAO_APLICAVEL");
  });

  it("marca conflito entre as duas famílias como inconsistência", () => {
    expect(auditPnrClassification(row({ billingType: "REVISADA MELI", cancellationType: "TONY" }))).toBe("INCONSISTENTE");
  });

  it.each([
    ["BILLED", "reviewed", "FATURAMENTO", "REVISADA MELI"],
    ["BILLED", "not_reviewed", "FATURAMENTO", "AUTOMÁTICA MELI"],
    ["NOT_BILLED", "reviewed", "ANULAÇÃO", "REVISADA MELI"],
  ])("deriva a classificação comprovada do Case Center", (subStatus, reviewedStatus, family, label) => {
    const item = row({ sourceSystem: "case_center", classificationColumnsPresent: false, subStatus, reviewedStatus });
    expect(auditPnrClassification(item)).toBe("CLASSIFICADO");
    expect(pnrClassificationFamily(item)).toBe(family);
    expect(pnrClassificationLabel(item)).toBe(label);
  });

  it("mantém casos abertos e combinações não comprovadas como pendentes", () => {
    expect(auditPnrClassification(row({
      sourceSystem: "case_center",
      classificationColumnsPresent: false,
      mainStatus: "IN_PROGRESS",
      subStatus: "ON_REVIEW",
      reviewedStatus: "",
    }))).toBe("PENDENTE");
    expect(auditPnrClassification(row({
      sourceSystem: "case_center",
      classificationColumnsPresent: false,
      mainStatus: "CLOSED",
      subStatus: "NOT_BILLED",
      reviewedStatus: "not_reviewed",
    }))).toBe("PENDENTE");
  });
});
