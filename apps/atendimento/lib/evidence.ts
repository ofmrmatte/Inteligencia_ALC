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
  if (hasMore || messages.length > 500)
    return "O histórico excede o limite de 500 mensagens para uma exportação integral. Nenhuma mensagem será omitida.";
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

export type EvidenceSlice = { message: EvidenceMessage; text: string; section: number; sections: number; lines: number };
export type EvidencePage = { segments: EvidenceSlice[]; first: string; last: string };
/** Split visual bubbles only, never delete or change their original content. */
export function splitEvidenceMessage(message: EvidenceMessage): EvidenceSlice[] {
  const body = message.body;
  const slices: {text:string;lines:number}[] = [];
  let current = "", lines = 0;
  const flush = () => { if(current){ slices.push({text:current,lines:Math.max(lines,1)}); current="";lines=0; } };
  // Literal lines are preserved. Long lines wrap visually every ~54 characters.
  for (const part of body.split(/(\n)/)) {
    if (part === "\n") { current+="\n"; lines++; if(lines>=10)flush(); continue; }
    if (!part) continue;
    let index=0;
    while(index<part.length) {
      const size=Math.min(54,part.length-index);
      const token=part.slice(index,index+size);
      if(lines>=10)flush();
      current+=token;
      lines++;
      index+=size;
    }
  }
  flush();
  return slices.map((slice,index) => ({
    message, text:slice.text, section:index+1, sections:slices.length, lines:slice.lines,
  }));
}
/** WhatsApp Web-ish viewport 900x840: ~540px of message bubbles per image. */
export function paginateEvidence(messages: readonly EvidenceMessage[], maxBodyHeight=535): EvidencePage[] {
  const pages: EvidencePage[]=[];
  let segments:EvidenceSlice[]=[],height=0;
  const flush=()=>{
    if(!segments.length)return;
    pages.push({
      segments,
      first:new Date(segments[0].message.created_at).toISOString(),
      last:new Date(segments[segments.length-1].message.created_at).toISOString(),
    });
    segments=[];height=0;
  };
  for(const message of messages)for(const slice of splitEvidenceMessage(message)){
    const size=49 + slice.lines*21 + (slice.sections>1?18:0);
    if(size>maxBodyHeight)throw new Error("Um trecho excede a altura máxima do print.");
    if(height+size>maxBodyHeight)flush();
    segments.push(slice);height+=size;
  }
  flush();
  if(pages.length>80)throw new Error("O histórico precisa de mais de 80 prints; solicite exportação em lotes.");
  // Integrity: no character from a message may be dropped during visual partitioning.
  for(const m of messages){
    const actual=pages.flatMap(p=>p.segments).filter(s=>s.message.id===m.id).map(s=>s.text).join("");
    if(actual!==m.body)throw new Error("Falha de integridade: trecho de conversa incompleto.");
  }
  return pages;
}
