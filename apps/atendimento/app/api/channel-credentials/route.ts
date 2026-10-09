import { z } from "zod";
import { HttpError } from "@/lib/auth";
import {
  createChannelCredentialChallenge,
  executeChannelCredential,
  verifyChannelCredential,
} from "@/lib/channel-credentials";
import { listStepUpFactors } from "@/lib/mfa-step-up";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("challenge"),
      payload: z.unknown(),
      factorId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("verify"),
      payload: z.unknown(),
      factorId: z.uuid(),
      challengeId: z.uuid(),
      nonce: z.string(),
      code: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal("execute"),
      payload: z.unknown(),
      proofId: z.uuid(),
    })
    .strict(),
]);

function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new HttpError(403, "Origem da requisicao invalida.");
}

function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return Response.json(
      { error: "Dados invalidos. Revise os campos informados." },
      { status: 400 },
    );
  return Response.json(
    { error: "Operacao de credenciais indisponivel." },
    { status: 503 },
  );
}

function credentialVerificationError(error: unknown): error is HttpError {
  return (
    error instanceof HttpError &&
    error.status === 401 &&
    (error.message === "Codigo MFA invalido ou expirado." ||
      error.message === "Desafio invalido ou expirado.")
  );
}

export async function GET() {
  try {
    return Response.json(
      { factors: await listStepUpFactors() },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const raw = await request.text();
    if (raw.length > 100_000) throw new HttpError(413, "Lote muito grande.");
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "JSON invalido.");
    }
    const body = actionSchema.parse(input);
    if (body.action === "challenge")
      return Response.json(
        await createChannelCredentialChallenge({
          payload: body.payload,
          factorId: body.factorId,
        }),
      );
    if (body.action === "verify") {
      try {
        return Response.json(
          await verifyChannelCredential({
            payload: body.payload,
            factorId: body.factorId,
            challengeId: body.challengeId,
            nonce: body.nonce,
            code: body.code,
          }),
        );
      } catch (error) {
        if (credentialVerificationError(error))
          return Response.json({ error: error.message }, { status: 422 });
        throw error;
      }
    }
    const result = await executeChannelCredential({
      payload: body.payload,
      proofId: body.proofId,
    });
    return Response.json(
      result,
      "verifyToken" in result
        ? {
            headers: {
              "Cache-Control": "private, no-store, max-age=0",
              Pragma: "no-cache",
              "X-Robots-Tag": "noindex, noarchive",
              "X-Content-Type-Options": "nosniff",
            },
          }
        : undefined,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
