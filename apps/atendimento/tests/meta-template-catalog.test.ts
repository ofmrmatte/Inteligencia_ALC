import { afterEach, describe, expect, it, vi } from "vitest";
import { templates } from "../lib/meta";
import { mockSender, providerCatalog } from "./meta-contract-fixtures";

vi.mock("../lib/db", () => ({ setting: vi.fn(), core: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe("Meta provider catalog boundary", () => {
  it("reads only provider-returned catalog records with an explicit sender and no message request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: providerCatalog })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await templates("driver", mockSender)).toEqual(providerCatalog);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain(`${mockSender.wabaId}/message_templates?fields=id,name,status,language,category,parameter_format,components&limit=100`);
    expect(options).toMatchObject({ method: "GET", cache: "no-store", body: undefined });
  });

  it.each([
    { data: undefined },
    { data: [{ ...providerCatalog[0], category: undefined }] },
    { data: [{ ...providerCatalog[0], status: "UNRECOGNIZED" }] },
    { data: [{ ...providerCatalog[0], parameter_format: undefined }] },
    { data: [{ ...providerCatalog[0], parameter_format: "UNRECOGNIZED" }] },
    { data: [{ ...providerCatalog[0], components: [{ type: "BODY", text: "x".repeat(1025) }] }] },
    { data: [{ ...providerCatalog[0], components: [{ type: "HEADER", format: "IMAGE" }] }] },
    { data: [{ ...providerCatalog[0], components: [{ type: "BODY", text: "Known", extra: true }] }] },
    { data: [{ ...providerCatalog[0], components: [{ type: "BUTTONS", buttons: [{ type: "FLOW", text: "Unknown" }] }] }] },
  ])("fails closed on missing or unknown provider schemas", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(response))));
    await expect(templates("driver", mockSender)).rejects.toMatchObject({ status: 409 });
  });
});
