import { createHash } from "node:crypto";

export type EvidenceMessage = {
  id: string;
  provider_id: string | null;
  direction: "in" | "out" | "note";
  body: string;
  type: string;
  status: string;
  created_at: string | Date;
  attachment?: unknown;
};

export function validateEvidence(
  conversation: { status: string; phone: string },
  messages: readonly EvidenceMessage[],
  hasMore = false,
): string | null {
  if (conversation.status !== "resolved")
    return "Resolva a tratativa antes de gerar o comprovante.";
  if (hasMore || messages.length > 100)
    return "Histórico muito longo para um único comprovante; exportação integral ainda não disponível.";
  if (messages.length < 3 || !messages.some((m) => m.direction === "in") ||
      !messages.some((m) => m.direction === "out"))
    return "A tratativa precisa conter início, interação e conclusão confirmados.";
  for (const message of messages) {
    if (message.direction === "note" || !message.provider_id)
      return "O comprovante não pode conter notas internas nem envios sem confirmação do provedor.";
    if (message.type !== "text" || message.attachment)
      return "A conversa contém mídia ou anexos ainda não suportados na exportação integral.";
    if (!message.body?.trim() || /^\[Modelo:/i.test(message.body.trim()))
      return "O texto original de um modelo Meta não está preservado nesta conversa.";
    if (message.direction === "out" && !["sent", "delivered", "read"].includes(message.status))
      return "Existem mensagens enviadas cuja entrega ao provedor não foi confirmada.";
    if (!Number.isFinite(new Date(message.created_at).getTime()))
      return "O histórico contém uma data inválida.";
  }
  return null;
}

export function evidenceFingerprint(
  phone: string,
  caseId: string,
  messages: readonly EvidenceMessage[],
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      phone,
      caseId,
      messages: messages.map((m) => [m.id, m.provider_id, m.direction, m.body, m.type, m.status, new Date(m.created_at).toISOString()]),
    }))
    .digest("hex");
}
