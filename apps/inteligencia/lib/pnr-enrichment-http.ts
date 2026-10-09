import { z } from "zod";
import {
  authenticateEnrichment, boundedBody, ENRICHMENT_PATH, enrichmentEnvelopeSchema,
  responseSignature, sha256, validHmacKey,
} from "../../../packages/pnr-enrichment/protocol";
import { applyPnrEnrichment, EnrichmentRejected } from "./pnr-enrichment";

const scopesSchema = z.array(z.object({
  baseKey: z.string().trim().min(1).max(200), sigla: z.string().trim().min(1).max(200),
}).strict()).min(1).max(200);

function receiverConfig() {
  const key = process.env.PNR_ENRICHMENT_HMAC_KEY;
  if (!validHmacKey(key) || !process.env.DATABASE_URL || !process.env.PNR_ENRICHMENT_ALLOWED_SCOPES) return null;
  try {
    return { key, scopes: scopesSchema.parse(JSON.parse(process.env.PNR_ENRICHMENT_ALLOWED_SCOPES)) };
  } catch {
    return null;
  }
}
function rejected(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function receivePnrEnrichment(request: Request) {
  const config = receiverConfig();
  if (!config) return rejected(503, "ENRICHMENT_DISABLED");
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== ENRICHMENT_PATH || url.search)
    return rejected(400, "ENRICHMENT_REQUEST_INVALID");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return rejected(415, "ENRICHMENT_CONTENT_TYPE_INVALID");
  try {
    const body = await boundedBody(request, AbortSignal.timeout(5000));
    const auth = authenticateEnrichment(request.headers, body, config.key);
    let raw: unknown;
    try { raw = JSON.parse(body); } catch { return rejected(400, "ENRICHMENT_JSON_INVALID"); }
    const parsed = enrichmentEnvelopeSchema.safeParse(raw);
    if (!parsed.success) return rejected(422, "ENRICHMENT_SCHEMA_INVALID");
    const receipt = await applyPnrEnrichment(parsed.data, { ...auth, bodyHash: sha256(body) }, config.scopes);
    const responseBody = JSON.stringify(receipt);
    return new Response(responseBody, { headers: {
      "Content-Type": "application/json", "Cache-Control": "no-store",
      "x-alc-enrichment-response-signature": responseSignature(responseBody, auth.nonce, config.key),
    } });
  } catch (error) {
    if (error instanceof EnrichmentRejected) return rejected(error.status, error.message);
    if (error instanceof Error && error.message === "ENRICHMENT_UNAUTHENTICATED") return rejected(401, error.message);
    if (error instanceof Error && error.message === "ENRICHMENT_BODY_TOO_LARGE") return rejected(413, error.message);
    return rejected(503, "ENRICHMENT_UNAVAILABLE");
  }
}
