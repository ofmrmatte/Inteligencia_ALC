import { enrichmentEnvelopeSchema } from "../../../packages/pnr-enrichment/protocol";
import { deliverEnrichment, enrichmentClientConfig } from "./enrichment-client";
import { acknowledgeEnrichmentEvent, claimEnrichmentEvents, retryEnrichmentEvent } from "./sync-enrichment";

export async function processEnrichment() {
  const config = enrichmentClientConfig();
  const stats = { enabled: Boolean(config), claimed: 0, delivered: 0, retried: 0, leaseLost: 0 };
  if (!config) return stats;
  const claims = await claimEnrichmentEvents(5);
  stats.claimed = claims.length;
  for (const claim of claims) {
    try {
      const event = enrichmentEnvelopeSchema.parse({ eventKey: claim.event_key, payload: claim.payload });
      if (event.payload.caseId !== claim.case_id) throw new Error("ENRICHMENT_CASE_MISMATCH");
      await deliverEnrichment(event, config);
      if (await acknowledgeEnrichmentEvent(claim.id, claim.attempts)) stats.delivered += 1;
      else stats.leaseLost += 1;
    } catch (error) {
      if (await retryEnrichmentEvent(claim.id, claim.attempts, error)) stats.retried += 1;
      else stats.leaseLost += 1;
    }
  }
  return stats;
}
