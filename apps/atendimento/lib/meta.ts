import {
  createHmac,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { setting } from "./db";
export type Channel = "driver" | "client";
export type ChannelConfig = {
  phoneId: string;
  wabaId: string;
  token: string;
  verifyToken: string;
  appSecret: string;
  number: string;
};
export type MetaTemplate = {
  id?: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components: Record<string, unknown>[];
};
const prefixes = { driver: "WHATSAPP_DRIVER", client: "WHATSAPP_CLIENT" };
export function encrypt(value: string) {
  const key = Buffer.from(process.env.ATENDIMENTO_ENCRYPTION_KEY || "", "hex");
  if (key.length !== 32)
    throw new Error("Chave de proteção de credenciais não configurada.");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  return [
    iv.toString("hex"),
    cipher.update(value, "utf8", "hex") + cipher.final("hex"),
    cipher.getAuthTag().toString("hex"),
  ].join(":");
}
function decrypt(value: string) {
  const [iv, data, tag] = value.split(":"),
    key = Buffer.from(process.env.ATENDIMENTO_ENCRYPTION_KEY || "", "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return decipher.update(data, "hex", "utf8") + decipher.final("utf8");
}
export async function channelConfig(channel: Channel): Promise<ChannelConfig> {
  const prefix = prefixes[channel];
  const config = {
    phoneId: process.env[`${prefix}_PHONE_ID`] || "",
    wabaId: process.env[`${prefix}_WABA_ID`] || "",
    token: process.env[`${prefix}_TOKEN`] || "",
    verifyToken: process.env[`${prefix}_VERIFY_TOKEN`] || "",
    appSecret: process.env[`${prefix}_APP_SECRET`] || "",
    number: process.env[`${prefix}_NUMBER`] || "",
  };
  const stored = await setting<
    Partial<ChannelConfig> & {
      tokenEncrypted?: string;
      secretEncrypted?: string;
      verifyEncrypted?: string;
    }
  >(`channel_${channel}`);
  if (stored) {
    Object.assign(config, {
      phoneId: stored.phoneId || config.phoneId,
      wabaId: stored.wabaId || config.wabaId,
      number: stored.number || config.number,
    });
    if (stored.tokenEncrypted) config.token = decrypt(stored.tokenEncrypted);
    if (stored.secretEncrypted)
      config.appSecret = decrypt(stored.secretEncrypted);
    if (stored.verifyEncrypted)
      config.verifyToken = decrypt(stored.verifyEncrypted);
  }
  return config;
}
export function validSignature(
  raw: string,
  signature: string | null,
  secret: string,
) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  return timingSafeEqual(
    Buffer.from(signature.slice(7), "hex"),
    Buffer.from(expected, "hex"),
  );
}
export async function graph(
  config: ChannelConfig,
  path: string,
  body?: unknown,
) {
  if (!config.token) throw new Error("Canal não configurado.");
  const response = await fetch(
    `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v24.0"}/${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `Meta ${response.status} (${Number.isInteger(data.error?.code) ? data.error.code : "API"}): Falha na integração.`,
    );
  return data;
}
export async function templates(channel: Channel) {
  const cfg = await channelConfig(channel);
  const data = await graph(
    cfg,
    `${cfg.wabaId}/message_templates?fields=id,name,status,language,category,components&limit=100`,
  );
  return data.data as MetaTemplate[];
}
export function templateContentVersion(template: MetaTemplate) {
  return createHash("sha256").update(JSON.stringify(template)).digest("hex");
}
