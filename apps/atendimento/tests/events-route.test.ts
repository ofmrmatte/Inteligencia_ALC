import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ denied: false }));
vi.mock("../lib/auth", () => ({
  HttpError: class HttpError extends Error { constructor(public status: number, message: string) { super(message); } },
  currentProfile: vi.fn(async () => {
    if (mocks.denied) throw new Error("revoked");
    return { id: "profile" };
  }),
}));
vi.mock("../lib/operational-monitoring", () => ({ authorizedEventVersion: vi.fn(async () => "v1") }));

import { GET } from "../app/api/events/route";

it("rejects unauthenticated event streams", async () => {
  mocks.denied = true;
  const response = await GET(new Request("http://localhost/api/events"));
  expect(response.status).toBe(503);
  mocks.denied = false;
});

it("opens a no-store invalidation stream without private data", async () => {
  const controller = new AbortController();
  const response = await GET(new Request("http://localhost/api/events", { signal: controller.signal }));
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(response.headers.get("cache-control")).toContain("no-cache");
  const reader = response.body!.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toContain("retry: 1000");
  controller.abort();
  await reader.cancel();
});
