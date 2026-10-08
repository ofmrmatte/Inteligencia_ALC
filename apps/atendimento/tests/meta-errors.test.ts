import { afterEach, describe, expect, it, vi } from "vitest";
import { graph, type ChannelConfig } from "../lib/meta";

const config: ChannelConfig = {
  token: "synthetic-token",
  phoneId: "synthetic",
  wabaId: "",
  verifyToken: "",
  appSecret: "",
  number: "",
};

vi.mock("../lib/db", () => ({ setting: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe("Provider error responses do not expose credentials or raw content", () => {
  it.each([400, 500])(
    "returns only the safe status and numeric code for HTTP %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify({
                error: {
                  code: 100,
                  message: "secret-marker-sensitive-provider-details",
                },
              }),
              { status },
            ),
          ),
      );
      await expect(graph(config, "messages")).rejects.toThrow(
        `Meta ${status} (100): Falha na integração.`,
      );
    },
  );
  it("does not echo a nonnumeric provider code", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error: { code: "secret-marker", message: "sensitive-details" },
            }),
            { status: 401 },
          ),
        ),
    );
    await expect(graph(config, "messages")).rejects.toThrow(
      "Meta 401 (API): Falha na integração.",
    );
  });
});
