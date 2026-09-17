import { describe, expect, it } from "vitest";
import { normalizeCaseCenterPage, parseCaseTimelineHtml, periodDetails } from "../extension-pnr/src/case-center.js";

function casePayload() {
  const fields = [
    ["case.date_created", "2026-08-04T12:00:00.000Z"],
    ["case.route_code", "R-10"],
    ["case.route_id", "9001"],
    ["case.svc_name", "SP01"],
    ["case.driver_name", "Motorista Teste"],
    ["case.shipment_id", "200000001"],
    ["case.shipment_amount", { amount: 149.9, currency: "BRL" }],
    ["case.state", { status: "CLOSED", sub_status: "BILLED" }],
    ["case.reviewed_status", "reviewed"],
    ["case.type", "PNR_CLAIM"],
    ["case.route_status", "finished"],
  ];
  return {
    case_id: 169432521,
    priority: "normal",
    cells: [{ lines: [fields.map(([key, value]) => ({ key, value }))] }],
  };
}

describe("normalizador da extensão PNR", () => {
  it("normaliza a listagem sem transportar sessão ou headers", () => {
    const normalized = normalizeCaseCenterPage({
      casesList: [casePayload()],
      paging: { totalPages: 1, totalElements: 1 },
      cookie: "ignorado",
    }, 1);
    expect(normalized.records[0]).toMatchObject({
      caseId: "169432521",
      shipmentId: "200000001",
      purchaseValue: 149.9,
      subStatus: "BILLED",
      reviewedStatus: "reviewed",
    });
    expect(normalized.records[0]).not.toHaveProperty("cookie");
  });

  it("preserva os enums NOT_BILLED e not_reviewed", () => {
    const payload = casePayload();
    const fields = payload.cells[0].lines[0];
    fields.find((field) => field.key === "case.state").value = { status: "CLOSED", sub_status: "NOT_BILLED" };
    fields.find((field) => field.key === "case.reviewed_status").value = "not_reviewed";
    expect(normalizeCaseCenterPage({ casesList: [payload], paging: { totalPages: 1, totalElements: 1 } }, 1).records[0]).toMatchObject({
      subStatus: "NOT_BILLED",
      reviewedStatus: "not_reviewed",
    });
  });

  it("extrai eventos do estado SSR e rejeita HTML sem marcador", () => {
    const state = {
      appProps: { pageProps: { preloadedStore: { CaseDetail: { events: [{
        id: 10,
        event_type: "UPDATE_STATUS_TO_BILL",
        date_created: "2026-08-05T14:00:00.000Z",
        created_by: { name: "Operação" },
      }] } } } },
    };
    const html = `<script>_n.ctx.r=${JSON.stringify(state)};_n.ctx.r.assets=[]</script>`;
    expect(parseCaseTimelineHtml(html)[0]).toMatchObject({ eventId: "10", label: "O caso foi revisado e alterado para o status Com penalidade." });
    expect(() => parseCaseTimelineHtml("<html></html>")).toThrow("não encontrado");
  });

  it("preserva e ordena todos os eventos quando o Case Center repete id zero", () => {
    const events = [
      ["CREATE_CASE_BY_CONSUMER", "2026-09-14T11:48:51Z"],
      ["ATTACHED_RECEIPT", "2026-09-14T22:25:12Z"],
      ["UPDATE_STATUS_TO_ON_REVIEW", "2026-09-17T01:05:46Z"],
      ["UPDATE_STATUS_TO_CLOSED_BILLED", "2026-09-17T01:06:27Z"],
      ["UPDATE_CASE_BILLED", "2026-09-17T01:06:27Z"],
    ].map(([event_type, date_created]) => ({ id: 0, event_type, date_created }));
    const state = { appProps: { pageProps: { preloadedStore: { CaseDetail: { events: events.toReversed() } } } } };
    const html = `<script>_n.ctx.r=${JSON.stringify(state)};_n.ctx.r.assets=[]</script>`;
    const normalized = parseCaseTimelineHtml(html);

    expect(normalized).toHaveLength(5);
    expect(new Set(normalized.map((event) => event.eventId)).size).toBe(5);
    expect(normalized.map((event) => event.dateCreated)).toEqual(normalized.map((event) => event.dateCreated).toSorted());
    expect(new Set(normalized.map((event) => event.eventType))).toEqual(new Set(events.map((event) => event.event_type)));
  });

  it("gera o período Q2 até o último dia do mês", () => {
    expect(periodDetails("202608Q2")).toEqual({
      period: "202608Q2",
      dateFrom: "2026-08-16T00:00:00.000Z",
      dateTo: "2026-08-31T23:59:59.999Z",
    });
  });
});
