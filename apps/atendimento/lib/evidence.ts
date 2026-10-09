import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import sharp from "sharp";
const resolveModule=createRequire(import.meta.url).resolve.bind(null);
const fontfile=join(dirname(resolveModule("next/package.json")),"dist/compiled/@vercel/og/Geist-Regular.ttf");

export type EvidenceMedia = {
  id: string; message_id: string; case_id: string | null;
  filename: string; mime: string; type: string; size: number; sha256: string; status: string;
};

export type EvidenceMessage = {
  id: string;
  provider_id: string | null;
  direction: "in" | "out" | "note";
  body: string;
  type: string;
  status: string;
  created_at: string | Date;
  attachment?: unknown;
  case_id?: string | null;
  media?: EvidenceMedia | null;
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
  if (messages.reduce((size, m) => size + m.body.length, 0) > 160_000)
    return "O histórico excede o limite de processamento integral. Nenhuma mensagem será omitida.";
  for (const message of messages) {
    if (message.direction === "note" || !message.provider_id)
      return "O comprovante não pode conter notas internas nem envios sem confirmação do provedor.";
    if (message.type !== "text" || message.attachment || message.media) {
      const media = message.media;
      if (!media || !["image", "audio", "video", "document", "sticker"].includes(message.type) ||
          media.type !== message.type || media.message_id !== message.id || !media.case_id ||
          media.case_id !== message.case_id || media.status !== "ready" || media.size <= 0 ||
          !/^[a-f0-9]{64}$/.test(media.sha256))
        return "A mídia precisa estar arquivada, verificada e vinculada à mensagem e à PNR.";
    }
    if ((!message.body?.trim() && !message.media) || /^\[Modelo:/i.test(message.body.trim()))
      return "O texto original de um modelo Meta não está preservado nesta conversa.";
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(message.body))
      return "O histórico contém texto inválido para exportação integral.";
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
      messages: messages.map((m) => {
        const source: unknown[] = [m.id, m.provider_id, m.direction, m.body, m.type, m.status, new Date(m.created_at).toISOString()];
        if (m.media) source.push([m.media.id, m.media.message_id, m.media.case_id, m.media.filename, m.media.mime, m.media.type, m.media.size, m.media.sha256]);
        return source;
      }),
    }))
    .digest("hex");
}

type Raster = { src: string; width: number; height: number };
export type EvidenceSlice = {
  message: EvidenceMessage; text: string; section: number; sections: number; lines: number;
  raster: Raster; height: number; media?: EvidenceMedia; thumbnail?: Raster;
};
export type EvidencePage = { segments: EvidenceSlice[]; first: string; last: string; height: number };
const escapeMarkup = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function rasterText(text: string): Promise<Raster> {
  if (!text.trim()) {
    const height = Math.max(21, text.split("\n").length * 21);
    const data = await sharp({ create: { width: 1, height, channels: 4, background: "#00000000" } }).png().toBuffer();
    return { src: `data:image/png;base64,${data.toString("base64")}`, width: 1, height };
  }
  const { data, info } = await sharp({ text: {
    text: `<span foreground="#111b21">${escapeMarkup(text)}</span>`,
    font: "Arial, Geist 17", fontfile, dpi: 72, width: 644, wrap: "word-char", rgba: true,
  } }).png().toBuffer({ resolveWithObject: true });
  return { src: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height };
}
/** Use the raster's actual dimensions; neither font guesses nor clipped bubbles are evidence. */
export async function splitEvidenceMessage(message: EvidenceMessage): Promise<EvidenceSlice[]> {
  const slices: EvidenceSlice[] = [];
  const parts = [...new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(message.body)].map(p => p.segment);
  let start = 0;
  while (start < parts.length) {
    let count = Math.min(500, parts.length - start);
    let text = parts.slice(start, start + count).join("");
    let raster = await rasterText(text);
    while (raster.height > 200 && count > 1) {
      count = Math.max(1, Math.floor(count / 2));
      text = parts.slice(start, start + count).join("");
      raster = await rasterText(text);
    }
    if (raster.height > 200) throw new Error("Um caractere excede a altura máxima do print.");
    slices.push({ message, text, section: 0, sections: 0, lines: Math.ceil(raster.height / 21), raster, height: 0 });
    start += count;
  }
  return slices.map((slice, index) => ({ ...slice, section: index + 1, sections: slices.length,
    height: slice.raster.height + 43 + (slices.length > 1 ? 21 : 0),
  }));
}
export async function paginateEvidence(
  messages: readonly EvidenceMessage[], maxBodyHeight = 600, originals: ReadonlyMap<string, Buffer> = new Map(),
): Promise<EvidencePage[]> {
  const pages: EvidencePage[]=[];
  let segments:EvidenceSlice[]=[],height=0;
  const flush=()=>{
    if(!segments.length)return;
    pages.push({
      segments,
      first:new Date(segments[0].message.created_at).toISOString(),
      last:new Date(segments[segments.length-1].message.created_at).toISOString(),
      height,
    });
    segments=[];height=0;
  };
  for (const message of messages) {
    const slices = await splitEvidenceMessage(message);
    if (message.media) {
      const media = message.media;
      const bytes = originals.get(media.id);
      if (!bytes || bytes.length !== media.size || createHash("sha256").update(bytes).digest("hex") !== media.sha256)
        throw new Error("Integridade da mídia não confirmada para o comprovante.");
      let thumbnail: Raster | undefined;
      if (["image", "sticker"].includes(media.type)) {
        const { data, info } = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" })
          .autoOrient().resize({ width: 400, height: 200, fit: "inside", withoutEnlargement: true })
          .png().toBuffer({ resolveWithObject: true });
        thumbnail = { src: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height };
      }
      const label = ({ image: "Imagem", sticker: "Figurinha", audio: "Áudio", video: "Vídeo", document: "Documento" } as Record<string, string>)[media.type];
      const raster = await rasterText(`${label}: ${media.filename}\n${media.mime} · ${media.size} bytes\nSHA-256: ${media.sha256}`);
      slices.unshift({ message, text: "", section: 1, sections: 1, lines: 0, media, thumbnail, raster,
        height: raster.height + (thumbnail ? thumbnail.height + 6 : 0) + 43 });
    }
    for (const slice of slices) {
    const size=slice.height;
    if(size>maxBodyHeight)throw new Error("Um trecho excede a altura máxima do print.");
    if(height+size>maxBodyHeight)flush();
    segments.push(slice);height+=size;
    }
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
