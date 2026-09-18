import { describe, expect, it } from "vitest";
import { caseCenterImportSchema, mergeCaseCenterCase } from "@/lib/pnr-case-center-import";
import {
  CASE_CENTER_TIMELINE_PARSER_VERSION,
  caseCenterEventLabel,
  getCaseCenterDisplayStatus,
  chunkCaseCenterRecords,
  dedupeCaseCenterCases,
  dedupeCaseTimelineEvents,
  parseCaseCenterCompetence,
  runCaseCenterPagination,
  type CaseCenterPage,
  type NormalizedCaseCenterPnrCase,
} from "@/lib/pnr-case-center";
import { connectorStatusFromCode, PnrConnectorError, requestPnrConnector } from "@/lib/pnr-connector-client";

const record: NormalizedCaseCenterPnrCase = {
  caseId: "169432521",
  caseDate: "2026-08-04T12:00:00.000Z",
  routeCode: "R-10",
  routeId: "9001",
  originStation: "SP01",
  driverName: "Motorista Teste",
  shipmentId: "200000001",
  purchaseValue: 149.9,
  currency: "BRL",
  mainStatus: "CLOSED",
  subStatus: "BILLED",
  reviewedStatus: "reviewed",
  caseType: "PNR_CLAIM",
  routeStatus: "finished",
  priority: "normal",
};

function page(pageNumber: number, totalPages: number, records = [record]): CaseCenterPage {
  return { page: pageNumber, totalPages, totalElements: 31, records, invalidCount: 0 };
}

