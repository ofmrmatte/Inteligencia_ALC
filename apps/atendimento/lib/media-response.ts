import type { AuthProfile } from "@alc/identity/auth";
import { HttpError } from "./auth";
import { mediaAccess } from "./media-service";
export async function mediaResponse(
  profile: AuthProfile,
  mediaId: string,
  request: Request,
) {
  const query = new URL(request.url).searchParams;
  const { metadata, bytes } = await mediaAccess(
    profile,
    mediaId,
    query.get("status") === "true",
  );
  if (!bytes)
    return Response.json(metadata, {
      headers: { "Cache-Control": "private, no-store" },
    });
  const headers = new Headers({
    "Content-Type": metadata.mime,
    "Content-Disposition": `${query.get("download") === "true" || (metadata.type === "document" && metadata.mime !== "application/pdf") ? "attachment" : "inline"}; filename="anexo"; filename*=UTF-8''${encodeURIComponent(metadata.filename)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Accept-Ranges": "bytes",
  });
  const range = request.headers.get("range");
  let start = 0,
    end = bytes.length - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      throw new HttpError(416, "Intervalo de arquivo inválido.");
    if (!match[1]) start = Math.max(0, bytes.length - Number(match[2]));
    else {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), end) : end;
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start < 0
    )
      throw new HttpError(416, "Intervalo de arquivo inválido.");
    headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
    status: range ? 206 : 200,
    headers,
  });
}
