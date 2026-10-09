import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  setting: vi.fn(),
  audit: vi.fn(),
  transactionQuery: vi.fn(),
  release: vi.fn(),
}));
vi.mock("../lib/db", () => ({
  setting: mocks.setting,
  audit: mocks.audit,
  db: () => ({
    query: mocks.query,
    connect: async () => ({
      query: mocks.transactionQuery,
      release: mocks.release,
    }),
  }),
}));
import {
  aiCredential,
  aiCredentialStatus,
  aiModelCatalog,
  aiModelVerified,
  reserveAiProviderAttempt,
  recordAiTest,
} from "../lib/ai-provider";
import {
  aiConfigurationStatus,
  testAiConnection,
} from "../lib/ai-provider-service";
import { encrypt } from "../lib/meta";
import { defaultAiConfig } from "../lib/agent-instructions";
import type { AuthProfile } from "@alc/identity/auth";
const actor: AuthProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "developer",
  email: "synthetic@example.test",
  fullName: "Synthetic",
  globalAccess: true,
  baseScope: [],
  siglaScope: [],
};
let stored: Map<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  stored = new Map();
  vi.stubEnv("ATENDIMENTO_ENCRYPTION_KEY", "ab".repeat(32));
  vi.stubEnv("OPENAI_API_KEY", "environment-key");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GOOGLE_API_KEY", "google-fallback");
  mocks.setting.mockImplementation(async (key) => stored.get(key));
  mocks.query.mockResolvedValue({ rows: [{ calls: 2 }] });
  mocks.transactionQuery.mockImplementation(async (sql) => ({
    rows: sql.includes("count(*)")
      ? [{ total: 0 }]
      : sql.includes("RETURNING calls")
        ? [{ calls: 3 }]
        : [],
  }));
});
afterEach(() => vi.unstubAllEnvs());
it("rolls back connection verification if its audit cannot be written", async () => {
  mocks.audit.mockRejectedValueOnce(new Error("Synthetic audit failure"));
  await expect(
    recordAiTest(actor, {
      provider: "openai",
      model: "manual-model",
      fingerprint: "synthetic",
      testedAt: "2026-10-09T12:00:00Z",
      result: "ready",
      timeoutMs: 1000,
    }),
  ).rejects.toThrow("Synthetic audit failure");
  expect(mocks.transactionQuery).toHaveBeenCalledWith("ROLLBACK");
  expect(mocks.transactionQuery).not.toHaveBeenCalledWith("COMMIT");
  expect(mocks.release).toHaveBeenCalledOnce();
});
it("uses encrypted backend credentials first, then documented environment fallbacks", async () => {
  expect(await aiCredential("openai")).toEqual({
    value: "environment-key",
    source: "environment",
  });
  expect((await aiCredential("gemini")).value).toBe("google-fallback");
  vi.stubEnv("GEMINI_API_KEY", "gemini-preferred");
  expect((await aiCredential("gemini")).value).toBe("gemini-preferred");
  stored.set("ai_credential_openai", { encrypted: encrypt("stored-key") });
  expect(await aiCredential("openai")).toEqual({
    value: "stored-key",
    source: "stored",
  });
  expect(await aiCredentialStatus("openai")).toEqual({
    configured: true,
    source: "stored",
    stored: true,
  });
});
it("fails closed on corrupt ciphertext or a rotated key instead of silently using the environment", async () => {
  stored.set("ai_credential_openai", { encrypted: "broken" });
  await expect(aiCredential("openai")).rejects.toMatchObject({ status: 503 });
  expect(await aiCredentialStatus("openai")).toMatchObject({
    configured: false,
    source: "unavailable",
  });
  stored.set("ai_credential_openai", { encrypted: encrypt("stored-key") });
  vi.stubEnv("ATENDIMENTO_ENCRYPTION_KEY", "cd".repeat(32));
  await expect(aiCredential("openai")).rejects.toMatchObject({ status: 503 });
});
it("returns safe diagnostics and rejects unverified manual model compatibility", async () => {
  stored.set("agent_ai_config_v1", {
    ...defaultAiConfig,
    enabled: true,
    model: "custom-model",
  });
  expect(
    await aiModelVerified("openai", "custom-model", "environment-key"),
  ).toBe(false);
  stored.set("ai_test_openai", {
    model: "custom-model",
    result: "ready",
    testedAt: "2026-10-09T12:00:00Z",
    fingerprint: createHash("sha256").update("environment-key").digest("hex"),
  });
  expect(
    await aiModelVerified("openai", "custom-model", "environment-key"),
  ).toBe(true);
  expect(await aiModelVerified("openai", "custom-model", "rotated")).toBe(
    false,
  );
  const status = await aiConfigurationStatus();
  expect(status.diagnostic).toMatchObject({
    effective: "available",
    lastTest: { result: "ready", current: true },
  });
  expect(JSON.stringify(status)).not.toContain("environment-key");
  expect(JSON.stringify(status)).not.toContain("fingerprint");
});
it("requires a current successful provider probe before claiming AI is available", async () => {
  stored.set("agent_ai_config_v1", { ...defaultAiConfig, enabled: true, model: "gpt-4.1-mini" });
  expect((await aiConfigurationStatus()).diagnostic.effective).toBe("untested");
  const probe = {
    model: "gpt-4.1-mini",
    result: "ready",
    testedAt: "2026-10-09T12:00:00Z",
    fingerprint: createHash("sha256").update("environment-key").digest("hex"),
  };
  stored.set("ai_test_openai", probe);
  expect((await aiConfigurationStatus()).diagnostic.effective).toBe("available");
  stored.set("ai_test_openai", { ...probe, result: "authentication_failed" });
  expect((await aiConfigurationStatus()).diagnostic.effective).toBe("unavailable");
  stored.set("ai_test_openai", { ...probe, fingerprint: "stale" });
  expect((await aiConfigurationStatus()).diagnostic.effective).toBe("untested");
});