describe("Case Center PNR", () => {
  it("converte Q1 e Q2 para os limites exatos da competência", () => {
    expect(parseCaseCenterCompetence("202608Q1")).toMatchObject({
      fortnight: "01Q082026",
      dateFrom: "2026-08-01T00:00:00.000Z",
      dateTo: "2026-08-15T23:59:59.999Z",
    });
    expect(parseCaseCenterCompetence("202608Q2")).toMatchObject({
      fortnight: "02Q082026",
      dateFrom: "2026-08-16T00:00:00.000Z",
      dateTo: "2026-08-31T23:59:59.999Z",
    });
  });

  it("mantém casos distintos do mesmo pacote e deduplica apenas case_id", () => {
    const records = dedupeCaseCenterCases([
      record,
      { ...record, caseId: "169432522" },
      { ...record, reviewedStatus: "not_reviewed" },
    ]);
    expect(records).toHaveLength(2);
    expect(records.find((item) => item.caseId === record.caseId)?.reviewedStatus).toBe("not_reviewed");
  });

  it("deduplica eventos da timeline antes do upsert pela chave event_id", () => {
    const events = dedupeCaseTimelineEvents([
      { eventId: "10", eventType: "CREATE_CASE_BY_CONSUMER", dateCreated: "2026-08-05T14:00:00.000Z", actorName: "Operação" },
      { eventId: "10", eventType: "CREATE_CASE_BY_CONSUMER", dateCreated: "2026-08-05T14:00:00.000Z", actorName: "Operação atualizada" },
    ]);
    expect(events).toEqual([
      { eventId: "10", eventType: "CREATE_CASE_BY_CONSUMER", dateCreated: "2026-08-05T14:00:00.000Z", actorName: "Operação atualizada" },
    ]);
  });

  it("traduz estados conhecidos e usa fallback legível sem vazar enum", () => {
    expect(getCaseCenterDisplayStatus({ mainStatus: "NEW", subStatus: "TO_BILL" })).toMatchObject({
      label: "Com penalidade",
      terminal: false,
    });
    expect(getCaseCenterDisplayStatus({ mainStatus: "IN_PROGRESS", subStatus: "ON_REVIEW" }).label).toBe("Em revisão");
    expect(getCaseCenterDisplayStatus({ mainStatus: "NEW", subStatus: "WAITING_RECEIPT" }).label).toBe("Aguardando comprovante");
    expect(getCaseCenterDisplayStatus({ mainStatus: "UNKNOWN_TECHNICAL_STATE", subStatus: "" }).label).toBe("Status não reconhecido");
  });

  it("traduz eventos reais sem expor enums técnicos", () => {
    expect(caseCenterEventLabel("ATTACHED_RECEIPT", "Nataly")).toBe("Nataly carregou comprovante.");
    expect(caseCenterEventLabel("NOT_ATTACHED_RECEIPT", "Marisa")).toBe("Marisa não carregou comprovante.");
    expect(caseCenterEventLabel("UPDATE_STATUS_TO_ON_REVIEW")).toBe("Foi solicitada uma revisão do caso.");
    expect(caseCenterEventLabel("UPDATE_STATUS_TO_CLOSED_NOT_BILLED")).toBe("O caso foi encerrado pelo cliente e anulado.");
    expect(caseCenterEventLabel("UPDATE_STATUS_TO_CLOSED_NOT_BILLED", "", "reviewed")).toBe("O caso foi revisado e anulado.");
    expect(caseCenterEventLabel("UNMAPPED_EVENT")).toBe("Atualização do caso.");
  });

  it("divide a ingestão sem perder registros", () => {
    const chunks = chunkCaseCenterRecords(Array.from({ length: 601 }, (_, index) => index), 200);
    expect(chunks.map((item) => item.length)).toEqual([200, 200, 200, 1]);
  });

  it("preserva campos vazios e a primeira captura ao atualizar o estado durável", () => {
    const result = mergeCaseCenterCase({
      shipment_id: record.shipmentId,
      competence: "202608Q1",
      case_date: "2026-08-04",
      route_id: record.routeId,
      route_code: record.routeCode,
      svc_name: record.originStation,
      driver_name: record.driverName,
      purchase_value: 149.9,
      currency: "BRL",
      main_status: record.mainStatus,
      sub_status: record.subStatus,
      reviewed_status: record.reviewedStatus,
      case_type: record.caseType,
      route_status: record.routeStatus,
      priority: record.priority,
      raw_snapshot_jsonb: {
        timelineParserVersion: CASE_CENTER_TIMELINE_PARSER_VERSION,
        detailSnapshot: { buyerName: "Comprador preservado", routeId: "9001" },
      },
      claim_id: "CLAIM-1",
      detail_sync_status: "COMPLETE",
      case_capture_status: "COMPLETE",
      first_captured_at: "2026-08-05T00:00:00.000Z",
    }, { ...record, driverName: "", purchaseValue: 0 }, {
      batchId: "13ee00e7-c683-443d-bdec-3a6f393fd452",
      competence: "202608Q1",
      capturedAt: "2026-09-17T12:00:00.000Z",
    });

    expect(result.row.driver_name).toBe("Motorista Teste");
    expect(result.row.claim_id).toBe("CLAIM-1");
    expect(result.row.purchase_value).toBe(0);
    expect(result.row.first_captured_at).toBe("2026-08-05T00:00:00.000Z");
    expect(result.row.raw_snapshot_jsonb).toMatchObject({
      detailSnapshot: { buyerName: "Comprador preservado", routeId: "9001" },
    });
    expect(result.row.detail_sync_status).toBe("DETAIL_PENDING");
    expect(result.change).toBe("updated");
    expect(mergeCaseCenterCase(result.row, { ...record, driverName: "", purchaseValue: 0 }, {
      batchId: "13ee00e7-c683-443d-bdec-3a6f393fd452",
      competence: "202608Q1",
      capturedAt: "2026-09-18T12:00:00.000Z",
    }).change).toBe("unchanged");
  });

  it("marca timeline antiga ou estado alterado para reprocessamento", () => {
    const context = {
      batchId: "13ee00e7-c683-443d-bdec-3a6f393fd452",
      competence: "202608Q1",
      capturedAt: "2026-09-18T12:00:00.000Z",
    };
    const existing = {
      shipment_id: record.shipmentId,
      main_status: record.mainStatus,
      sub_status: record.subStatus,
      reviewed_status: record.reviewedStatus,
      detail_sync_status: "COMPLETE",
      raw_snapshot_jsonb: { timelineParserVersion: CASE_CENTER_TIMELINE_PARSER_VERSION - 1 },
    };

    expect(mergeCaseCenterCase(existing, record, context).row.detail_sync_status).toBe("DETAIL_PENDING");
    expect(mergeCaseCenterCase({
      ...existing,
      raw_snapshot_jsonb: { timelineParserVersion: CASE_CENTER_TIMELINE_PARSER_VERSION },
    }, { ...record, subStatus: "NOT_BILLED" }, context).row.detail_sync_status).toBe("DETAIL_PENDING");
  });

  it("rejeita credenciais e campos fora do contrato normalizado", () => {
    expect(caseCenterImportSchema.safeParse({
      syncId: "13ee00e7-c683-443d-bdec-3a6f393fd452",
      competence: "202608Q1",
      page: 1,
      totalPages: 1,
      totalElements: 1,
      completed: true,
      processed: 1,
      errorCount: 0,
      records: [{ ...record, cookie: "não deve entrar" }],
      token: "não deve entrar",
    }).success).toBe(false);
  });

  it("continua após uma página sem registros válidos e conclui a paginação", async () => {
    const persisted: number[] = [];
    const result = await runCaseCenterPagination({
      delayMs: 0,
      fetchPage: async (current) => current === 1
        ? { ...page(1, 2, []), invalidCount: 30 }
        : page(2, 2),
      persistPage: async (current) => { persisted.push(current.page); },
    });
    expect(result.completed).toBe(true);
    expect(persisted).toEqual([1, 2]);
  });

  it("repete falha transitória e preserva retomada ao cancelar", async () => {
    let attempts = 0;
    let cancelled = false;
    const result = await runCaseCenterPagination({
      delayMs: 0,
      fetchPage: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("HTTP 503");
        return page(1, 2);
      },
      persistPage: async () => { cancelled = true; },
      isCancelled: () => cancelled,
    });
    expect(attempts).toBe(2);
    expect(result).toMatchObject({ completed: false, cancelled: true, nextPage: 2 });
  });

  it("retoma da página e contagem já persistidas", async () => {
    const fetched: number[] = [];
    const result = await runCaseCenterPagination({
      startPage: 2,
      initialProcessed: 30,
      initialErrors: 2,
      delayMs: 0,
      fetchPage: async (current) => {
        fetched.push(current);
        return { ...page(current, 2), totalElements: 31 };
      },
      persistPage: async () => undefined,
    });
    expect(fetched).toEqual([2]);
    expect(result).toMatchObject({ completed: true, processed: 31, errors: 2 });
  });

  it("falha de forma explícita quando a extensão não existe", async () => {
    await expect(requestPnrConnector("PING")).rejects.toEqual(expect.objectContaining({
      code: "EXTENSION_NOT_FOUND",
    }));
  });

  it("distingue sessão expirada de erro HTTP", () => {
    expect(connectorStatusFromCode("MERCADO_LIVRE_SESSION_REQUIRED")).toBe("Sessão Mercado Livre expirada");
    expect(new PnrConnectorError("HTTP_ERROR", "Case Center respondeu HTTP 503.")).toMatchObject({
      code: "HTTP_ERROR",
      message: "Case Center respondeu HTTP 503.",
    });
  });
});
