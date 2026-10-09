import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  mergePnrCaseDetail,
  pnrCaseDetailPayloadHash,
  uniquePnrCaseDetailSnapshots,
} from "@/lib/pnr-case-detail";
import { dedupeCaseTimelineEvents } from "@/lib/pnr-case-center";
import { pnrDetailBatchIssue, pnrDetailEmptySyncDelayMs, pnrDetailQueuePriority, runWithPnrSyncLock } from "@/lib/pnr-case-sync";

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

  it("recua gradualmente apenas com a fila vazia, sem usar os 30 minutos do Atendimento", () => {
    expect(pnrDetailEmptySyncDelayMs(1)).toBe(60_000);
    expect(pnrDetailEmptySyncDelayMs(2)).toBe(120_000);
    expect(pnrDetailEmptySyncDelayMs(3)).toBe(300_000);
    expect(pnrDetailEmptySyncDelayMs(4)).toBe(300_000);
    expect(pnrDetailEmptySyncDelayMs(50)).toBe(300_000);
  });

  it("conta somente as falhas consultadas e mantém os casos pulados pendentes", () => {
    const batch = Array.from({ length: 50 }, (_, index) => ({ ok: false, error: { code: index ? "BATCH_PAUSED" : "INVALID_RESPONSE", message: "Formato indisponível" } }));
    expect(pnrDetailBatchIssue(batch)).toMatchObject({ code: "INVALID_RESPONSE", failedCount: 1 });
    expect(pnrDetailBatchIssue([])).toMatchObject({ code: "INVALID_RESPONSE" });
    expect(pnrDetailBatchIssue([{ ok: true }, { ok: false, error: { code: "HTTP_ERROR", message: "HTTP 404" } }])).toBeNull();
  });

  it("pausa uma falha geral mesmo depois de um primeiro detalhe bem-sucedido", () => {
    const batch = [
      { ok: true },
      { ok: false, error: { code: "HTTP_ERROR", message: "HTTP 500" } },
      ...Array.from({ length: 48 }, () => ({ ok: false, error: { code: "BATCH_PAUSED" } })),
    ];
    expect(pnrDetailBatchIssue(batch)).toEqual({ code: "HTTP_ERROR", message: "HTTP 500", failedCount: 1 });
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

  it("mantém o worker montado globalmente, mas ativo somente no Sync PNR", () => {
    const drawer = readFileSync("components/views/pnr-case-detail-drawer.tsx", "utf8");
    const layout = readFileSync("app/layout.tsx", "utf8");
    const backgroundSync = readFileSync("components/pnr-case-center-background-sync.tsx", "utf8");
    const timelineRoute = readFileSync("app/api/pnr-case-center/timeline/route.ts", "utf8");
    const importsRoute = readFileSync("app/api/imports/route.ts", "utf8");
    expect(drawer).toContain("/api/pnr-case-center/timeline");
    expect(drawer).toContain("requestPnrConnector");
    expect(drawer).toContain('"FETCH_TIMELINE"');
    expect(drawer).toContain("Receber dados");
    expect(drawer).toContain("refreshCaseNow");
    expect(drawer).toContain("Atualizando este caso diretamente no Case Center");
    expect(drawer).toContain("Contato complementar do Atendimento");
    expect(drawer).toContain("VERIFICADO");
    expect(drawer).toContain("Nome verificado");
    expect(drawer).toContain("Comprador / reclamante");
    expect(drawer).toContain("Status atual");
    expect(timelineRoute).toContain("enrichmentPayloadSchema.safeParse");
    expect(timelineRoute).toContain("getCurrentProfile");
    expect(timelineRoute).toContain("canAccessScopedRecord");
    expect(timelineRoute).toContain("atendimento_verified_contact");
    expect(importsRoute).not.toContain("atendimento_verified_contact");
    expect(layout).toContain("<PnrCaseCenterBackgroundSync />");
    expect(backgroundSync).toContain('if (pathname !== "/bandeja-pnr") return;');
    expect(backgroundSync).toContain('document.visibilityState !== "visible"');
    expect(backgroundSync).toContain('"FETCH_TIMELINES"');
    expect(backgroundSync).toContain('/api/pnr-case-center/timeline/bulk');
    expect(backgroundSync).toContain('error.status === 401');
    expect(backgroundSync).toContain('Sincronização pausada —');
  });
});