it("authenticates and caches the provider catalog without assuming all listed models are compatible", async () => {
  vi.stubEnv("OPENAI_API_KEY", "catalog-key");
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      data: [
        { id: "gpt-4.1-mini" },
        { id: "gpt-4o-2024-05-13" },
        { id: "text-embedding-3-small" },
        { id: "gpt-audio" },
        { id: "custom-model" },
      ],
    }),
  );
  const result = await aiModelCatalog(actor, "openai", fetcher);
  expect(result.models).toEqual([
    { id: "gpt-4.1-mini", label: "gpt-4.1-mini" },
  ]);
  expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
  expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  expect(await aiModelCatalog(actor, "openai", fetcher)).toEqual(result);
  expect(fetcher).toHaveBeenCalledOnce();
  await expect(
    aiModelCatalog({ ...actor, role: "supervisor" }, "openai", fetcher),
  ).rejects.toMatchObject({ status: 403 });
});
it("paginates Gemini catalogs and requires generateContent support plus a documented schema adapter", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        models: [
          {
            name: "models/gemini-2.5-flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-2.0-flash",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
        nextPageToken: "page2",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        models: [
          {
            name: "models/gemini-2.5-flash-lite",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      }),
    );
  expect((await aiModelCatalog(actor, "gemini", fetcher)).models).toEqual([
    { id: "gemini-2.5-flash", label: "models/gemini-2.5-flash" },
  ]);
  expect(String(fetcher.mock.calls[1][0])).toContain("pageToken=page2");
  expect(String(fetcher.mock.calls[0][0])).not.toContain("google-fallback");
});
it.each([401, 403, 429, 500])(
  "does not expose provider response bodies for HTTP %s",
  async (status) => {
    vi.stubEnv("OPENAI_API_KEY", `catalog-error-${status}`);
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "secret:environment-key" }, { status }),
      );
    await expect(
      aiModelCatalog(actor, "openai", fetcher),
    ).rejects.not.toHaveProperty(
      "message",
      expect.stringContaining("environment-key"),
    );
  },
);
it("reserves bounded billable probes and returns only safe results without sending WhatsApp", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              actionId: "clarify",
              rationale: "ambiguous_input",
            }),
          },
        },
      ],
    }),
  );
  const result = await testAiConnection(
    actor,
    {
      provider: "openai",
      model: "gpt-4.1-mini",
      timeoutMs: 1000,
      confirmed: true,
    },
    fetcher,
  );
  expect(result.result).toBe("ready");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://api.openai.com/v1/chat/completions",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body).response_format.type).toBe(
    "json_schema",
  );
  expect(mocks.audit.mock.calls[0].slice(0, 4)).toEqual([
    actor.id,
    "ai_connection_tested",
    "openai",
    { model: "gpt-4.1-mini", result: "ready" },
  ]);
  expect(JSON.stringify(result)).not.toContain("environment-key");
  await expect(
    testAiConnection(
      actor,
      {
        provider: "openai",
        model: "https://attacker.test",
        timeoutMs: 1000,
        confirmed: true,
      },
      fetcher,
    ),
  ).rejects.toBeDefined();
  await expect(
    testAiConnection(
      actor,
      {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeoutMs: 1000,
        confirmed: false,
      },
      fetcher,
    ),
  ).rejects.toBeDefined();
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each([401, 404, 429, 400, 500])(
  "maps failed probe HTTP %s to a safe diagnostic",
  async (status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { message: "secret:environment-key" } },
          { status },
        ),
      );
    const result = await testAiConnection(
      actor,
      {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeoutMs: 1000,
        confirmed: true,
      },
      fetcher,
    );
    expect(result.result).toBe(
      (
        {
          401: "authentication_failed",
          404: "model_unavailable",
          429: "provider_limit",
          400: "incompatible_model",
          500: "unavailable",
        } as Record<number, string>
      )[status],
    );
    expect(JSON.stringify(result)).not.toContain("environment-key");
  },
);
it("rejects repeated probes and exhausted daily budgets before a provider call", async () => {
  mocks.transactionQuery.mockResolvedValue({ rows: [{ total: 3 }] });
  await expect(
    reserveAiProviderAttempt(actor, "test", 10),
  ).rejects.toMatchObject({ status: 429 });
  expect(mocks.transactionQuery).toHaveBeenCalledWith("ROLLBACK");
  mocks.transactionQuery.mockImplementation(async (sql) => ({
    rows: sql.includes("count(*)") ? [{ total: 0 }] : [],
  }));
  await expect(
    reserveAiProviderAttempt(actor, "test", 10),
  ).rejects.toMatchObject({ status: 429 });
  expect(mocks.release).toHaveBeenCalledTimes(2);
});
