import { afterEach, describe, expect, it, vi } from "vitest";
import { graph } from "../lib/meta";
import { mockSender } from "./meta-contract-fixtures";

vi.mock("../lib/db", () => ({ setting: vi.fn(), core: vi.fn() }));
const safeError = "Meta: resposta inválida, incompleta, indisponível ou acima do limite.";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("bounded Graph response streaming", () => {
  it("cancels an oversized chunked body without response.json or exposing provider content", async () => {
    let chunks = 0;
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({
      pull(controller) { chunks++; controller.enqueue(new TextEncoder().encode("secret-provider-body".repeat(6000))); },
      cancel,
    }));
    const json = vi.spyOn(response, "json");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(graph(mockSender, "mock/messages", { synthetic: true })).rejects.toThrow(safeError);
    expect(cancel).toHaveBeenCalledOnce();
    expect(chunks).toBeLessThanOrEqual(4);
    expect(json).not.toHaveBeenCalled();
  });
  it("rejects an oversized Content-Length before consuming the stream", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{}")); }, cancel }), { headers: { "Content-Length": "262145" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(graph(mockSender, "mock/catalog")).rejects.toThrow(safeError);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([
    new Response("{}", { headers: { "Content-Length": "3" } }),
    new Response('{"secret-provider-body":'),
    new Response(new ReadableStream({ start(controller) { controller.error(new Error("secret-provider-body")); } })),
  ])("rejects truncated or errored bodies with the same safe error", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(graph(mockSender, "mock/catalog")).rejects.toThrow(safeError);
  });
  it("keeps the 20 second timeout active while the body stalls after headers", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))));
    const pending = expect(graph(mockSender, "mock/catalog")).rejects.toThrow(safeError);
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("decodes chunk boundaries and accepts a bounded response without waiting for the timeout", async () => {
    const bytes = new TextEncoder().encode('{"message":"Synthetic é"}');
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.slice(0, bytes.length - 3)); controller.enqueue(bytes.slice(bytes.length - 3)); controller.close();
    } }), { headers: { "Content-Length": String(bytes.length) } })));
    expect(await graph(mockSender, "mock/catalog")).toEqual({ message: "Synthetic é" });
  });
});
