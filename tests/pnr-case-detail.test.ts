import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  mergePnrCaseDetail,
  pnrCaseDetailPayloadHash,
  uniquePnrCaseDetailSnapshots,
} from "@/lib/pnr-case-detail";
import { dedupeCaseTimelineEvents } from "@/lib/pnr-case-center";
import { pnrDetailQueuePriority, runWithPnrSyncLock } from "@/lib/pnr-case-sync";

describe("histórico durável de detalhes PNR", () => {
  it("mantém valores e listas antigas quando a captura nova vem vazia", () => {
    const previous = {
      buyerName: "Comprador A",
      routeId: "ROTA-1",
      products: [{ id: "P1", title: "Produto A", price: 55 }],
      reviewEvidenceNames: ["comprovante-a.pdf"],
      receiptEvidenceNames: ["entrega-a.png"],
    };
    expect(mergePnrCaseDetail(previous, {
      buyerName: "   ",
      routeId: "",
      products: [],
      reviewEvidenceNames: [],
      receiptEvidenceNames: [],
    })).toEqual(previous);
    expect(mergePnrCaseDetail(previous, undefined)).toEqual(previous);
  });

  it("atualiza o consolidado e mantém snapshots distintos de A e B", () => {
    const capturedAt = "2026-09-17T12:00:00.000Z";
    const oldDetail = { buyerName: "Comprador A", products: [{ id: "P1", title: "Produto A" }] };
    const newDetail = { buyerName: "Comprador B", products: [{ id: "P1", title: "Produto B" }] };
    const snapshots = uniquePnrCaseDetailSnapshots([
      { payload: oldDetail, capturedAt },
      { payload: newDetail, capturedAt: "2026-09-17T13:00:00.000Z" },
    ]);
    expect(mergePnrCaseDetail(oldDetail, newDetail)).toMatchObject({
      buyerName: "Comprador B",
      products: [{ id: "P1", title: "Produto B" }],
    });
    expect(snapshots.map((snapshot) => snapshot.payload.buyerName)).toEqual(["Comprador A", "Comprador B"]);
  });

  it("não duplica o mesmo snapshot e ignora a ordem das chaves no hash", () => {
    const capturedAt = "2026-09-17T12:00:00.000Z";
    const left = { buyerName: "Comprador", routeId: "R1" };
    const right = { routeId: "R1", buyerName: "Comprador" };
    expect(pnrCaseDetailPayloadHash(left)).toBe(pnrCaseDetailPayloadHash(right));
    expect(uniquePnrCaseDetailSnapshots([
      { payload: left, capturedAt },
      { payload: right, capturedAt },
    ])).toHaveLength(1);
  });

  it("mantém A/B/C e acrescenta D quando a fonte passa a retornar B/C/D", () => {
    const event = (eventId: string) => ({ eventId });
    const merged = dedupeCaseTimelineEvents([
      event("A"), event("B"), event("C"), event("B"), event("C"), event("D"),
    ]);
    expect(merged.map((item) => item.eventId)).toEqual(["A", "B", "C", "D"]);
  });

  it("prioriza parser antigo para reenriquecimento", () => {
    expect(pnrDetailQueuePriority({
      detail_sync_status: "COMPLETE",
      detail_parser_version: 2,
      detail_last_success_at: "2026-09-17T12:00:00.000Z",
      main_status: "CLOSED",
      source_last_seen_at: "2026-09-17T12:00:00.000Z",
    }, Date.parse("2026-09-17T13:00:00.000Z"))).toBe(1);
  });

  it("permite somente uma aba por vez quando Web Locks está disponível", async () => {
    let held = false;
    let release: (() => void) | undefined;
    const locks = {
      request: async <T>(_name: string, _options: { ifAvailable: true; mode: "exclusive" }, callback: (lock: unknown | null) => Promise<T>) => {
        if (held) return callback(null);
        held = true;
        try {
          return await callback({});
        } finally {
          held = false;
        }
      },
    };
    const first = runWithPnrSyncLock(locks, () => new Promise<void>((resolve) => { release = resolve; }));
    await Promise.resolve();
    const second = await runWithPnrSyncLock(locks, async () => undefined);
    expect(second).toBe(false);
    release?.();
    await expect(first).resolves.toBe(true);
  });

  it("mantém worker global e permite priorizar imediatamente o caso aberto no drawer", () => {
    const drawer = readFileSync("components/views/pnr-case-detail-drawer.tsx", "utf8");
    const layout = readFileSync("app/layout.tsx", "utf8");
    const backgroundSync = readFileSync("components/pnr-case-center-background-sync.tsx", "utf8");
    expect(drawer).toContain("/api/pnr-case-center/timeline");
    expect(drawer).toContain("requestPnrConnector");
    expect(drawer).toContain('"FETCH_TIMELINE"');
    expect(drawer).toContain("Atualizando este caso diretamente no Case Center");
    expect(layout).toContain("<PnrCaseCenterBackgroundSync />");
    expect(backgroundSync).toContain('if (pathname === "/login" || pathname.startsWith("/motorista")) return;');
  });
});
