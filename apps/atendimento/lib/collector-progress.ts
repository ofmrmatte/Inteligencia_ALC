import { z } from "zod";
import { db } from "./db";

const syncId = z.string().uuid();
const competence = z.string().regex(/^20\d{4}Q[12]$/);
const phase = z.enum(["preparing", "fetching", "details", "buyers", "saving", "collecting", "completed", "failed"]);
const count = z.number().int().nonnegative().max(100_000);

export const collectorProgressInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), syncId, competence, mode: z.enum(["manual", "automatic"]) }).strict(),
  z.object({ action: z.literal("progress"), syncId, phase: phase.exclude(["completed", "failed"]), processed: count, total: count, errors: count }).strict(),
  z.object({ action: z.literal("finish"), syncId, processed: count, total: count, errors: count }).strict(),
  z.object({ action: z.literal("fail"), syncId, message: z.string().trim().min(1).max(350) }).strict(),
]);

export type CollectorProgressInput = z.infer<typeof collectorProgressInput>;
export type CollectorRun = {
  syncId: string;
  competence: string;
  mode: "manual" | "automatic";
  status: "running" | "completed" | "failed" | "interrupted";
  phase: z.infer<typeof phase>;
  processed: number;
  total: number;
  errors: number;
  message?: string;
  startedAt: string;
  updatedAt: string;
};

const staleMs = 15 * 60_000;

/**
 * The browser extension owns the actual job. PostgreSQL stores its latest
 * checkpoint, not a server-side task that can collect without the ML session.
 * A conditional insert provides a cross-tab/browser mutex without a migration.
 */
export async function saveCollectorProgress(actor: string, input: CollectorProgressInput) {
  if (input.action === "start") {
    const now = new Date().toISOString();
    const state: CollectorRun = {
      syncId: input.syncId, competence: input.competence, mode: input.mode,
      status: "running", phase: "preparing", processed: 0, total: 0,
      errors: 0, startedAt: now, updatedAt: now,
    };
    const result = await db().query(
      `INSERT INTO alc_atendimento.settings(key,value,updated_by)
       VALUES('collector_run',$1::jsonb,$2)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()
       WHERE alc_atendimento.settings.value->>'status' <> 'running'
         OR alc_atendimento.settings.updated_at < now() - interval '15 minutes'
       RETURNING value`,
      [state, actor],
    );
    return { accepted: Boolean(result.rowCount), run: result.rows[0]?.value ?? null };
  }

  const stored = await db().query<{ value: CollectorRun }>(
    "SELECT value FROM alc_atendimento.settings WHERE key='collector_run' AND value->>'syncId'=$1 AND value->>'status'='running'",
    [input.syncId],
  );
  const current = stored.rows[0]?.value;
  if (!current) return { accepted: false, run: null };
  const next: CollectorRun = { ...current, updatedAt: new Date().toISOString() };
  if (input.action === "progress" || input.action === "finish") {
    if (input.processed > input.total) return { accepted: false, run: null };
    next.processed = input.processed;
    next.total = input.total;
    next.errors = input.errors;
    next.phase = input.action === "finish" ? "completed" : input.phase;
    if (input.action === "finish") next.status = "completed";
  } else {
    next.status = "failed";
    next.phase = "failed";
    next.message = input.message;
  }
  // Compare-and-swap on job identity and running status rejects stale writers.
  const result = await db().query<{ value: CollectorRun }>(
    `UPDATE alc_atendimento.settings SET value=$2::jsonb,updated_by=$3,updated_at=now()
      WHERE key='collector_run' AND value->>'syncId'=$1 AND value->>'status'='running'
      RETURNING value`,
    [input.syncId, next, actor],
  );
  return { accepted: Boolean(result.rowCount), run: result.rows[0]?.value ?? null };
}

export async function latestCollectorProgress(): Promise<CollectorRun | null> {
  const result = await db().query<{ value: CollectorRun; updated_at: Date | string }>(
    "SELECT value,updated_at FROM alc_atendimento.settings WHERE key='collector_run'",
  );
  const row = result.rows[0];
  if (!row?.value) return null;
  const updatedAt = new Date(row.updated_at).toISOString();
  const run = { ...row.value, updatedAt };
  if (run.status === "running" && Date.now() - Date.parse(updatedAt) > staleMs) {
    return { ...run, status: "interrupted", message: "O conector parou de atualizar a coleta. Verifique a extensão e a sessão do Mercado Livre." };
  }
  return run;
}
