import { corePool } from "./db/railway-data-client";
import {
  canonicalJson, enrichmentEnvelopeSchema, enrichmentPayloadSchema, receiptFor, sha256,
  type EnrichmentEnvelope, type EnrichmentReceipt,
} from "../../../packages/pnr-enrichment/protocol";

export type EnrichmentScope = { baseKey: string; sigla: string };
export class EnrichmentRejected extends Error {
  constructor(readonly status: number, code: string) { super(code); }
}

export async function applyPnrEnrichment(
  input: EnrichmentEnvelope,
  request: { nonce: string; timestamp: string; bodyHash: string },
  scopes: EnrichmentScope[],
): Promise<EnrichmentReceipt> {
  const event = enrichmentEnvelopeSchema.parse(input);
  const payload = event.payload;
  if (!scopes.some((scope) => scope.baseKey === payload.baseKey && scope.sigla === payload.sigla))
    throw new EnrichmentRejected(403, "ENRICHMENT_SCOPE_MISMATCH");
  if (Date.parse(payload.capturedAt) > Date.now() + 30_000)
    throw new EnrichmentRejected(422, "ENRICHMENT_CAPTURE_IN_FUTURE");
  const client = await corePool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    const nonce = await client.query(
      `INSERT INTO app_private.pnr_enrichment_nonces(nonce,event_key,request_hash,signed_at)
       VALUES($1,$2,$3,$4) ON CONFLICT(nonce) DO NOTHING RETURNING nonce`,
      [request.nonce, event.eventKey, request.bodyHash, request.timestamp],
    );
    if (!nonce.rowCount) throw new EnrichmentRejected(409, "ENRICHMENT_REPLAY");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [event.eventKey]);
    const row = (await client.query(
      `SELECT case_id,shipment_id,competence,base_key,sigla,atendimento_verified_contact
       FROM public.pnr_case_center_cases WHERE case_id=$1 FOR UPDATE`, [payload.caseId],
    )).rows[0];
    if (!row) throw new EnrichmentRejected(404, "ENRICHMENT_CASE_NOT_FOUND");
    if (row.shipment_id !== payload.shipmentId || row.competence !== payload.competence)
      throw new EnrichmentRejected(409, "ENRICHMENT_CASE_BINDING_MISMATCH");
    if (!row.base_key || !row.sigla || row.base_key !== payload.baseKey || row.sigla !== payload.sigla)
      throw new EnrichmentRejected(403, "ENRICHMENT_SCOPE_MISMATCH");
    const payloadHash = sha256(canonicalJson(event));
    const previousReceipt = (await client.query(
      "SELECT payload_hash FROM app_private.pnr_enrichment_receipts WHERE event_key=$1", [event.eventKey],
    )).rows[0];
    if (previousReceipt) {
      if (previousReceipt.payload_hash !== payloadHash)
        throw new EnrichmentRejected(409, "ENRICHMENT_EVENT_CONFLICT");
      await client.query("COMMIT");
      return receiptFor(event, "duplicate");
    }
    let outcome: "applied" | "superseded" = "applied";
    if (row.atendimento_verified_contact != null) {
      const existing = enrichmentPayloadSchema.safeParse(row.atendimento_verified_contact);
      if (!existing.success || existing.data.caseId !== payload.caseId ||
          existing.data.shipmentId !== payload.shipmentId || existing.data.competence !== payload.competence ||
          existing.data.baseKey !== payload.baseKey || existing.data.sigla !== payload.sigla)
        throw new EnrichmentRejected(409, "ENRICHMENT_EXISTING_CONTACT_CONFLICT");
      const incomingTime = Date.parse(payload.capturedAt), existingTime = Date.parse(existing.data.capturedAt);
      if (incomingTime === existingTime && payload.sourceHash !== existing.data.sourceHash)
        throw new EnrichmentRejected(409, "ENRICHMENT_CAPTURE_CONFLICT");
      if (incomingTime <= existingTime) outcome = "superseded";
    }
    if (outcome === "applied") {
      const updated = await client.query(
        `UPDATE public.pnr_case_center_cases SET atendimento_verified_contact=$2,updated_at=now()
         WHERE case_id=$1 RETURNING case_id`, [payload.caseId, payload],
      );
      if (updated.rowCount !== 1 || updated.rows[0]?.case_id !== payload.caseId)
        throw new EnrichmentRejected(503, "ENRICHMENT_CONTACT_NOT_APPLIED");
    }
    const receipt = await client.query(
      `INSERT INTO app_private.pnr_enrichment_receipts(event_key,case_id,shipment_id,schema_version,source_hash,payload_hash,outcome)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING event_key`,
      [event.eventKey, payload.caseId, payload.shipmentId, payload.schemaVersion, payload.sourceHash, payloadHash, outcome],
    );
    if (receipt.rowCount !== 1 || receipt.rows[0]?.event_key !== event.eventKey)
      throw new EnrichmentRejected(503, "ENRICHMENT_RECEIPT_NOT_STORED");
    await client.query("COMMIT");
    return receiptFor(event, outcome);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
