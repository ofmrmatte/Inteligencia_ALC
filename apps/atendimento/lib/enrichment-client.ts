import {
  boundedBody, confirmedReceipt, ENRICHMENT_BODY_LIMIT, ENRICHMENT_PATH,
  enrichmentEnvelopeSchema, enrichmentHeaders, validHmacKey,
  type EnrichmentEnvelope,
} from "../../../packages/pnr-enrichment/protocol";

export const ENRICHMENT_TIMEOUT_MS = 5000;
export type EnrichmentClientConfig = { url: string; key: string };

export function enrichmentClientConfig(): EnrichmentClientConfig | null {
  const key = process.env.PNR_ENRICHMENT_HMAC_KEY;
  const rawUrl = process.env.PNR_ENRICHMENT_CORE_URL;
  if (!validHmacKey(key) || !rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.pathname !== ENRICHMENT_PATH ||
        url.username || url.password || url.search || url.hash) return null;
    return { url: url.href, key };
  } catch {
    return null;
  }
}

export async function deliverEnrichment(input: EnrichmentEnvelope, config: EnrichmentClientConfig) {
  const event = enrichmentEnvelopeSchema.parse(input);
  const body = JSON.stringify(event);
  if (Buffer.byteLength(body) > ENRICHMENT_BODY_LIMIT) throw new Error("ENRICHMENT_BODY_TOO_LARGE");
  const headers = enrichmentHeaders(body, config.key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENRICHMENT_TIMEOUT_MS);
  try {
    const response = await fetch(config.url, {
      method: "POST", body, headers, signal: controller.signal,
      redirect: "error", cache: "no-store",
    });
    if (!response.ok) throw new Error(`ENRICHMENT_HTTP_${response.status}`);
    const receiptBody = await boundedBody(response, controller.signal);
    return confirmedReceipt(receiptBody,
      response.headers.get("x-alc-enrichment-response-signature"),
      headers["x-alc-enrichment-nonce"], config.key, event);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("ENRICHMENT_TIMEOUT");
    if (error instanceof Error && /^ENRICHMENT_[A-Z_0-9]+$/.test(error.message)) throw error;
    throw new Error("ENRICHMENT_DELIVERY_FAILED");
  } finally {
    clearTimeout(timer);
  }
}
