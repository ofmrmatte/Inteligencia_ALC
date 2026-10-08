/**
 * Railway's node-postgres adapter returns TIMESTAMPTZ columns as Date objects.
 * String(date) yields a browser-style value PostgreSQL does not parse reliably
 * (e.g. "Fri Sep 18 2026 01:17:56 GMT+0000 (...)").
 * Convert persisted timestamps back to an unambiguous ISO-8601 UTC string.
 *
 * Reject missing or malformed dates instead of silently resetting the original
 * first_captured_at of an existing PNR event.
 */
export function pnrTimestampIso(value: unknown): string {
  if (!(value instanceof Date) && typeof value !== "string") {
    throw new Error("Timestamp histórico PNR ausente ou inválido.");
  }
  if (typeof value === "string" && (!value.trim() || value.length > 150)) {
    throw new Error("Timestamp histórico PNR vazio ou inválido.");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Timestamp histórico PNR não reconhecido.");
  }
  return date.toISOString();
}
