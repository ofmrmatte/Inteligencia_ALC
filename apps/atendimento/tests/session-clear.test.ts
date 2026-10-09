// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { api, clearPrivateContent, PRIVATE_CONTENT_CLEARED_EVENT } from "../components/data";

beforeEach(() => {
  const storage = () => {
    const values = new Map<string, string>();
    return {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
  };
  const target = new EventTarget();
  Object.assign(target, {
    localStorage: storage(),
    sessionStorage: storage(),
    location: { origin: "http://localhost", replace: vi.fn() },
  });
  vi.stubGlobal("window", target);
  vi.stubGlobal("localStorage", target.localStorage);
  vi.stubGlobal("sessionStorage", target.sessionStorage);
});

it("preserva preferências não relacionadas e avisa todas as abas do Atendimento", () => {
  localStorage.setItem("ui-preference", "compact");
  sessionStorage.setItem("draft-preference", "keep");
  const notified = vi.fn();
  window.addEventListener(PRIVATE_CONTENT_CLEARED_EVENT, notified);

  clearPrivateContent();

  expect(localStorage.getItem("ui-preference")).toBe("compact");
  expect(sessionStorage.getItem("draft-preference")).toBe("keep");
  expect(notified).toHaveBeenCalledOnce();
  window.removeEventListener(PRIVATE_CONTENT_CLEARED_EVENT, notified);
});

it("rejeita uma resposta privada que chega depois da revogação", async () => {
  let resolveResponse!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
  const pending = api<{ private: string }>("messages");
  clearPrivateContent();
  resolveResponse(new Response(JSON.stringify({ private: "late" }), { status: 200 }));
  await expect(pending).rejects.toThrow("Sessão encerrada.");
});
