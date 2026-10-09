import { z } from "zod";
import { currentProfile, HttpError } from "@/lib/auth";
import { reserveUpload, finishUpload, failMedia } from "@/lib/media-service";
import { boundedBytes, MAX_MEDIA_BYTES } from "@/lib/media-validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  let reservation: Awaited<ReturnType<typeof reserveUpload>> | undefined;
  try {
    const profile = await currentProfile(),
      query = new URL(request.url).searchParams;
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_MEDIA_BYTES))
      throw new HttpError(413, "Arquivo excede 25 MB.");
    reservation = await reserveUpload(profile, {
      id: query.get("id"),
      conversationId: query.get("conversationId"),
      filename: query.get("filename"),
      mime: request.headers.get("content-type") || "",
    });
    const bytes = await boundedBytes(request.body);
    const result = await finishUpload(
      reservation,
      bytes,
      request.headers.get("content-type") || "",
    );
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (reservation) await failMedia(reservation.id, error);
    return Response.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "Upload indisponível. Nenhuma mensagem foi enviada.",
      },
      {
        status:
          error instanceof HttpError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
