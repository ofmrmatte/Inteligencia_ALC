import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  factors: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  execute: vi.fn(),
}));
const FACTOR = "33333333-3333-4333-8333-333333333333";
const CHALLENGE = "44444444-4444-4444-8444-444444444444";
const PROOF = "55555555-5555-4555-8555-555555555555";

vi.mock("../lib/mfa-step-up", () => ({ listStepUpFactors: mocks.factors }));
vi.mock("../lib/channel-credentials", () => ({
  createChannelCredentialChallenge: mocks.challenge,
  verifyChannelCredential: mocks.verify,
  executeChannelCredential: mocks.execute,
}));
vi.mock("../lib/ai-credentials", () => ({ createAiCredentialChallenge: mocks.challenge, verifyAiCredential: mocks.verify, executeAiCredential: mocks.execute }));

import { GET, POST } from "../app/api/channel-credentials/route";
import { GET as aiFactors, POST as aiPost } from "../app/api/ai-credentials/route";
import { HttpError } from "../lib/auth";

const payload = {
  operation: "change_webhook_critical",
  channel: "client",
  phoneId: "12345",
  wabaId: "67890",
  number: "+55 (11) 99999-9999",
};
const request = (body: unknown, origin: string | null = "https://atendimento.example") =>
  new Request("https://atendimento.example/api/channel-credentials", {
    method: "POST",
    headers: new Headers({
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : {}),
    }),
    body: JSON.stringify(body),
  });
const expectPrivate = (response: Response) => {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.factors.mockResolvedValue([{ id: FACTOR, friendlyName: "Authenticator" }]);
  mocks.challenge.mockResolvedValue({ challengeId: CHALLENGE, factorId: FACTOR, nonce: "nonce" });
  mocks.verify.mockResolvedValue({ proofId: PROOF });
  mocks.execute.mockResolvedValue({ ok: true });
});

describe("channel credential API", () => {
  it("uses the same private, bounded, origin-checked MFA HTTP contract for AI credentials", async () => {
    const body = { action: "challenge", payload: { operation: "replace_ai_credential", channel: "openai", apiKey: "synthetic-private-key" }, factorId: FACTOR };
    const response = await aiPost(request(body)); expectPrivate(response); expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("apiKey");
    expect(mocks.challenge).toHaveBeenCalledWith({ payload: body.payload, factorId: FACTOR });
    expect((await aiPost(request(body, "https://evil.example"))).status).toBe(403);
    mocks.factors.mockRejectedValueOnce(new HttpError(403, "Administração restrita a gestores autorizados."));
    const denied = await aiFactors(); expectPrivate(denied); expect(denied.status).toBe(403);
  });
  it("keeps the generic resource route free of legacy credential writes and reveals", () => {
    const source = readFileSync(
      resolve(fileURLToPath(new URL(".", import.meta.url)), "../app/api/[resource]/route.ts"),
      "utf8",
    );
    expect(source).not.toContain('resource === "channel"');
    expect(source).not.toContain('resource === "webhook-verify-token"');
    expect(source).not.toContain("tokenEncrypted: encrypt");
  });

  it("lists only verified factor metadata without caching", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ factors: [{ id: FACTOR, friendlyName: "Authenticator" }] });
    expectPrivate(response);
  });

  it.each([null, "https://evil.example"])("rejects a non-same-origin POST (%s)", async (origin) => {
    const response = await POST(request({ action: "challenge", payload, factorId: FACTOR }, origin));
    expect(response.status).toBe(403);
    expect(mocks.challenge).not.toHaveBeenCalled();
  });

  it("forwards the exact payload at each MFA boundary", async () => {
    const challenge = await POST(request({ action: "challenge", payload, factorId: FACTOR }));
    expect(challenge.status).toBe(200);
    expectPrivate(challenge);
    expect(mocks.challenge).toHaveBeenCalledWith({ payload, factorId: FACTOR });

    const verify = await POST(request({
      action: "verify",
      payload,
      factorId: FACTOR,
      challengeId: CHALLENGE,
      nonce: "nonce",
      code: "123456",
    }));
    expect(verify.status).toBe(200);
    expectPrivate(verify);
    expect(mocks.verify).toHaveBeenCalledWith({
      payload,
      factorId: FACTOR,
      challengeId: CHALLENGE,
      nonce: "nonce",
      code: "123456",
    });

    const execute = await POST(request({ action: "execute", payload, proofId: PROOF }));
    expect(execute.status).toBe(200);
    expectPrivate(execute);
    expect(mocks.execute).toHaveBeenCalledWith({ payload, proofId: PROOF });
  });

  it("returns only the verification token with private no-store headers", async () => {
    mocks.execute.mockResolvedValueOnce({ verifyToken: "synthetic-verify" });
    const response = await POST(request({
      action: "execute",
      payload: { operation: "reveal_token_verification", channel: "client" },
      proofId: PROOF,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verifyToken: "synthetic-verify" });
    expectPrivate(response);
  });

  it("keeps an invalid TOTP in the step-up UI instead of triggering the login redirect", async () => {
    mocks.verify.mockRejectedValueOnce(new HttpError(401, "Codigo MFA invalido ou expirado."));
    const response = await POST(request({
      action: "verify",
      payload,
      factorId: FACTOR,
      challengeId: CHALLENGE,
      nonce: "nonce",
      code: "000000",
    }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Codigo MFA invalido ou expirado." });
    expectPrivate(response);
  });

  it("rejects a declared body larger than 8 KB before invoking credential code", async () => {
    const response = await POST(new Request("https://atendimento.example/api/channel-credentials", {
      method: "POST",
      headers: { Origin: "https://atendimento.example", "Content-Length": "8193" },
      body: "ignored",
    }));
    expect(response.status).toBe(413);
    expectPrivate(response);
    expect(mocks.challenge).not.toHaveBeenCalled();
  });

  it("rejects a chunked body over 8 KB while it is being read", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(4096)));
        controller.enqueue(new TextEncoder().encode("x".repeat(4097)));
        controller.close();
      },
    });
    const response = await POST(new Request("https://atendimento.example/api/channel-credentials", {
      method: "POST",
      headers: { Origin: "https://atendimento.example" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" }));
    expect(response.status).toBe(413);
    expectPrivate(response);
    expect(mocks.challenge).not.toHaveBeenCalled();
  });

  it("rejects plaintext access tokens over 3 KB before invoking credential code", async () => {
    const response = await POST(request({
      action: "challenge",
      payload: { operation: "replace_access_token", channel: "client", token: "x".repeat(3 * 1024 + 1) },
      factorId: FACTOR,
    }));
    expect(response.status).toBe(400);
    expectPrivate(response);
    expect(mocks.challenge).not.toHaveBeenCalled();
  });

  it("redacts unexpected credential failures and applies private error headers", async () => {
    mocks.challenge.mockRejectedValueOnce(new Error("secret-token-value"));
    const response = await POST(request({ action: "challenge", payload, factorId: FACTOR }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-token-value");
    expectPrivate(response);
  });

  it("does not turn malformed JSON into a generic server failure", async () => {
    const response = await POST(new Request("https://atendimento.example/api/channel-credentials", {
      method: "POST",
      headers: { Origin: "https://atendimento.example" },
      body: "{",
    }));
    expect(response.status).toBe(400);
    expect(mocks.challenge).not.toHaveBeenCalled();
  });
});
