import { createHash } from "node:crypto";
import { extname } from "node:path";
import { createConnection } from "node:net";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { read as readCompound } from "cfb";
import { HttpError } from "./auth";

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MB = 1024 * 1024;
const formats: Record<
  string,
  { extensions: string[]; type: string; limit: number }
> = {
  "image/jpeg": { extensions: ["jpg", "jpeg"], type: "image", limit: 5 * MB },
  "image/png": { extensions: ["png"], type: "image", limit: 5 * MB },
  "image/webp": { extensions: ["webp"], type: "sticker", limit: 500 * 1024 },
  "audio/aac": { extensions: ["aac"], type: "audio", limit: 16 * MB },
  "audio/amr": { extensions: ["amr"], type: "audio", limit: 16 * MB },
  "audio/mpeg": { extensions: ["mp3"], type: "audio", limit: 16 * MB },
  "audio/mp4": { extensions: ["m4a"], type: "audio", limit: 16 * MB },
  "audio/ogg": { extensions: ["ogg", "opus"], type: "audio", limit: 16 * MB },
  "video/mp4": { extensions: ["mp4"], type: "video", limit: 16 * MB },
  "video/3gpp": { extensions: ["3gp"], type: "video", limit: 16 * MB },
  "application/pdf": {
    extensions: ["pdf"],
    type: "document",
    limit: MAX_MEDIA_BYTES,
  },
  "text/plain": {
    extensions: ["txt"],
    type: "document",
    limit: MAX_MEDIA_BYTES,
  },
  "application/msword": {
    extensions: ["doc"],
    type: "document",
    limit: MAX_MEDIA_BYTES,
  },
  "application/vnd.ms-excel": {
    extensions: ["xls"],
    type: "document",
    limit: MAX_MEDIA_BYTES,
  },
  "application/vnd.ms-powerpoint": {
    extensions: ["ppt"],
    type: "document",
    limit: MAX_MEDIA_BYTES,
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    extensions: ["docx"],
    type: "document",
    limit: MAX_MEDIA_BYTES,
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    extensions: ["xlsx"],
    type: "document",
    limit: MAX_MEDIA_BYTES,
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    extensions: ["pptx"],
    type: "document",
    limit: MAX_MEDIA_BYTES,
  },
};
export function mediaFilename(value: string) {
  const name = value.trim().normalize("NFC");
  if (
    !name ||
    name.length > 180 ||
    /[\u0000-\u001f\u007f/\\:<>"|?*]/.test(name) ||
    name.includes("..") ||
    /[. ]$/.test(name)
  )
    throw new HttpError(400, "Nome de arquivo inválido.");
  return name;
}
export function receivedFilename(name: string | undefined, mime: string) {
  return mediaFilename(
    name || `anexo.${formats[mime]?.extensions[0] || "bin"}`,
  );
}
export async function boundedBytes(
  stream: ReadableStream<Uint8Array> | null,
  maximum = MAX_MEDIA_BYTES,
) {
  if (!stream) throw new HttpError(400, "Arquivo vazio.");
  const reader = stream.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 30_000);
  let completed = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        completed = true;
        break;
      }
      size += chunk.value.byteLength;
      if (size > maximum)
        throw new HttpError(413, "Arquivo excede o limite permitido.");
      parts.push(chunk.value);
    }
    if (timedOut) throw new HttpError(408, "Tempo de upload excedido.");
    if (!size) throw new HttpError(400, "Arquivo vazio.");
    return Buffer.concat(parts, size);
  } finally {
    clearTimeout(timeout);
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function validateMedia(
  bytes: Buffer,
  filename: string,
  declaredMime: string,
) {
  mediaFilename(filename);
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES)
    throw new HttpError(413, "Tamanho de arquivo inválido.");
  const detected = await fileTypeFromBuffer(bytes);
  let mime = detected?.mime || "";
  const declared = declaredMime.split(";")[0].trim().toLowerCase();
  if (mime === "application/x-cfb") {
    try {
      const compound = readCompound(bytes, { type: "buffer", WTF: true });
      if (
        compound.FullPaths.some((path) =>
          /(?:VBA|EncryptedPackage|EncryptionInfo)/i.test(path),
        )
      )
        throw new Error("Unsafe Office document");
      const office = [
        ["WordDocument", "application/msword"],
        ["Workbook", "application/vnd.ms-excel"],
        ["Book", "application/vnd.ms-excel"],
        ["PowerPoint Document", "application/vnd.ms-powerpoint"],
      ];
      const matching = office.filter(([name]) =>
        compound.FileIndex.some(
          (entry) => entry.type === 2 && entry.name === name && entry.size > 0,
        ),
      );
      if (matching.length !== 1) throw new Error("Ambiguous document");
      mime = matching[0][1];
    } catch {
      throw new HttpError(
        415,
        "Documento Office inválido, cifrado ou com macros.",
      );
    }
  }
  // MP4 is a shared container; distinguish audio by its declared MIME and extension.
  if (
    mime === "video/mp4" &&
    declared === "audio/mp4" &&
    extname(filename).toLowerCase() === ".m4a"
  )
    mime = "audio/mp4";
  if (!detected && declared === "text/plain") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
        mime = "text/plain";
    } catch {
      /* Invalid UTF-8 is not a text document. */
    }
  }
  const format = formats[mime];
  if (
    !format ||
    declared !== mime ||
    !format.extensions.includes(extname(filename).slice(1).toLowerCase())
  )
    throw new HttpError(
      415,
      "Conteúdo, extensão ou formato do arquivo incompatível.",
    );
  if (bytes.length > format.limit)
    throw new HttpError(413, "Arquivo excede o limite deste formato.");
  if (format.type === "image" || format.type === "sticker") {
    try {
      const image = sharp(bytes, {
        limitInputPixels: 25_000_000,
        animated: true,
      });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || (metadata.pages || 1) > 100)
        throw new Error("Dimensions");
      await image.stats();
    } catch {
      throw new HttpError(
        415,
        "Imagem inválida ou grande demais para visualização segura.",
      );
    }
  }
  return {
    mime,
    type: format.type,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
export function safeMetaMediaUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !["lookaside.fbsbx.com", "lookaside.facebook.com"].includes(url.hostname)
  )
    throw new HttpError(400, "Origem de mídia não autorizada.");
  return url;
}
export function scanMedia(
  bytes: Buffer,
): Promise<"clean" | "infected" | "unavailable"> {
  const host = process.env.ATENDIMENTO_CLAMAV_HOST;
  if (!host) return Promise.resolve("unavailable");
  return new Promise((resolve) => {
    const socket = createConnection({ host, port: 3310 });
    let response = Buffer.alloc(0),
      settled = false;
    const deadline = setTimeout(() => finish("unavailable"), 20_000);
    const finish = (result: "clean" | "infected" | "unavailable") => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(20_000, () => finish("unavailable"));
    socket.on("error", () => finish("unavailable"));
    socket.on("close", () => finish("unavailable"));
    socket.on("connect", () => {
      const size = Buffer.alloc(4);
      size.writeUInt32BE(bytes.length);
      void (async () => {
        const write = (chunk: Buffer) =>
          new Promise<void>((resolve, reject) =>
            socket.write(chunk, (error) => (error ? reject(error) : resolve())),
          );
        await write(Buffer.concat([Buffer.from("zINSTREAM\0"), size]));
        for (
          let offset = 0;
          offset < bytes.length && !settled;
          offset += 64 * 1024
        )
          await write(bytes.subarray(offset, offset + 64 * 1024));
        if (!settled) await write(Buffer.alloc(4));
      })().catch(() => finish("unavailable"));
    });
    socket.on("data", (chunk) => {
      response = Buffer.concat([
        response,
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
      ]);
      if (response.length > 4096) return finish("unavailable");
      const end = response.indexOf(0);
      if (end < 0) return;
      const result = response.subarray(0, end).toString();
      finish(
        result === "stream: OK"
          ? "clean"
          : /^stream: .+ FOUND$/.test(result)
            ? "infected"
            : "unavailable",
      );
    });
  });
}
