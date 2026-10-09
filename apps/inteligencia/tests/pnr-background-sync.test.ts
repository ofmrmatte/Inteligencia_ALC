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
  PNR_DETAIL_SYNC_ACTIVE_INTERVAL_MS,
  PNR_DETAIL_SYNC_RATE_LIMIT_BACKOFF_MS,
  pnrDetailEmptySyncDelayMs,
  pnrDetailNextSyncDelayMs,
} from "@/lib/pnr-case-sync";

import {
  LATEST_CONNECTOR_VERSION,
  PnrConnectorError,
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
function source(success: boolean, caseIds = ids) {
  return {
    results: caseIds.map((caseId, index) =>
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
    .mockImplementation(async (type, payload) =>
      type === "PING"
        ? {
            installed: true,
            version: LATEST_CONNECTOR_VERSION,
            mlTabAvailable: true,
            sessionAvailable: true,
          }
        : source(true, payload?.caseIds as string[]),
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
    requestMock.mockImplementation(async (type, payload) =>
      type === "PING"
        ? {
            installed: true,
            version: LATEST_CONNECTOR_VERSION,
            mlTabAvailable: true,
            sessionAvailable: true,
          }
        : source(false, payload?.caseIds as string[]),
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
    requestMock.mockImplementation(async (type, payload) =>
      type === "PING"
        ? {
            installed: true,
            version: LATEST_CONNECTOR_VERSION,
            mlTabAvailable: true,
            sessionAvailable: true,
          }
        : source(true, payload?.caseIds as string[]),
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

  it("persiste sucesso e timeout individual sem converter o restante pausado em erro", async () => {
    const shortIds = ids.slice(0, 5);
    const persisted: Array<Array<{ caseId: string; status: string }>> = [];
    fetchMock.mockImplementation(async (path, options) => {
      if (path.endsWith("/queue"))
        return Response.json({ pending: 5, cases: shortIds.map((caseId) => ({ caseId, priority: 1 })), case: null });
      const items = JSON.parse(options.body).items;
      persisted.push(items);
      return Response.json({
        results: items.map((item: { caseId: string }) => ({ caseId: item.caseId, ok: true, status: 200 })),
      });
    });
    requestMock.mockImplementation(async (type) => type === "PING"
      ? {
          installed: true,
          version: LATEST_CONNECTOR_VERSION,
          mlTabAvailable: true,
          sessionAvailable: true,
        }
      : {
          results: [
            {
              caseId: shortIds[0],
              ok: true,
              data: {
                caseId: shortIds[0],
                sourceEventCount: 1,
                events: [{ eventId: "1", eventType: "CREATE_CASE_BY_CONSUMER", dateCreated: "2026-10-01T12:00:00Z" }],
              },
            },
            { caseId: shortIds[1], ok: false, error: { code: "REQUEST_TIMEOUT", message: "Tempo de consulta do detalhe excedido." } },
            ...shortIds.slice(2).map((caseId) => ({ caseId, ok: false, error: { code: "BATCH_PAUSED", message: "Caso permanece pendente." } })),
          ],
        });

    await start();

    expect(persisted.flat().map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: ids[0], status: "COMPLETE" },
      { caseId: ids[1], status: "ERROR" },
    ]);
    expect(getPnrBackgroundSyncStatus()).toMatchObject({ phase: "idle", pending: 4, processed: 1, errors: 1 });
  });

  it("mantém grupos já persistidos quando uma chamada posterior do conector expira", async () => {
    const connectorCalls: string[][] = [];
    const persisted: Array<Array<{ caseId: string; status: string }>> = [];
    fetchMock.mockImplementation(async (path, options) => {
      if (path.endsWith("/queue"))
        return Response.json({ pending: 50, cases: ids.map((caseId) => ({ caseId, priority: 1 })), case: null });
      const items = JSON.parse(options.body).items;
      persisted.push(items);
      return Response.json({
        results: items.map((item: { caseId: string }) => ({ caseId: item.caseId, ok: true, status: 200 })),
      });
    });
    requestMock.mockImplementation(async (type, payload) => {
      if (type === "PING") return {
        installed: true,
        version: LATEST_CONNECTOR_VERSION,
        mlTabAvailable: true,
        sessionAvailable: true,
      };
      const caseIds = payload?.caseIds as string[];
      connectorCalls.push(caseIds);
      if (connectorCalls.length === 2) {
        throw new PnrConnectorError("REQUEST_TIMEOUT", "O conector excedeu o prazo da consulta.");
      }
      return {
        results: caseIds.map((caseId) => ({
          caseId,
          ok: true,
          data: {
            caseId,
            sourceEventCount: 1,
            events: [{ eventId: "1", eventType: "CREATE_CASE_BY_CONSUMER", dateCreated: "2026-10-01T12:00:00Z" }],
          },
        })),
      };
    });

    await start();

    expect(connectorCalls.map((call) => call.length)).toEqual([5, 5]);
    expect(persisted.flat().map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      ids.slice(0, 5).map((caseId) => ({ caseId, status: "COMPLETE" })),
    );
    expect(getPnrBackgroundSyncStatus()).toMatchObject({ phase: "paused", pending: 45, processed: 5, errors: 0 });
  });

  it("processa lotes consecutivos de PNRs sem esperar 30 minutos", async () => {
    let queueReads = 0;
    fetchMock.mockImplementation(async (path, options) => {
      if (path.endsWith("/queue")) {
        queueReads += 1;
        const cases = queueReads <= 2 ? ids.map((caseId) => ({ caseId, priority: 1 })) : [];
        return Response.json({ pending: Math.max(0, 150 - queueReads * 50), cases, case: cases[0] ?? null });
      }
      const items = JSON.parse(options.body).items as Array<{ caseId: string }>;
      return Response.json({
        results: items.map(({ caseId }) => ({ caseId, ok: true, status: 200 })),
      });
    });
    await start();
    expect(fetchMock).toHaveBeenCalledTimes(11); // 1 fila e 10 gravações de 5 casos
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(PNR_DETAIL_SYNC_ACTIVE_INTERVAL_MS - 1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(11);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(22); // segundo lote imediatamente após intervalo curto
    expect(getPnrBackgroundSyncStatus().processed).toBe(100);
    await act(async () => vi.advanceTimersByTimeAsync(PNR_DETAIL_SYNC_ACTIVE_INTERVAL_MS));
    expect(queueReads).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(23); // fila vazia: só leitura, sem replay
    expect(getPnrBackgroundSyncStatus().message).toContain("nova verificação");
  });

  it("separa a cadência do Sync PNR da coleta de 30 minutos do Atendimento", () => {
    expect(PNR_DETAIL_SYNC_ACTIVE_INTERVAL_MS).toBeLessThan(10_000);
    expect(PNR_DETAIL_SYNC_RATE_LIMIT_BACKOFF_MS).toBeGreaterThanOrEqual(60_000);
    expect(pnrDetailEmptySyncDelayMs(1)).toBe(60_000);
    expect(pnrDetailEmptySyncDelayMs(10)).toBe(300_000);
    expect(pnrDetailNextSyncDelayMs("IN_PROGRESS")).toBe(60 * 60_000);
    expect(pnrDetailNextSyncDelayMs("CLOSED")).toBe(6 * 60 * 60_000);
  });
});
