import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { ImageResponse } from "next/og";
import { renderToStaticMarkup } from "react-dom/server";
import { evidenceFingerprint, paginateEvidence, splitEvidenceMessage, validateEvidence, type EvidenceMessage } from "../lib/evidence";
import { RenderPage } from "../lib/evidence-render";

const row = (body = "Recebido."): EvidenceMessage => ({ id: "synthetic-message", provider_id: "wamid:synthetic",
  case_id: "synthetic-case", direction: "in", body, type: "text", status: "received", created_at: "2026-10-08T12:00:00Z" });
async function imageMessage() {
  const bytes = await sharp({ create: { width: 1000, height: 600, channels: 3, background: "#e30613" } }).png().toBuffer();
  const message = { ...row("Imagem original recebida."), type: "image", attachment: { id: "provider-media" }, media: {
    id: "synthetic-media", message_id: "synthetic-message", case_id: "synthetic-case", filename: "synthetic.png",
    type: "image", mime: "image/png", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), status: "ready",
  } };
  return { bytes, message };
}
describe("media-aware bounded evidence", () => {
  it("accepts only complete confirmed media for the same message and PNR", async () => {
    const { message } = await imageMessage();
    const messages = [row(), message, { ...row("Conclusão."), id: "closing", direction: "out" as const, status: "read" }];
    expect(validateEvidence({ status: "resolved", phone: "5500000000000" }, messages)).toBeNull();
    for (const change of [{ status: "quarantined" }, { sha256: "changed" }, { message_id: "other" }, { case_id: "other" }, { type: "audio" }]) {
      expect(validateEvidence({ status: "resolved", phone: "5500000000000" }, [messages[0], { ...message, media: { ...message.media, ...change } }, messages[2]])).toMatch(/mídia/i);
    }
    expect(evidenceFingerprint("5500000000000", "synthetic-case", messages)).not.toBe(evidenceFingerprint("5500000000000", "synthetic-case", [messages[0], { ...message, media: { ...message.media, sha256: "0".repeat(64) } }, messages[2]]));
  });
  it("splits actual rasters without losing graphemes, markup or whitespace", async () => {
    const body = "WWW & <script> 👩‍💻 中文 é\n".repeat(120) + "\n".repeat(30) + "Fim.";
    const slices = await splitEvidenceMessage(row(body));
    expect(slices.map(s => s.text).join("")).toBe(body);
    expect(slices.every(s => s.raster.height <= 200 && s.raster.width <= 644)).toBe(true);
    expect(slices.every(s => !s.text.startsWith("\u200d") && !s.text.endsWith("\u200d"))).toBe(true);
    expect(slices.length).toBeGreaterThan(2);
    const blank = await splitEvidenceMessage(row("\n".repeat(50)));
    expect(blank.map(s => s.text).join("")).toBe("\n".repeat(50));
  });
  it("renders real 900x840 PNGs with private image thumbnails, provenance and phone-only header", async () => {
    const { message, bytes } = await imageMessage();
    const pages = await paginateEvidence([message, { ...row("Encerramento ".repeat(200)), direction: "out", id: "last", status: "read" }], 600, new Map([[message.media.id, bytes]]));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every(p => p.height <= 600)).toBe(true);
    const element = <RenderPage page={pages[0]} phone="5500000000000" caseId="synthetic-case" pageNumber={1} total={pages.length}/>;
    const html = renderToStaticMarkup(element);
    expect(html).toContain("+5500000000000");
    expect(html).toContain("não captura nativa");
    expect(html).not.toContain("provider-media");
    expect(html).not.toContain("https://");
    const nativeFetch=globalThis.fetch;
    const network = vi.spyOn(globalThis,"fetch").mockImplementation((input,init)=>{
      if(String(input).startsWith("data:"))return nativeFetch(input,init);
      throw new Error("External network forbidden in evidence rendering");
    });
    let png: Buffer;
    try {
      png = Buffer.from(await new ImageResponse(element, { width: 900, height: 840 }).arrayBuffer());
      expect(network.mock.calls.every(([input])=>String(input).startsWith("data:"))).toBe(true);
    } finally { network.mockRestore(); }
    expect(await sharp(png).metadata()).toMatchObject({ width: 900, height: 840, format: "png" });
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let red = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 180 && data[i + 1] < 40 && data[i + 2] < 50) red++;
    expect(red).toBeGreaterThan(20_000);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(message.media.sha256);
  }, 15000);
  it("refuses a missing original or changed bytes rather than emitting an incomplete proof", async () => {
    const { message } = await imageMessage();
    await expect(paginateEvidence([message])).rejects.toThrow(/Integridade/);
    await expect(paginateEvidence([message], 600, new Map([[message.media.id, Buffer.from("changed")]]))).rejects.toThrow(/Integridade/);
  });
  it.each(["audio","video","document"])("preserves verified %s references without fabricating a thumbnail or transcript",async type=>{
    const {message,bytes}=await imageMessage();
    const reference={...message,type,body:"",media:{...message.media,type,filename:`synthetic-${type}`,mime:`application/synthetic-${type}`}};
    const pages=await paginateEvidence([reference],600,new Map([[reference.media.id,bytes]]));
    const slice=pages[0].segments[0];
    expect(slice.media?.sha256).toBe(message.media.sha256);
    expect(slice.thumbnail).toBeUndefined();
    expect(slice.text).toBe("");
    expect(slice.raster.height).toBeGreaterThan(0);
  });
});
