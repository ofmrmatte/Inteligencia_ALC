import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

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

import { GET, POST } from "../app/api/channel-credentials/route";
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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.factors.mockResolvedValue([{ id: FACTOR, friendlyName: "Authenticator" }]);
  mocks.challenge.mockResolvedValue({ challengeId: CHALLENGE, factorId: FACTOR, nonce: "nonce" });
  mocks.verify.mockResolvedValue({ proofId: PROOF });
  mocks.execute.mockResolvedValue({ ok: true });
});

describe("channel credential API", () => {
  it("keeps the generic resource route free of legacy credential writes and reveals", () => {
    const source = readFileSync("app/api/[resource]/route.ts", "utf8");
    expect(source).not.toContain('resource === "channel"');
    expect(source).not.toContain('resource === "webhook-verify-token"');
    expect(source).not.toContain("tokenEncrypted: encrypt");
  });

  it("lists only verified factor metadata without caching", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ factors: [{ id: FACTOR, friendlyName: "Authenticator" }] });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each([null, "https://evil.example"])("rejects a non-same-origin POST (%s)", async (origin) => {
    const response = await POST(request({ action: "challenge", payload, factorId: FACTOR }, origin));
    expect(response.status).toBe(403);
    expect(mocks.challenge).not.toHaveBeenCalled();
  });

  it("forwards the exact payload at each MFA boundary", async () => {
    const challenge = await POST(request({ action: "challenge", payload, factorId: FACTOR }));
    expect(challenge.status).toBe(200);
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
    expect(mocks.verify).toHaveBeenCalledWith({
      payload,
      factorId: FACTOR,
      challengeId: CHALLENGE,
      nonce: "nonce",
      code: "123456",
    });

    const execute = await POST(request({ action: "execute", payload, proofId: PROOF }));
    expect(execute.status).toBe(200);
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
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
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
