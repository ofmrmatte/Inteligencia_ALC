import { z } from "zod";
import { HttpError } from "@/lib/auth";
import {
  createChannelCredentialChallenge,
  executeChannelCredential,
  verifyChannelCredential,
} from "@/lib/channel-credentials";
import { boundedBytes } from "@/lib/media-validation";
import { listStepUpFactors } from "@/lib/mfa-step-up";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JSON_BYTES = 8 * 1024;
const MAX_PLAINTEXT_TOKEN_BYTES = 3 * 1024;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, noarchive",
};

const boundedPayload = z.unknown().superRefine((value, context) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const token = (value as Record<string, unknown>).token;
  if (
    typeof token === "string" &&
    new TextEncoder().encode(token).byteLength > MAX_PLAINTEXT_TOKEN_BYTES
  )
    context.addIssue({ code: "custom", message: "Token muito grande." });
});

const actionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("challenge"),
      payload: boundedPayload,
      factorId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("verify"),
      payload: boundedPayload,
      factorId: z.uuid(),
      challengeId: z.uuid(),
      nonce: z.string(),
      code: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal("execute"),
      payload: boundedPayload,
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
    return Response.json({ error: error.message }, { status: error.status, headers: PRIVATE_HEADERS });
  if (error instanceof z.ZodError)
    return Response.json(
      { error: "Dados invalidos. Revise os campos informados." },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  return Response.json(
    { error: "Operacao de credenciais indisponivel." },
    { status: 503, headers: PRIVATE_HEADERS },
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
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES))
      throw new HttpError(413, "Lote muito grande.");
    let raw: string;
    try {
      raw = new TextDecoder("utf-8", { fatal: true }).decode(
        await boundedBytes(request.body, MAX_JSON_BYTES),
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "JSON invalido.");
    }
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
        { headers: PRIVATE_HEADERS },
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
          { headers: PRIVATE_HEADERS },
        );
      } catch (error) {
        if (credentialVerificationError(error))
          return Response.json({ error: error.message }, { status: 422, headers: PRIVATE_HEADERS });
        throw error;
      }
    }
    const result = await executeChannelCredential({
      payload: body.payload,
      proofId: body.proofId,
    });
    return Response.json(
      result,
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
