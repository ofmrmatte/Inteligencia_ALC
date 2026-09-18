import { beforeAll, describe, expect, it, vi } from "vitest";

let onMessage;
let fetchMock;
const renderingContext = {
  appProps: {
    pageProps: {
      preloadedStore: {
        RootReducer: { operator: { carrierData: { id: 2087146923 } } },
      },
    },
  },
};

beforeAll(async () => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ casesList: [], paging: { totalPages: 0, totalElements: 0 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { href: "https://envios.adminml.com/logistics/case-center/cases" });
  vi.stubGlobal("document", {
    getElementById: (id) => id === "__NORDIC_RENDERING_CTX__"
      ? { textContent: `_n.ctx.r=${JSON.stringify(renderingContext)};_n.ctx.r.assets=[]` }
      : null,
    querySelector: () => null,
  });
  vi.stubGlobal("chrome", {
    runtime: {
      getManifest: () => ({ version: "1.1.12" }),
      onMessage: { addListener: (listener) => { onMessage = listener; } },
      onInstalled: { addListener: () => undefined },
    },
    tabs: { query: async () => [{ id: 7 }] },
    scripting: {
      executeScript: async ({ func, args }) => [{ result: await func(...args) }],
    },
  });
  await import("../extension-pnr/src/service-worker.js");
});

describe("conector PNR na página atual do Mercado Livre", () => {
  it("lê o estado Nordic e aplica a competência enviada pelo painel", async () => {
    const response = await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "FETCH_PAGE", payload: { competence: "202608Q2", page: 1 } },
      { url: "http://localhost:3000/bandeja-pnr" },
      resolve,
    ));

    expect(response).toMatchObject({ ok: true, data: { page: 1, totalPages: 0, totalElements: 0 } });
    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(request.body);
    expect(body.data).toBeUndefined();
    expect(body).toMatchObject({ userType: "3PL", application: "LOGISTICS_PNR" });
    const searchParams = JSON.parse(body.searchParams);
    expect(searchParams).toMatchObject({
      carrier: "2087146923",
      period: "202608Q2",
      date_from: "2026-08-16T00:00:00.000Z",
      date_to: "2026-08-31T23:59:59.999Z",
    });
  });

  it("preserva a mensagem de validação do Case Center", async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({
      message: "Invalid values in body object.",
      cause: [{ message: "size must not be greater than 20" }],
    }), {
      status: 422,
      headers: { "content-type": "application/json" },
    }));

    const response = await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "FETCH_PAGE", payload: { competence: "202608Q2", page: 1 } },
      { url: "http://localhost:3000/bandeja-pnr" },
      resolve,
    ));

    expect(response).toMatchObject({
      ok: false,
      error: { code: "HTTP_ERROR", message: "Case Center respondeu HTTP 422: size must not be greater than 20" },
    });
  });

  it("informa a quantidade de eventos SSR sem perder IDs repetidos", async () => {
    const events = [
      { id: 0, event_type: "CREATE_CASE_BY_CONSUMER", date_created: "2026-09-14T11:48:51Z" },
      { id: 0, event_type: "ATTACHED_RECEIPT", date_created: "2026-09-14T22:25:12Z", created_by: { name: "Nataly" } },
      { id: 0, event_type: "UPDATE_STATUS_TO_ON_REVIEW", date_created: "2026-09-15T10:00:00Z", created_by: { name: "Analista" } },
      { id: 0, event_type: "UPDATE_STATUS_TO_CLOSED_BILLED", date_created: "2026-09-15T11:00:00Z" },
    ];
    const state = { appProps: { pageProps: { preloadedStore: { CaseDetail: {
      events,
      notes: [{ message: "Comprovante válido", date_created: "2026-09-15T10:00:00Z", files: [{ name: "evidencia.png" }] }],
      caseDetail: {
        reviewed_status: "reviewed",
        preInvoiceNumber: "7324513",
        billingPeriod: "202609Q2",
        references: [{ type: "DRIVER_ID", value: "123" }, { type: "ROUTE_ID", value: "4419214733" }],
        cards: [
          { label: "Nombre del reclamante", value: "Comprador Teste" },
          { label: "Nome completo", value: "Recebedor Teste" },
          { label: "Documento", value: "123456" },
          { label: "Transportadora", value: "ALC TRANSPORTES" },
          { label: "Telefone", value: "31999999999" },
        ],
        product: { id: "P1", title: "Produto teste", payment: { amount: 23.9, currency: "BRL" } },
      },
    } } } } };
    fetchMock.mockImplementationOnce(async () => new Response(
      `<script>_n.ctx.r=${JSON.stringify(state)};_n.ctx.r.assets=[]</script>`,
      { status: 200, headers: { "content-type": "text/html" } },
    ));

    const response = await new Promise((resolve) => onMessage(
      { source: "alc-pnr-panel", type: "FETCH_TIMELINE", payload: { caseId: "197162479" } },
      { url: "http://localhost:3000/bandeja-pnr" },
      resolve,
    ));

    expect(response).toMatchObject({ ok: true, data: { caseId: "197162479", sourceEventCount: 4 } });
    expect(response.data.events).toHaveLength(4);
    expect(new Set(response.data.events.map((event) => event.eventId)).size).toBe(4);
    expect(response.data.detail).toMatchObject({
      preInvoiceNumber: "7324513",
      billingPeriod: "202609Q2",
      driverId: "123",
      routeId: "4419214733",
      buyerName: "Comprador Teste",
      receiverName: "Recebedor Teste",
      receiverDocument: "123456",
      carrierName: "ALC TRANSPORTES",
      driverPhone: "31999999999",
      reviewRequestedBy: "Analista",
      reviewMessage: "Comprovante válido",
      reviewEvidenceNames: ["evidencia.png"],
      reviewOutcome: "Revisado pelo Mercado Livre e enviado para faturamento.",
    });
    expect(response.data.detail.products).toEqual([expect.objectContaining({ title: "Produto teste", price: 23.9, currency: "BRL" })]);
  });
});
