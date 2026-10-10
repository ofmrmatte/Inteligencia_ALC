import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../lib/db", () => ({ db: () => ({ query: mocks.query }) }));
import { collectorProgressInput, latestCollectorProgress, saveCollectorProgress } from "../lib/collector-progress";

const actor = "11111111-1111-4111-8111-111111111111";
const syncId = "22222222-2222-4222-8222-222222222222";
const run = {
  syncId, competence: "202610Q1", mode: "manual" as const,
  status: "running" as const, phase: "collecting" as const,
  processed: 30, total: 120, errors: 0,
  startedAt: "2026-10-09T12:00:00.000Z", updatedAt: "2026-10-09T12:00:01.000Z",
};
beforeEach(() => mocks.query.mockReset());

describe("checkpoints de coleta sem envios", () => {
  it("aceita apenas mudanças tipadas com identificador de sincronização", () => {
    expect(collectorProgressInput.safeParse({ action: "start", syncId, competence: "202610Q1", mode: "manual" }).success).toBe(true);
    expect(collectorProgressInput.safeParse({ action: "start", syncId, competence: "202610Q1", mode: "manual", sendMessages: true }).success).toBe(false);
    expect(collectorProgressInput.safeParse({ action: "progress", syncId, phase: "collecting", processed: 20, total: 120, errors: 0 }).success).toBe(true);
    expect(collectorProgressInput.safeParse({ action: "progress", syncId, phase: "completed", processed: 120, total: 120, errors: 0 }).success).toBe(false);
    expect(collectorProgressInput.safeParse({ action: "start", syncId, competence: "wrong", mode: "manual" }).success).toBe(false);
  });
  it("usa mutex no banco para rejeitar coleta concorrente em abas ou computadores diferentes", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ value: run }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const payload = { action: "start" as const, syncId, competence: "202610Q1", mode: "manual" as const };
    expect((await saveCollectorProgress(actor, payload)).accepted).toBe(true);
    expect((await saveCollectorProgress(actor, payload)).accepted).toBe(false);
    expect(mocks.query.mock.calls[0][0]).toContain("ON CONFLICT");
    expect(mocks.query.mock.calls[0][0]).toContain("updated_at < now() - interval '15 minutes'");
  });
  it("só grava etapas do job vigente e não pode exceder total", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ value: run }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ value: { ...run, processed: 60 } }] })
      .mockResolvedValueOnce({ rows: [{ value: run }] });
    const input = { action: "progress" as const, syncId, phase: "saving" as const, processed: 60, total: 120, errors: 1 };
    expect((await saveCollectorProgress(actor, input)).accepted).toBe(true);
    expect(mocks.query.mock.calls[1][0]).toContain("value->>'syncId'=$1");
    expect(mocks.query.mock.calls[1][1][1]).toMatchObject({ processed: 60, errors: 1 });
    expect((await saveCollectorProgress(actor, { ...input, processed: 121 })).accepted).toBe(false);
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });
  it("impede regressões de contagem no banco mesmo com dois checkpoints concorrentes", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ value: run }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ value: { ...run, processed: 70, total: 120, errors: 2 } }] })
      .mockResolvedValueOnce({ rows: [{ value: { ...run, processed: 70, total: 120, errors: 2 } }] })
      .mockResolvedValueOnce({ rows: [{ value: run }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const progress = { action: "progress" as const, syncId, phase: "collecting" as const, total: 120 };
    expect((await saveCollectorProgress(actor, { ...progress, processed: 70, errors: 2 })).accepted).toBe(true);
    const sql = mocks.query.mock.calls[1][0] as string;
    expect(sql).toContain("coalesce((value->>'processed')::integer,0) <= $4");
    expect(sql).toContain("coalesce((value->>'errors')::integer,0) <= $6");
    expect(mocks.query.mock.calls[1][1]).toEqual([
      syncId, expect.objectContaining({ processed: 70, errors: 2 }), actor, 70, 120, 2,
    ]);
    expect((await saveCollectorProgress(actor, { ...progress, processed: 60, errors: 2 })).accepted).toBe(false);
    expect((await saveCollectorProgress(actor, { ...progress, processed: 80, errors: 3 })).accepted).toBe(false);
  });
  it("finaliza a execução com status completo e 100% do total", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ value: run }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ value: { ...run, status: "completed", processed: 120 } }] });
    expect((await saveCollectorProgress(actor, { action: "finish", syncId, processed: 120, total: 120, errors: 0 })).run).toMatchObject({ status: "completed" });
    expect(mocks.query.mock.calls[1][1][1]).toMatchObject({ status: "completed", phase: "completed", processed: 120 });
  });
  it("mostra interrupção após 15 minutos sem heartbeat, sem inventar conclusão", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ value: run, updated_at: new Date(Date.now() - 16 * 60_000) }] })
      .mockResolvedValueOnce({ rows: [{ value: run, updated_at: new Date() }] });
    expect((await latestCollectorProgress())?.status).toBe("interrupted");
    expect((await latestCollectorProgress())?.status).toBe("running");
  });
});
