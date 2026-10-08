import { ImageResponse } from "next/og";
import { z } from "zod";
import { currentProfile, scopeFor, visible } from "@/lib/auth";
import { audit, db } from "@/lib/db";
import { evidenceFingerprint, validateEvidence, type EvidenceMessage } from "@/lib/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const timeLabel = (value: string | Date) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
  });
const dateLabel = (value: string | Date) =>
  new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const failed = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await currentProfile();
  const parsed = z.string().uuid().safeParse((await params).id);
  if (!parsed.success) return failed("Conversa inválida.", 400);
  const result = await db().query(
    "SELECT id,phone,channel,status,case_id,base_key,sigla FROM alc_atendimento.conversations WHERE id=$1",
    [parsed.data],
  );
  const conversation = result.rows[0];
  if (!conversation || !visible(await scopeFor(profile), conversation))
    return failed("Conversa não encontrada.", 404);
  if (conversation.channel !== "client")
    return failed("O comprovante de tratativa do cliente está disponível somente no canal de clientes.", 422);
  if (!conversation.case_id)
    return failed("A conversa ainda não está vinculada a uma PNR.", 422);
  const resultMessages = await db().query(
    `SELECT id,provider_id,direction,body,type,status,created_at,attachment
     FROM alc_atendimento.messages
     WHERE conversation_id=$1 ORDER BY created_at ASC,id ASC LIMIT 102`,
    [parsed.data],
  );
  const all = resultMessages.rows as EvidenceMessage[];
  // Never silently crop a conversation: omitted messages would misrepresent the actual treatment.
  const reason = validateEvidence(conversation, all, all.length > 100);
  if (reason) return failed(reason, 422);
  const height = 186 + all.reduce((sum, message) =>
    sum + 38 + Math.ceil(message.body.length / 42) * 21 +
      (message.body.match(/\n/g)?.length || 0) * 19, 0) + 104;
  if (height > 7800)
    return failed("O histórico excede a altura suportada por uma única imagem; não será cortado.", 422);
  const fingerprint = evidenceFingerprint(conversation.phone, conversation.case_id, all);
  await audit(profile.id, "evidence_export", parsed.data, {
    caseId: conversation.case_id,
    count: all.length,
    sha256: fingerprint,
  });

  const image = (
    <div style={{
      width: 900, height, display: "flex", flexDirection: "column",
      backgroundColor: "#eae6df", color: "#111b21",
      fontFamily: "Arial, sans-serif", fontSize: 19,
    }}>
      <div style={{
        height: 86, flexShrink: 0, display: "flex", alignItems: "center",
        gap: 16, padding: "15px 25px", backgroundColor: "#f0f2f5",
        borderBottom: "1px solid #d5dfe3",
      }}>
        <div style={{
          width: 50, height: 50, display: "flex", alignItems: "center",
          justifyContent: "center", borderRadius: 50,
          backgroundColor: "#dfe5e7", color: "#5f6f76", fontSize: 25,
        }}>●</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 23, fontWeight: 700 }}>+{conversation.phone}</span>
          <span style={{ fontSize: 14, color: "#667781" }}>Conversa de atendimento · Cliente</span>
        </div>
      </div>
      <div style={{
        padding: "20px 45px", display: "flex", flexDirection: "column", gap: 10,
        flexGrow: 1, backgroundColor: "#efeae2",
      }}>
        <div style={{
          display: "flex", alignSelf: "center", padding: "6px 14px",
          borderRadius: 8, backgroundColor: "#fff", fontSize: 14, color: "#54656f",
        }}>Tratativa de {dateLabel(all[0].created_at)} a {dateLabel(all[all.length - 1].created_at)}</div>
        {all.map((message) => (
          <div key={message.id} style={{
            display: "flex", flexDirection: "column",
            alignSelf: message.direction === "out" ? "flex-end" : "flex-start",
            backgroundColor: message.direction === "out" ? "#d9fdd3" : "#fff",
            borderRadius: 9, maxWidth: 685, minWidth: 140,
            padding: "11px 15px 8px", gap: 8,
          }}>
            <div style={{
              display: "flex", whiteSpace: "pre-wrap",
              overflowWrap: "break-word", lineHeight: 1.35,
              fontSize: 18,
            }}>{message.body}</div>
            <div style={{
              display: "flex", alignSelf: "flex-end", gap: 9,
              fontSize: 12, color: "#667781",
            }}>
              <span>{dateLabel(message.created_at)} {timeLabel(message.created_at)}</span>
              {message.direction === "out" ? (
                <span>{message.status === "read" ? "✓✓ Lida" :
                  message.status === "delivered" ? "✓✓ Entregue" : "✓ Enviada"}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 5, padding: "16px 24px",
        backgroundColor: "#f0f2f5", borderTop: "1px solid #d5dfe3",
        fontSize: 13, color: "#47555e",
      }}>
        <span>Registro visual do ALC Atendimento · Mensagens verificadas na integração Meta</span>
        <span>Reconstituição visual, não captura nativa do WhatsApp Web · Caso {conversation.case_id}</span>
        <span>Integridade SHA-256: {fingerprint}</span>
      </div>
    </div>
  );
  return new ImageResponse(image, {
    width: 900,
    height,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="tratativa-${conversation.case_id}.png"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
