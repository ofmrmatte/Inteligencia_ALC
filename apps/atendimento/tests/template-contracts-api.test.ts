import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), authorize: vi.fn(), load: vi.fn(), preview: vi.fn(), save: vi.fn() }));
vi.mock("../lib/auth", async original => ({ ...(await original()), currentProfile: mocks.profile }));
vi.mock("../lib/template-contract-config", () => ({
  requireCentralManager: mocks.authorize, loadTemplateContractReview: mocks.load,
  previewTemplateContractDraft: mocks.preview, persistTemplateContract: mocks.save,
}));
import { GET, POST } from "../app/api/[resource]/route";
import { HttpError } from "../lib/auth";
import { TemplateContractError } from "../lib/template-contract";
const context = { params: Promise.resolve({ resource: "template-contracts" }) };
const request = (body: unknown) => new Request("https://example.test/api/template-contracts", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "https://example.test" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.profile.mockResolvedValue({ id: "synthetic-manager", role: "director" });
  mocks.authorize.mockResolvedValue(undefined);
  mocks.load.mockResolvedValue({ revision: 0, contract: null });
  mocks.preview.mockResolvedValue({ expectedRevision: 0, contract: {}, fingerprint: "synthetic" });
  mocks.save.mockResolvedValue({ revision: 1 });
});
it("loads a channel only after current manager authorization and prevents caching", async () => {
  const response = await GET(new Request("https://example.test/api/template-contracts?channel=client"), context);
  expect(response.status).toBe(200);
  expect(mocks.authorize).toHaveBeenCalledWith(await mocks.profile());
  expect(mocks.load).toHaveBeenCalledWith("client");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("rejects central revocation before reading contracts", async () => {
  mocks.authorize.mockRejectedValue(new HttpError(403, "Acesso revogado."));
  const response = await GET(new Request("https://example.test/api/template-contracts?channel=driver"), context);
  expect(response.status).toBe(403);
  expect(mocks.load).not.toHaveBeenCalled();
});
it.each(["preview", "save"])("passes %s to the responsible service without queuing messages", async kind => {
  const input = { expectedRevision: 0, contract: { bodyText: "Synthetic text" }, ...(kind === "save" ? { reviewed: true, fingerprint: "synthetic" } : {}) };
  const response = await POST(request({ kind, ...input }), context);
  expect(response.status).toBe(200);
  expect(kind === "preview" ? mocks.preview : mocks.save).toHaveBeenCalledWith(await mocks.profile(), input);
  expect(kind === "preview" ? mocks.save : mocks.preview).not.toHaveBeenCalled();
});
it("rejects unknown actions or a non-manager before using the services", async () => {
  expect((await POST(request({ kind: "send" }), context)).status).toBe(400);
  mocks.profile.mockResolvedValue({ id: "synthetic-agent", role: "supervisor" });
  expect((await POST(request({ kind: "save" }), context)).status).toBe(403);
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("surfaces template mismatch as an actionable conflict, without a false approval", async () => {
  mocks.preview.mockRejectedValue(new TemplateContractError("rodapé divergente"));
  const response = await POST(request({ kind: "preview", expectedRevision: 0, contract: {} }), context);
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("rodapé divergente");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("blocks missing or foreign origins before reviewing or saving", async () => {
  for (const origin of [null, "https://foreign.example.test"]) {
    const incoming = request({ kind: "preview" });
    if (origin) incoming.headers.set("Origin", origin);
    else incoming.headers.delete("Origin");
    expect((await POST(incoming, context)).status).toBe(403);
  }
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
