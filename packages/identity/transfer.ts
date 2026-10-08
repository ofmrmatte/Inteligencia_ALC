import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
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
