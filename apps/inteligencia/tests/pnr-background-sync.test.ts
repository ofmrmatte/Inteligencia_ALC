// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/bandeja-pnr" }));
vi.mock("@/lib/pnr-connector-client", async (load) => ({
  ...(await load<object>()),
  requestPnrConnector: vi.fn(),
}));
import { PnrCaseCenterBackgroundSync } from "@/components/pnr-case-center-background-sync";
import {
  LATEST_CONNECTOR_VERSION,
  requestPnrConnector,
} from "@/lib/pnr-connector-client";
import {
  getPnrBackgroundSyncStatus,
  publishPnrBackgroundSyncStatus,
  requestPnrBackgroundSyncNow,
} from "@/lib/pnr-background-sync-store";
let root: Root;
let host: HTMLDivElement;
const ids = Array.from({ length: 50 }, (_, index) => String(10001 + index));
const fetchMock = vi.fn();
const requestMock = vi.mocked(requestPnrConnector);
function source(success: boolean) {
  return {
    results: ids.map((caseId, index) =>
      success
        ? {
            caseId,
            ok: true,
            data: {
              caseId,
              sourceEventCount: 1,
              events: [
                {
                  eventId: "1",
                  eventType: "CREATE_CASE_BY_CONSUMER",
                  dateCreated: "2026-10-01T12:00:00Z",
                },
              ],
            },
          }
        : {
            caseId,
            ok: false,
            error: {
              code: index ? "BATCH_PAUSED" : "INVALID_RESPONSE",
              message: "Formato da fonte indisponível",
            },
          },
    ),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  publishPnrBackgroundSyncStatus({
    phase: "idle",
    pending: 0,
    processed: 0,
    errors: 0,
    manuallyPaused: false,
    lastSuccessAt: null,
  });
  fetchMock.mockReset().mockImplementation(async (path, options) => {
    if (path.endsWith("/queue"))
      return Response.json({
        pending: 50,
        cases: ids.map((caseId) => ({ caseId, priority: 1 })),
        case: null,
      });
    const items = JSON.parse(options.body).items;
    return Response.json({
      results: items.map((item: { caseId: string }) => ({
        caseId: item.caseId,
        ok: true,
        status: 200,
      })),
    });
  });
  requestMock
    .mockReset()
    .mockImplementation(async (type) =>
      type === "PING"
        ? {
            installed: true,
            version: LATEST_CONNECTOR_VERSION,
            mlTabAvailable: true,
            sessionAvailable: true,
          }
        : source(true),
    );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function start() {
  await act(async () =>
    root.render(createElement(PnrCaseCenterBackgroundSync)),
  );
  await act(async () => vi.advanceTimersByTimeAsync(1000));
}
describe("sincronização de detalhes em background", () => {
  it("pausa na falha geral, mantém 50 pendentes e só retoma por ação explícita", async () => {
    requestMock.mockImplementation(async (type) =>
      type === "PING"
        ? {
            installed: true,
            version: LATEST_CONNECTOR_VERSION,
            mlTabAvailable: true,
            sessionAvailable: true,
          }
        : source(false),
    );
    await start();
    expect(getPnrBackgroundSyncStatus()).toMatchObject({
      phase: "paused",
      pending: 50,
      processed: 0,
      errors: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(3_600_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    requestMock.mockImplementation(async (type) =>
      type === "PING"
        ? {
            installed: true,
            version: LATEST_CONNECTOR_VERSION,
            mlTabAvailable: true,
            sessionAvailable: true,
          }
        : source(true),
    );
    await act(async () => {
      requestPnrBackgroundSyncNow();
    });
    expect(getPnrBackgroundSyncStatus()).toMatchObject({
      phase: "idle",
      pending: 0,
      processed: 50,
      errors: 1,
    });
  });
  it("interrompe após o primeiro lote recusado pelo servidor e mostra a causa", async () => {
    fetchMock.mockImplementation(async (path) =>
      path.endsWith("/queue")
        ? Response.json({
            pending: 50,
            cases: ids.map((caseId) => ({ caseId, priority: 1 })),
            case: null,
          })
        : Response.json({
            results: ids
              .slice(0, 10)
              .map((caseId) => ({
                caseId,
                ok: false,
                status: 400,
                error: "Timeline PNR inválida. Campos: events.",
              })),
          }),
    );
    await start();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getPnrBackgroundSyncStatus()).toMatchObject({
      phase: "paused",
      pending: 50,
      processed: 0,
      errors: 10,
    });
    expect(getPnrBackgroundSyncStatus().message).toContain("Campos: events");
  });
  it("não repete consultas ao trocar de foco e aguarda 30 minutos", async () => {
    await start();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    await act(async () => vi.advanceTimersByTimeAsync(1_740_000));
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });
});
