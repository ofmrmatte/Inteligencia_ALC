import { z } from "zod";
import { HttpError } from "./auth";
import { boundedBytes } from "./media-validation";
import { listStepUpFactors } from "./mfa-step-up";

const MAX_JSON_BYTES = 8 * 1024;
export const CREDENTIAL_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, noarchive",
};
const boundedPayload = z.unknown().superRefine((value, context) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  for (const name of ["token", "apiKey"])
    if (
      typeof record[name] === "string" &&
      new TextEncoder().encode(record[name]).byteLength > 3 * 1024
    )
      context.addIssue({ code: "custom", message: "Credencial muito grande." });
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
function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: CREDENTIAL_HEADERS },
    );
  return Response.json(
    {
      error:
        error instanceof z.ZodError
          ? "Dados invalidos. Revise os campos informados."
          : "Operacao de credenciais indisponivel.",
    },
    {
      status: error instanceof z.ZodError ? 400 : 503,
      headers: CREDENTIAL_HEADERS,
    },
  );
}
export async function credentialFactors() {
  try {
    return Response.json(
      { factors: await listStepUpFactors() },
      { headers: CREDENTIAL_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function credentialRequest(
  request: Request,
  handlers: {
    challenge: (input: unknown) => Promise<unknown>;
    verify: (input: unknown) => Promise<unknown>;
    execute: (input: unknown) => Promise<unknown>;
  },
) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new HttpError(403, "Origem da requisicao invalida.");
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES))
      throw new HttpError(413, "Lote muito grande.");
    let input: unknown;
    try {
      input = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await boundedBytes(request.body, MAX_JSON_BYTES),
        ),
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "JSON invalido.");
    }
    const { action, ...body } = actionSchema.parse(input);
    try {
      return Response.json(await handlers[action](body), {
        headers: CREDENTIAL_HEADERS,
      });
    } catch (error) {
      if (
        action === "verify" &&
        error instanceof HttpError &&
        error.status === 401 &&
        [
          "Codigo MFA invalido ou expirado.",
          "Desafio invalido ou expirado.",
        ].includes(error.message)
      )
        return Response.json(
          { error: error.message },
          { status: 422, headers: CREDENTIAL_HEADERS },
        );
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
