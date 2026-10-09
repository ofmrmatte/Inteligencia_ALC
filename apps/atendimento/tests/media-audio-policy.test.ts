import { beforeEach, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { AuthProfile } from "@alc/identity/auth";

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("../lib/db", () => ({
  db: () => ({ query: mocks.query, connect: mocks.connect }),
  audit: vi.fn(), core: vi.fn(), setting: vi.fn(),
}));
import { assertSupportedMedia, validateMedia } from "../lib/media-validation";
import { archiveIncomingMedia, outboundMedia, reserveUpload } from "../lib/media-service";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue({ rows: [] });
});

it.each(["audio", "audio/aac", "audio/mpeg", "audio/ogg; codecs=opus", " AUDIO/MP4 "])(
  "rejects unsupported audio type %s", (type) => {
    expect(() => assertSupportedMedia(type)).toThrow("Áudio não é suportado");
  },
);
it("keeps the supported attachment types", () => {
  for (const type of ["image/png", "video/mp4", "application/pdf", "text/plain", "sticker"])
    expect(() => assertSupportedMedia(type)).not.toThrow();
});
it("rejects declared audio before creating an upload reservation", async () => {
  await expect(reserveUpload({} as AuthProfile, {
    id: "11111111-1111-4111-8111-111111111111",
    conversationId: "22222222-2222-4222-8222-222222222222",
    filename: "voice.ogg", mime: "audio/ogg",
  })).rejects.toMatchObject({ status: 415 });
  expect(mocks.connect).not.toHaveBeenCalled();
});
it("rejects audio MIME even if the upload body is not audio", async () => {
  await expect(validateMedia(Buffer.from("Synthetic audio body"), "voice.mp3", "audio/mpeg"))
    .rejects.toMatchObject({ status: 415 });
});
it("blocks a previously queued audio without opening private storage", async () => {
  const connection = { query: vi.fn().mockResolvedValue({ rows: [{
    id: "synthetic", type: "audio", status: "ready", retention_until: new Date(Date.now() + 60_000),
  }] }) };
  await expect(outboundMedia("synthetic", connection as unknown as PoolClient))
    .rejects.toMatchObject({ status: 415 });
  expect(connection.query).toHaveBeenCalledTimes(1);
});
it("does not fetch incoming audio bytes from Meta or delete historical media", async () => {
  await archiveIncomingMedia();
  expect(mocks.query).toHaveBeenCalledTimes(3);
  const sql = mocks.query.mock.calls[0][0] as string;
  expect(sql).not.toContain("'audio'");
  expect(mocks.query.mock.calls[1][0]).toContain("type<>'audio'");
  expect(mocks.query.mock.calls.map(([query]) => query).join("\n")).not.toContain("DELETE");
});
