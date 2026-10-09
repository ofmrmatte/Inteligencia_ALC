import { expect, it, vi } from "vitest";
import type { AuthProfile } from "@alc/identity/auth";
const access = vi.hoisted(() => vi.fn());
vi.mock("../lib/media-service", () => ({ mediaAccess: access }));
import { mediaResponse } from "../lib/media-response";
const profile = { id: "synthetic" } as AuthProfile;
it.each([
  ["", 200, "Synthetic", null],
  ["bytes=2-5", 206, "nthe", "bytes 2-5/9"],
  ["bytes=-3", 206, "tic", "bytes 6-8/9"],
  ["bytes=7-", 206, "ic", "bytes 7-8/9"],
])(
  "serves authenticated bounded range %s",
  async (range, status, body, expectedRange) => {
    access.mockResolvedValue({
      metadata: { mime: "image/png", type: "image", filename: "synthetic.png" },
      bytes: Buffer.from("Synthetic"),
    });
    const response = await mediaResponse(
      profile,
      "synthetic",
      new Request("http://127.0.0.1/api/media/synthetic", {
        headers: range ? { Range: String(range) } : {},
      }),
    );
    expect(response.status).toBe(status);
    expect(await response.text()).toBe(body);
    expect(response.headers.get("Content-Range")).toBe(expectedRange);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  },
);
it.each([
  "bytes=9-",
  "bytes=8-2",
  "bytes=0-1,2-3",
  "bytes=-",
  "bytes=999999999999999999999999-",
  "bytes=-0",
])("refuses invalid range %s", async (range) => {
  access.mockResolvedValue({
    metadata: { mime: "image/png", type: "image", filename: "synthetic.png" },
    bytes: Buffer.from("Synthetic"),
  });
  await expect(
    mediaResponse(
      profile,
      "synthetic",
      new Request("http://127.0.0.1/api/media/synthetic", {
        headers: { Range: range },
      }),
    ),
  ).rejects.toMatchObject({ status: 416 });
});
it("forces active documents to authenticated download rather than inline execution", async () => {
  access.mockResolvedValue({
    metadata: {
      mime: "application/msword",
      type: "document",
      filename: "synthetic.doc",
    },
    bytes: Buffer.from("Synthetic"),
  });
  const response = await mediaResponse(
    profile,
    "synthetic",
    new Request("http://127.0.0.1/api/media/synthetic"),
  );
  expect(response.headers.get("Content-Disposition")).toContain("attachment;");
  expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
});
