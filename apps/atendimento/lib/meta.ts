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
export function decrypt(value: string) {
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
  raw: string | Buffer,
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
const GRAPH_RESPONSE_LIMIT = 262144;
const GRAPH_RESPONSE_ERROR = "Meta: resposta inválida, incompleta, indisponível ou acima do limite.";

async function readGraphResponse(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error(GRAPH_RESPONSE_ERROR);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const header = response.headers.get("content-length");
    const declared = header === null ? null : Number(header);
    if (header !== null && (!/^\d+$/.test(header) || !Number.isSafeInteger(declared) || declared! > GRAPH_RESPONSE_LIMIT))
      throw new Error(GRAPH_RESPONSE_ERROR);
    const bytes = new Uint8Array(GRAPH_RESPONSE_LIMIT);
    let size = 0;
    while (true) {
      if (signal.aborted) throw new Error(GRAPH_RESPONSE_ERROR);
      const { value, done } = await reader.read();
      if (signal.aborted) throw new Error(GRAPH_RESPONSE_ERROR);
      if (done) break;
      if (value.byteLength > GRAPH_RESPONSE_LIMIT - size) throw new Error(GRAPH_RESPONSE_ERROR);
      bytes.set(value, size);
      size += value.byteLength;
    }
    // Fetch decodes compressed bodies, whose Content-Length measures compressed bytes.
    const encoding = response.headers.get("content-encoding");
    if (declared !== null && (!encoding || encoding === "identity") && size !== declared)
      throw new Error(GRAPH_RESPONSE_ERROR);
    const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(GRAPH_RESPONSE_ERROR);
    return data;
  } catch {
    cancel();
    throw new Error(GRAPH_RESPONSE_ERROR);
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
export async function graph(
  config: ChannelConfig,
  path: string,
  body?: unknown,
) {
  if (!config.token) throw new Error("Canal não configurado.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response, data;
  try {
    response = await fetch(
      `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v24.0"}/${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${config.token}`,
          ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: controller.signal,
      },
    );
    data = await readGraphResponse(response, controller.signal);
  } catch {
    throw new Error(GRAPH_RESPONSE_ERROR);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok)
    throw new Error(
      `Meta ${response.status} (${Number.isInteger(data.error?.code) ? data.error.code : "API"}): Falha na integração.`,
    );
  return data;
}
export async function templates(channel: Channel, config?: ChannelConfig): Promise<MetaTemplate[]> {
  const cfg = config ?? await channelConfig(channel);
  const data = await graph(
    cfg,
    `${cfg.wabaId}/message_templates?fields=id,name,status,language,category,parameter_format,components&limit=100`,
  );
  const { parseTemplateCatalog } = await import("./template-contract");
  return parseTemplateCatalog(data?.data);
}
export function templateContentVersion(template: MetaTemplate) {
  return createHash("sha256").update(JSON.stringify(template)).digest("hex");
}
