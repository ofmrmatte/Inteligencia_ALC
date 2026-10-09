import { z } from "zod";
import { currentProfile, HttpError } from "@/lib/auth";
import { mediaResponse } from "@/lib/media-response";
import { verifyMedia } from "@/lib/media-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return await mediaResponse(
      await currentProfile(),
      (await params).id,
      request,
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof HttpError ? error.message : "Anexo indisponível.",
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
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      await verifyMedia(
        await currentProfile(),
        z
          .string()
          .uuid()
          .parse((await params).id),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "Verificação indisponível.",
      },
      {
        status:
          error instanceof HttpError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 503,
      },
    );
  }
}
