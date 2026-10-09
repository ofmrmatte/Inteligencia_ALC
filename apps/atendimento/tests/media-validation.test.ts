import { createServer } from "node:net";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { utils, write } from "cfb";
import { afterEach, expect, it, vi } from "vitest";
import {
  boundedBytes,
  mediaFilename,
  safeMetaMediaUrl,
  scanMedia,
  validateMedia,
} from "../lib/media-validation";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it.each([
  "../secret.png",
  "dir\\secret.png",
  "x.png:script.exe",
  "a\u0000.png",
  "x..png",
  "x.png.",
])("refuses unsafe filename %s", (name) =>
  expect(() => mediaFilename(name)).toThrow("inválido"),
);
it.each([
  "http://lookaside.fbsbx.com/file",
  "https://user:pass@lookaside.fbsbx.com/file",
  "https://lookaside.fbsbx.com:8080/file",
  "https://lookaside.fbsbx.com.evil.test/file",
  "https://127.0.0.1/file",
  "https://lookaside.fbsbx.com/file#x",
])("rejects SSRF target %s", (url) =>
  expect(() => safeMetaMediaUrl(url)).toThrow(),
);
it("decodes a real PNG, keeps original bytes and detects MIME mismatch", async () => {
  const bytes = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  expect(await validateMedia(bytes, "file.png", "image/png")).toEqual({
    mime: "image/png",
    type: "image",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  await expect(validateMedia(bytes, "file.jpg", "image/jpeg")).rejects.toThrow(
    "incompatível",
  );
  await expect(
    validateMedia(
      Buffer.from("MZ executable disguised as a PNG"),
      "file.png",
      "image/png",
    ),
  ).rejects.toThrow();
});
it("rejects truncated images and invalid UTF-8 rather than trusting content-type", async () => {
  await expect(
    validateMedia(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
      "broken.png",
      "image/png",
    ),
  ).rejects.toThrow();
  await expect(
    validateMedia(Buffer.from([255, 254, 0, 0]), "invalid.txt", "text/plain"),
  ).rejects.toThrow();
  expect(
    (
      await validateMedia(
        Buffer.from("Synthetic text"),
        "file.txt",
        "text/plain",
      )
    ).type,
  ).toBe("document");
});
it("bounds streamed bodies even without a content-length header", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(3));
      controller.enqueue(new Uint8Array(3));
      controller.close();
    },
  });
  await expect(boundedBytes(stream, 5)).rejects.toMatchObject({ status: 413 });
});
it.each([
  ["WordDocument", "doc", "application/msword"],
  ["Workbook", "xls", "application/vnd.ms-excel"],
  ["PowerPoint Document", "ppt", "application/vnd.ms-powerpoint"],
])(
  "validates legacy Office %s from its compound streams",
  async (stream, ext, mime) => {
    const compound = utils.cfb_new();
    utils.cfb_add(compound, stream, Buffer.from("Synthetic document stream"));
    const bytes = Buffer.from(
      write(compound, { type: "buffer", fileType: "cfb" }),
    );
    expect((await validateMedia(bytes, `file.${ext}`, mime)).mime).toBe(mime);
    utils.cfb_add(compound, "VBA/Module1", Buffer.from("Synthetic macro"));
    await expect(
      validateMedia(
        Buffer.from(write(compound, { type: "buffer", fileType: "cfb" })),
        `file.${ext}`,
        mime,
      ),
    ).rejects.toThrow("macros");
  },
);
it.each([
  "stream: OK\0",
  "stream: Synthetic_Test FOUND\0",
  "stream: size limit exceeded ERROR\0",
])(
  "understands the ClamAV protocol without releasing unknown results: %s",
  async (answer) => {
    const bytes = Buffer.from("Synthetic scan input");
    let frame = Buffer.alloc(0);
    const server = createServer((socket) =>
      socket.on("data", (chunk) => {
        frame = Buffer.concat([frame, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
        if (frame.length >= 10 + 4 + bytes.length + 4) socket.end(answer);
      }),
    );
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(3310, "127.0.0.1", resolve);
    });
    vi.stubEnv("ATENDIMENTO_CLAMAV_HOST", "127.0.0.1");
    try {
      expect(await scanMedia(bytes)).toBe(
        answer.includes("OK")
          ? "clean"
          : answer.includes("FOUND")
            ? "infected"
            : "unavailable",
      );
      expect(frame.subarray(0, 10).toString()).toBe("zINSTREAM\0");
      expect(frame.readUInt32BE(10)).toBe(bytes.length);
      expect(frame.subarray(14, -4)).toEqual(bytes);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
it("quarantines when no scanner is configured", async () => {
  vi.stubEnv("ATENDIMENTO_CLAMAV_HOST", "");
  expect(await scanMedia(Buffer.from("Synthetic"))).toBe("unavailable");
});
