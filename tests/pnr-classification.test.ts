import { describe, expect, it } from "vitest";
import {
  auditPnrClassification,
  derivePnrFinancialClassification,
  isLossDispatcherBilling,
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

  it("classifica o fluxo Loss/Dispatcher do caso homologado", () => {
    const events = [
      { eventType: "CREATE_CASE_BY_CONSUMER", dateCreated: "2026-06-19T21:59:42.000Z" },
      { eventType: "UPDATE_STATUS_TO_BILL", dateCreated: "2026-06-19T21:59:42.000Z" },
      { eventType: "NOT_ATTACHED_RECEIPT", dateCreated: "2026-06-26T18:21:52.000Z", actorName: "Marisa Guerreiro", actorUserId: "2044259" },
      { eventType: "UPDATE_STATUS_TO_CLOSED_BILLED", dateCreated: "2026-06-26T18:21:52.000Z" },
      { eventType: "UPDATE_CASE_BILLED", dateCreated: "2026-06-26T18:21:52.000Z" },
    ];
    const item = row({ caseId: "164038540", sourceSystem: "case_center", classificationColumnsPresent: false, subStatus: "BILLED", reviewedStatus: "not_reviewed", detailSyncStatus: "COMPLETE" });
    expect(isLossDispatcherBilling(item, events)).toBe(true);
    expect(derivePnrFinancialClassification(item, events)).toMatchObject({
      family: "FATURAMENTO",
      label: "MLP ALC - LOSS/DISPATCHER",
    });
  });

  it("aplica a precedência Loss/Dispatcher antes de automática", () => {
    const item = row({ sourceSystem: "case_center", classificationColumnsPresent: false, subStatus: "BILLED", reviewedStatus: "not_reviewed", detailSyncStatus: "COMPLETE" });
    const events = [{ eventType: "NOT_ATTACHED_RECEIPT", dateCreated: "2026-08-05T14:00:00.000Z", actorUserId: "2044259" }, { eventType: "UPDATE_STATUS_TO_CLOSED_BILLED", dateCreated: "2026-08-05T14:01:00.000Z" }];
    expect(derivePnrFinancialClassification(item, events).label).toBe("MLP ALC - LOSS/DISPATCHER");
  });

  it.each([
    ["BILLED", "reviewed", "FATURAMENTO", "REVISADA MELI"],
    ["NOT_BILLED", "reviewed", "ANULAÇÃO", "REVISADA MELI"],
    ["NOT_BILLED", "not_reviewed", "ANULAÇÃO", "TONY"],
    ["NOT_BILLED", "", "ANULAÇÃO", "TONY"],
  ])("deriva %s/%s do Case Center somente após timeline suficiente", (subStatus, reviewedStatus, family, label) => {
    const item = row({ sourceSystem: "case_center", classificationColumnsPresent: false, subStatus, reviewedStatus, detailSyncStatus: "COMPLETE" });
    const events = [{ eventType: "CREATE_CASE_BY_CONSUMER", dateCreated: "2026-08-05T14:00:00.000Z" }, { eventType: subStatus === "BILLED" ? "UPDATE_STATUS_TO_CLOSED_BILLED" : "UPDATE_STATUS_TO_CLOSED_NOT_BILLED", dateCreated: "2026-08-05T14:01:00.000Z" }];
    const derived = derivePnrFinancialClassification(item, events);
    expect(derived).toMatchObject({ family, label });
    const classified = row({ ...item, billingType: family === "FATURAMENTO" ? label : "", cancellationType: family === "ANULAÇÃO" ? label : "" });
    expect(auditPnrClassification(classified)).toBe("CLASSIFICADO");
    expect(pnrClassificationFamily(classified)).toBe(family);
    expect(pnrClassificationLabel(classified)).toBe(label);
  });

  it("classifica BILLED imediatamente e permite refinamento posterior pela timeline", () => {
    const item = row({ sourceSystem: "case_center", classificationColumnsPresent: false, subStatus: "BILLED", reviewedStatus: "not_reviewed", detailSyncStatus: "DETAIL_PENDING" });
    expect(derivePnrFinancialClassification(item, [])).toMatchObject({ audit: "CLASSIFICADO", label: "AUTOMÁTICA MELI" });
    expect(derivePnrFinancialClassification({ ...item, detailSyncStatus: "COMPLETE" }, [
      { eventType: "CREATE_CASE_BY_CONSUMER", dateCreated: "2026-08-05T14:00:00.000Z" },
      { eventType: "UPDATE_STATUS_TO_CLOSED_BILLED", dateCreated: "2026-08-05T14:01:00.000Z" },
    ])).toMatchObject({ audit: "CLASSIFICADO", label: "AUTOMÁTICA MELI" });
  });

  it("mantém casos abertos e combinações não comprovadas como pendentes", () => {
    expect(auditPnrClassification(row({
      sourceSystem: "case_center",
      classificationColumnsPresent: false,
      mainStatus: "IN_PROGRESS",
      subStatus: "ON_REVIEW",
      reviewedStatus: "",
      detailSyncStatus: "DETAIL_PENDING",
    }))).toBe("PENDENTE");
    expect(auditPnrClassification(row({
      sourceSystem: "case_center",
      classificationColumnsPresent: false,
      mainStatus: "CLOSED",
      subStatus: "NOT_BILLED",
      reviewedStatus: "not_reviewed",
    }))).toBe("CLASSIFICADO");
  });

  it("classifica os três cenários homologados sem depender de IDs de caso", () => {
    const reviewEvent = [{ eventType: "UPDATE_STATUS_TO_ON_REVIEW", dateCreated: "2026-09-16T19:28:00.000Z" }];
    expect(derivePnrFinancialClassification(row({
      sourceSystem: "case_center",
      classificationColumnsPresent: false,
      subStatus: "BILLED",
      reviewedStatus: "reviewed",
      detailSyncStatus: "COMPLETE",
    }), reviewEvent)).toMatchObject({ family: "FATURAMENTO", label: "REVISADA MELI" });
    expect(derivePnrFinancialClassification(row({
      sourceSystem: "case_center",
      classificationColumnsPresent: false,
      subStatus: "NOT_BILLED",
      reviewedStatus: "reviewed",
      detailSyncStatus: "COMPLETE",
    }), reviewEvent)).toMatchObject({ family: "ANULAÇÃO", label: "REVISADA MELI" });
    expect(derivePnrFinancialClassification(row({
      sourceSystem: "case_center",
      classificationColumnsPresent: false,
      mainStatus: "NEW",
      subStatus: "WAITING_RECEIPT",
      reviewedStatus: "",
      detailSyncStatus: "COMPLETE",
    }), [{ eventType: "CREATE_CASE_BY_CONSUMER", dateCreated: "2026-09-17T20:36:00.000Z" }])).toMatchObject({ audit: "PENDENTE", label: "" });
  });
});
