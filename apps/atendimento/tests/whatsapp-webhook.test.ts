import { createHmac, createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ config: vi.fn(), query: vi.fn(), signature: vi.fn() }));
vi.mock("../lib/meta", () => ({ channelConfig: mocks.config, validSignature: mocks.signature }));
vi.mock("../lib/db", () => ({ db: () => ({ query: mocks.query }) }));
vi.mock("../lib/worker", () => ({ eventKey: (raw: string) => createHash("sha256").update(raw).digest("hex") }));
import { POST } from "../app/webhooks/whatsapp/[channel]/route";

const secret = "synthetic-secret";
const valid = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
const signature = (body: string | Uint8Array) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const params = { params: Promise.resolve({ channel: "client" }) };
function request(body: string | Uint8Array | ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/webhooks/whatsapp/client", {
    method: "POST", body, duplex: "half",
    headers: { "x-hub-signature-256": signature(valid), ...headers },
  } as RequestInit);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.mockResolvedValue({ appSecret: secret });
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.signature.mockImplementation((bytes, received) => received === signature(bytes));
});

it("does not read unauthenticated or unconfigured payloads", async () => {
  for (const header of ["", "sha256=invalid"]) {
    const req = request(valid, { "x-hub-signature-256": header });
    expect((await POST(req, params)).status).toBe(401);
    expect(req.bodyUsed).toBe(false);
  }
  mocks.config.mockResolvedValue({ appSecret: "" });
  const req = request(valid);
  expect((await POST(req, params)).status).toBe(503);
  expect(req.bodyUsed).toBe(false);
  expect(mocks.query).not.toHaveBeenCalled();
});

it.each(["1000001", "9007199254740992", "invalid", "-1"])("rejects oversized or invalid declared lengths: %s", async (length) => {
  const req = request(valid, { "content-length": length });
  expect((await POST(req, params)).status).toBe(413);
  expect(req.bodyUsed).toBe(false);
  expect(mocks.signature).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});

it("bounds an undeclared or lying stream before signature verification and persistence", async () => {
  const canceled = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(600_000)); }, cancel: canceled,
  });
  expect((await POST(request(stream, { "content-length": "1" }), params)).status).toBe(413);
  expect(canceled).toHaveBeenCalledOnce();
  expect(mocks.signature).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});

it("verifies exact bytes and only persists a signed JSON event", async () => {
  const response = await POST(request(valid), params);
  expect(response.status).toBe(200);
  expect(Buffer.isBuffer(mocks.signature.mock.calls[0][0])).toBe(true);
  expect(mocks.query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("ON CONFLICT"), [
    createHash("sha256").update(valid).digest("hex"), "client", JSON.parse(valid),
  ]);
});

it.each(["null", "{}", "not-json"])("rejects signed malformed events without persistence: %s", async (body) => {
  expect((await POST(request(body, { "x-hub-signature-256": signature(body) }), params)).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});

it("rejects signed invalid UTF-8 and unsigned altered content", async () => {
  const bytes = new Uint8Array([0xff]);
  expect((await POST(request(bytes, { "x-hub-signature-256": signature(bytes) }), params)).status).toBe(400);
  expect((await POST(request(valid + " "), params)).status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
