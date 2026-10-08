import { channelConfig, validSignature, type Channel } from "@/lib/meta";
import { db } from "@/lib/db";
import { eventKey } from "@/lib/worker";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel } = await params;
  if (!["driver", "client"].includes(channel))
    return new Response("Canal inválido", { status: 404 });
  const cfg = await channelConfig(channel as Channel);
  const query = new URL(request.url).searchParams;
  if (
    query.get("hub.mode") === "subscribe" &&
    cfg.verifyToken &&
    query.get("hub.verify_token") === cfg.verifyToken
  )
    return new Response(query.get("hub.challenge") || "");
  return new Response("Não autorizado", { status: 403 });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel } = await params;
  if (!["driver", "client"].includes(channel))
    return new Response("Canal inválido", { status: 404 });
  const cfg = await channelConfig(channel as Channel);
  if (!cfg.appSecret)
    return new Response("Verificação do canal pendente", { status: 503 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 1_000_000)
    return new Response("Payload excedido", { status: 413 });
  if (
    !validSignature(
      raw,
      request.headers.get("x-hub-signature-256"),
      cfg.appSecret,
    )
  )
    return new Response("Assinatura inválida", { status: 401 });
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Payload inválido", { status: 400 });
  }
  if (
    payload.object !== "whatsapp_business_account" ||
    !Array.isArray(payload.entry)
  )
    return new Response("Evento inválido", { status: 400 });
  await db().query(
    "INSERT INTO alc_atendimento.webhook_events(event_key,channel,payload) VALUES($1,$2,$3) ON CONFLICT(event_key) DO NOTHING",
    [eventKey(raw), channel, payload],
  );
  return new Response("EVENT_RECEIVED");
}
