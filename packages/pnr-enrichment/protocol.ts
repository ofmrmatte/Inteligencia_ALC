import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const ENRICHMENT_PATH = "/api/internal/pnr-enrichment";
export const ENRICHMENT_VERSION = 2;
export const ENRICHMENT_BODY_LIMIT = 8192;
const hexHash = z.string().regex(/^[a-f0-9]{64}$/);
const limited = (max: number) => z.string().trim().min(1).max(max);

const fieldsSchema = z.object({
  schemaVersion: z.literal(ENRICHMENT_VERSION),
  caseId: limited(200),
  shipmentId: limited(120),
  competence: z.string().regex(/^20\d{2}(0[1-9]|1[0-2])Q[12]$/),
  baseKey: limited(200),
  sigla: limited(200),
  origin: z.literal("atendimento_verified_contact"),
  name: limited(200),
  phone: z.string().regex(/^55\d{10,11}$/),
  verified: z.literal(true),
  source: limited(1000),
  capturedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
}).strict();
export type EnrichmentFields = z.infer<typeof fieldsSchema>;

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function validSource(payload: EnrichmentFields) {
  if (payload.source === "validado_pela_equipe") return true;
  try {
    const source = new URL(payload.source);
    return source.protocol === "https:" && source.hostname === "envios.adminml.com" &&
      !source.port && !source.username && !source.password && !source.search && !source.hash &&
      source.pathname === `/logistics/package-management/package/${payload.shipmentId}`;
  } catch {
    return false;
  }
}

export const enrichmentPayloadSchema = fieldsSchema.extend({ sourceHash: hexHash })
  .superRefine((payload, context) => {
    const { sourceHash, ...fields } = payload;
    if (!validSource(payload)) context.addIssue({ code: "custom", path: ["source"], message: "Invalid contact provenance" });
    if (sourceHash !== sha256(canonicalJson(fields)))
      context.addIssue({ code: "custom", path: ["sourceHash"], message: "Invalid source hash" });
  });
export type EnrichmentPayload = z.infer<typeof enrichmentPayloadSchema>;

export function enrichmentEventKey(payload: EnrichmentPayload) {
  return `verified-contact:v${payload.schemaVersion}:${payload.caseId}:${payload.sourceHash}`;
}
export const enrichmentEnvelopeSchema = z.object({
  eventKey: limited(400),
  payload: enrichmentPayloadSchema,
}).strict().superRefine((event, context) => {
  if (event.eventKey !== enrichmentEventKey(event.payload))
    context.addIssue({ code: "custom", path: ["eventKey"], message: "Invalid event identity" });
});
export type EnrichmentEnvelope = z.infer<typeof enrichmentEnvelopeSchema>;

export function createEnrichmentEvent(input: EnrichmentFields): EnrichmentEnvelope {
  const fields = fieldsSchema.parse(input);
  const payload = enrichmentPayloadSchema.parse({ ...fields, sourceHash: sha256(canonicalJson(fields)) });
  return { eventKey: enrichmentEventKey(payload), payload };
}

export const enrichmentReceiptSchema = z.object({
  schemaVersion: z.literal(ENRICHMENT_VERSION),
  eventKey: limited(400),
  caseId: limited(200),
  shipmentId: limited(120),
  sourceHash: hexHash,
  outcome: z.enum(["applied", "duplicate", "superseded"]),
}).strict();
export type EnrichmentReceipt = z.infer<typeof enrichmentReceiptSchema>;

export function receiptFor(event: EnrichmentEnvelope, outcome: EnrichmentReceipt["outcome"]): EnrichmentReceipt {
  return { schemaVersion: ENRICHMENT_VERSION, eventKey: event.eventKey,
    caseId: event.payload.caseId, shipmentId: event.payload.shipmentId,
    sourceHash: event.payload.sourceHash, outcome };
}

export function validHmacKey(key: string | undefined): key is string {
  return Boolean(key && /^[a-fA-F0-9]{64}$/.test(key));
}
function hmac(key: string, value: string) {
  if (!validHmacKey(key)) throw new Error("ENRICHMENT_CONFIG_INVALID");
  return createHmac("sha256", Buffer.from(key, "hex")).update(value).digest("hex");
}
function equalSignature(actual: string | null, expected: string) {
  return Boolean(actual && /^[a-f0-9]{64}$/.test(actual) &&
    timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex")));
}
function requestSignature(body: string, key: string, timestamp: string, nonce: string) {
  return hmac(key, `alc-pnr-enrichment:v2\nPOST\n${ENRICHMENT_PATH}\n${timestamp}\n${nonce}\n${sha256(body)}`);
}
export function enrichmentHeaders(body: string, key: string, nonce: string = randomUUID(), now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000));
  return {
    "content-type": "application/json",
    "x-alc-enrichment-version": String(ENRICHMENT_VERSION),
    "x-alc-enrichment-timestamp": timestamp,
    "x-alc-enrichment-nonce": nonce,
    "x-alc-enrichment-signature": requestSignature(body, key, timestamp, nonce),
  };
}
export function authenticateEnrichment(headers: Headers, body: string, key: string, now = Date.now()) {
  const timestamp = headers.get("x-alc-enrichment-timestamp") || "";
  const nonce = headers.get("x-alc-enrichment-nonce") || "";
  const age = now - Number(timestamp) * 1000;
  if (headers.get("x-alc-enrichment-version") !== String(ENRICHMENT_VERSION) ||
      !/^\d{10}$/.test(timestamp) || age > 300_000 || age < -30_000 ||
      !z.uuid().safeParse(nonce).success ||
      !equalSignature(headers.get("x-alc-enrichment-signature"), requestSignature(body, key, timestamp, nonce)))
    throw new Error("ENRICHMENT_UNAUTHENTICATED");
  return { nonce, timestamp: new Date(Number(timestamp) * 1000).toISOString() };
}
export function responseSignature(body: string, nonce: string, key: string) {
  return hmac(key, `alc-pnr-enrichment-response:v2\n${nonce}\n${sha256(body)}`);
}
export function confirmedReceipt(body: string, signature: string | null, nonce: string, key: string, event: EnrichmentEnvelope) {
  if (!equalSignature(signature, responseSignature(body, nonce, key)))
    throw new Error("ENRICHMENT_CONFIRMATION_INVALID");
  const receipt = enrichmentReceiptSchema.parse(JSON.parse(body));
  if (receipt.eventKey !== event.eventKey || receipt.caseId !== event.payload.caseId ||
      receipt.shipmentId !== event.payload.shipmentId || receipt.sourceHash !== event.payload.sourceHash)
    throw new Error("ENRICHMENT_CONFIRMATION_INVALID");
  return receipt;
}

export async function boundedBody(message: Request | Response, signal?: AbortSignal) {
  const declared = message.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > ENRICHMENT_BODY_LIMIT))
    throw new Error("ENRICHMENT_BODY_TOO_LARGE");
  const reader = message.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abort = () => { void reader.cancel().catch(() => undefined); reject(new Error("ENRICHMENT_TIMEOUT")); };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    for (;;) {
      const chunk = await Promise.race([reader.read(), aborted]);
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > ENRICHMENT_BODY_LIMIT) throw new Error("ENRICHMENT_BODY_TOO_LARGE");
      chunks.push(chunk.value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
    void reader.cancel().catch(() => undefined);
  }
}
