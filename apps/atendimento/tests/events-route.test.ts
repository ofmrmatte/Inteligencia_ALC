import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: null as 401 | 403 | 503 | null }));
vi.mock("../lib/auth", () => ({
  HttpError: class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
  currentProfile: vi.fn(async () => {
    if (mocks.status) throw new (class extends Error { status = mocks.status; })("denied");
    return { id: "profile" };
  }),
}));
vi.mock("../lib/operational-monitoring", () => ({ authorizedEventVersion: vi.fn(async () => "v1") }));

import { currentProfile, HttpError } from "../lib/auth";
import { eventForError, GET } from "../app/api/events/route";

beforeEach(() => {
  mocks.status = null;
  vi.mocked(currentProfile).mockImplementation(async () => {
    if (mocks.status) throw new HttpError(mocks.status, "denied");
    return { id: "profile" } as never;
  });
});

it.each([401, 403, 503] as const)("mantém o status inicial do SSE distinto para %i", async (status) => {
  mocks.status = status;
  const response = await GET(new Request("http://localhost/api/events"));
  expect(response.status).toBe(status);
});

it.each([
  new Error("database connection failed: internal-host"),
  new HttpError(503, "database connection failed: internal-host"),
])("redige detalhes internos na resposta SSE 503", async (error) => {
  vi.mocked(currentProfile).mockRejectedValueOnce(error);

  const response = await GET(new Request("http://localhost/api/events"));

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Serviço temporariamente indisponível." });
});

it("separa revogação de falha transitória no evento do stream", () => {
  expect(eventForError(new HttpError(401, "expired"))).toContain("event: close401");
  expect(eventForError(new HttpError(403, "revoked"))).toContain("event: close403");
  expect(eventForError(new HttpError(503, "database"))).toContain("event: server503");
});

it("abre stream sem dados privados", async () => {
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
