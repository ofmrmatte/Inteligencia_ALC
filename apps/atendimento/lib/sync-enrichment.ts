import { db } from "./db";
import {
  ENRICHMENT_MAX_ATTEMPTS,
  verifiedContactEnrichment,
} from "./sync-delta";
import type { CaseRecord } from "./domain";

const LEASE_SECONDS = 120;
export type EnrichmentClaim = {
  id: string;
  event_key: string;
  case_id: string;
  payload: unknown;
  attempts: number;
};

export async function enqueueVerifiedContact(
  queryable: { query(sql: string, values?: unknown[]): Promise<unknown> },
  record: CaseRecord,
) {
  const event = verifiedContactEnrichment(record);
  if (!event) return false;
  await queryable.query(
    `INSERT INTO alc_atendimento.pnr_enrichment_outbox(event_key,case_id,payload)
     VALUES($1,$2,$3) ON CONFLICT(event_key) DO NOTHING`,
    [event.eventKey, record.caseId, event.payload],
  );
  return true;
}

export async function claimEnrichmentEvents(limit = 25) {
  const batchSize = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 25;
  await db().query(
    `UPDATE alc_atendimento.pnr_enrichment_outbox
     SET status='dead_letter', lease_until=NULL,
         last_error=coalesce(last_error,'Maximum delivery attempts reached'), updated_at=now()
     WHERE status='processing' AND lease_until < now() AND attempts >= $1`,
    [ENRICHMENT_MAX_ATTEMPTS],
  );
  const result = await db().query<EnrichmentClaim>(
    `WITH candidates AS (
       SELECT id FROM alc_atendimento.pnr_enrichment_outbox
       WHERE attempts < $2 AND next_attempt_at <= now()
         AND (status = 'pending' OR (status = 'processing' AND lease_until < now()))
       ORDER BY created_at, id
       LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     UPDATE alc_atendimento.pnr_enrichment_outbox AS event
     SET status='processing', attempts=event.attempts+1,
         lease_until=now() + ($3::integer * interval '1 second'), updated_at=now()
     FROM candidates WHERE event.id=candidates.id
     RETURNING event.id,event.event_key,event.case_id,event.payload,event.attempts`,
    [batchSize, ENRICHMENT_MAX_ATTEMPTS, LEASE_SECONDS],
  );
  return result.rows;
}

export async function acknowledgeEnrichmentEvent(id: string, attempt: number) {
  const result = await db().query(
    `UPDATE alc_atendimento.pnr_enrichment_outbox
     SET status='delivered', delivered_at=now(), lease_until=NULL, last_error=NULL, updated_at=now()
     WHERE id=$1 AND attempts=$2 AND status='processing' AND lease_until > now() RETURNING id`,
    [id, attempt],
  );
  return Boolean(result.rowCount);
}

export async function retryEnrichmentEvent(id: string, attempt: number, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /((?:access[_-]?token|token|secret|password)["']?\s*[:=]\s*["']?)[^"'&,\s}]+/gi,
      "$1[redacted]",
    )
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[redacted]@");
  const boundedMessage = message.slice(0, 1000);
  const result = await db().query(
    `UPDATE alc_atendimento.pnr_enrichment_outbox
     SET status=CASE WHEN attempts >= $3 THEN 'dead_letter' ELSE 'pending' END,
         next_attempt_at=now() + (least(30000 * power(2, attempts - 1), 21600000)::bigint * interval '1 millisecond'),
         lease_until=NULL, last_error=$4, updated_at=now()
     WHERE id=$1 AND attempts=$2 AND status='processing' AND lease_until > now() RETURNING id`,
    [id, attempt, ENRICHMENT_MAX_ATTEMPTS, boundedMessage],
  );
  return Boolean(result.rowCount);
}
