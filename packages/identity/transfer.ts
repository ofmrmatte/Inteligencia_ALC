import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
function key(value: string) {
  const buffer = Buffer.from(value, "hex");
  if (buffer.length !== 32)
    throw new Error("Chave de acesso entre aplicações não configurada.");
  return buffer;
}
export function sealSession(
  session: { access_token: string; refresh_token: string },
  secret: string,
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  return [
    iv.toString("hex"),
    cipher.update(JSON.stringify(session), "utf8", "hex") + cipher.final("hex"),
    cipher.getAuthTag().toString("hex"),
  ].join(":");
}
export function openSession(value: string, secret: string) {
  const [iv, body, tag] = value.split(":"),
    decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      Buffer.from(iv, "hex"),
    );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return JSON.parse(
    decipher.update(body, "hex", "utf8") + decipher.final("utf8"),
  ) as { access_token: string; refresh_token: string };
}
export function newTicket() {
  return randomBytes(32).toString("hex");
}
export function ticketHash(ticket: string) {
  return createHash("sha256").update(ticket).digest("hex");
}

// Records that this Supabase session entered through the authenticated panel.
// It carries no tokens or permissions and cannot establish a session by itself.
export const ENTRY_COOKIE = "alc_atendimento_entry";
export const ENTRY_SECONDS = 12 * 60 * 60;
export function entryReceipt(
  profileId: string,
  sessionId: string,
  secret: string,
  now = Date.now(),
) {
  if (!profileId || !sessionId) throw new Error("Sessão central inválida.");
  const body = Buffer.from(
    JSON.stringify({
      profileId,
      sessionId,
      expiresAt: now + ENTRY_SECONDS * 1000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", key(secret))
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}
export function validEntryReceipt(
  value: string | undefined,
  secret: string,
  claims: { sub?: unknown; session_id?: unknown },
  now = Date.now(),
) {
  try {
    if (
      !value ||
      typeof claims.sub !== "string" ||
      typeof claims.session_id !== "string"
    )
      return false;
    const parts = value.split(".");
    if (parts.length !== 2) return false;
    const [body, signature] = parts;
    const expected = createHmac("sha256", key(secret)).update(body).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return false;
    const receipt = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return (
      receipt.profileId === claims.sub &&
      receipt.sessionId === claims.session_id &&
      typeof receipt.expiresAt === "number" &&
      Number.isFinite(receipt.expiresAt) &&
      receipt.expiresAt > now
    );
  } catch {
    return false;
  }
}
