import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
let fetchCaseDetailStatesInTab;
beforeAll(async () => {
  vi.stubGlobal("chrome", {
    tabs: { onActivated: { addListener() {} } },
    runtime: {
      onMessage: { addListener() {} },
      onInstalled: { addListener() {} },
    },
  });
  ({ fetchCaseDetailStatesInTab } = await import(
    "../../../extensions/pnr-connector/src/service-worker.js"
  ));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const events = [
  {
    id: 1,
    event_type: "CREATE_CASE_BY_CONSUMER",
    date_created: "2026-10-01T12:00:00Z",
  },
];
const html = (root = false) =>
  `<script>_n.ctx.r = ${JSON.stringify({ appProps: { pageProps: { preloadedStore: root ? { RootReducer: { CaseDetail: { events } } } : { CaseDetail: { events, notes: [{ message: 'Conteúdo com } e " aspas' }] } } } } })}; window.other = {};</script>`;
describe("consulta em lote de detalhes PNR", () => {
  it("extrai JSON com espaços, strings com chaves e sem depender do marcador assets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(html())),
    );
    expect(
      await fetchCaseDetailStatesInTab({ caseIds: ["10001"], concurrency: 6 }),
    ).toMatchObject([{ ok: true, data: { caseState: { events } } }]);
  });
  it("aceita o reducer conhecido dentro do RootReducer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(html(true))),
    );
    expect(
      (
        await fetchCaseDetailStatesInTab({ caseIds: ["10001"], concurrency: 6 })
      )[0].ok,
    ).toBe(true);
  });
  it.each([
    [401, "MERCADO_LIVRE_SESSION_REQUIRED"],
    [403, "MERCADO_LIVRE_ACCESS_DENIED"],
    [429, "RATE_LIMITED"],
    [200, "INVALID_RESPONSE"],
    [500, "HTTP_ERROR"],
  ])("interrompe após o primeiro erro geral HTTP %s", async (status, code) => {
    const fetch = vi.fn(
      async () => new Response("<html>Indisponível</html>", { status }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await fetchCaseDetailStatesInTab({
      caseIds: Array.from({ length: 50 }, (_, i) => String(10001 + i)),
      concurrency: 6,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({ ok: false, code });
    expect(result.slice(1).every((x) => x.code === "BATCH_PAUSED")).toBe(true);
  });
  it("não marca uma timeline ausente como concluída", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(html().replace(JSON.stringify(events), "[]")),
      ),
    );
    expect(
      (
        await fetchCaseDetailStatesInTab({ caseIds: ["10001"], concurrency: 1 })
      )[0],
    ).toMatchObject({ ok: false, code: "INCOMPLETE_TIMELINE" });
  });
  it("mantém falha individual 404 e consulta os demais casos", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockImplementation(async () => new Response(html()));
    vi.stubGlobal("fetch", fetch);
    const result = await fetchCaseDetailStatesInTab({
      caseIds: ["10001", "10002", "10003"],
      concurrency: 6,
    });
    expect(result.map((x) => x.ok)).toEqual([false, true, true]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
