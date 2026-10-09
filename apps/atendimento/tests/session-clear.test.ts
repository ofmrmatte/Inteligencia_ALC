// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
  const target = Object.assign(new EventTarget(), {
    localStorage: storage(),
    sessionStorage: storage(),
    location: { origin: "http://localhost", replace: vi.fn() },
  });
  vi.stubGlobal("window", target);
  vi.stubGlobal("localStorage", target.localStorage);
  vi.stubGlobal("sessionStorage", target.sessionStorage);
});

afterEach(() => vi.unstubAllGlobals());

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

it.each([
  "MFA inválido.",
  "Conversa fora do seu escopo.",
  "Administração restrita a gestores autorizados.",
])("preserva dados e sessão no 403 operacional: %s", async (error) => {
  localStorage.setItem("private-cache", "conversation");
  sessionStorage.setItem("private-draft", "message");
  const cleared = vi.fn();
  window.addEventListener(PRIVATE_CONTENT_CLEARED_EVENT, cleared);
  let resolveResponse!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn()
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }))
    .mockResolvedValueOnce(Response.json({ error }, { status: 403 })));
  const pending = api<{ private: string }>("messages");

  await expect(api("conversation", { action: "reply" })).rejects.toThrow(error);
  resolveResponse(Response.json({ private: "conversation" }));
  await expect(pending).resolves.toEqual({ private: "conversation" });
  expect(cleared).not.toHaveBeenCalled();
  expect(window.location.replace).not.toHaveBeenCalled();
  expect(localStorage.getItem("private-cache")).toBe("conversation");
  expect(sessionStorage.getItem("private-draft")).toBe("message");
  expect(localStorage.getItem(PRIVATE_CONTENT_CLEARED_EVENT)).toBeNull();
});

it.each([
  { status: 401, error: "Sessão expirada.", destination: "/login" },
  { status: 403, error: "Perfil sem acesso ao Atendimento.", destination: "/acesso-indisponivel" },
  { status: 403, error: "Seu acesso ao Atendimento está desativado.", destination: "/acesso-indisponivel" },
  { status: 403, error: "MFA_REQUIRED", destination: "/login" },
])("limpa conteúdo e redireciona no acesso central: $error", async ({ status, error, destination }) => {
  const cleared = vi.fn();
  window.addEventListener(PRIVATE_CONTENT_CLEARED_EVENT, cleared);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error }, { status })));

  await expect(api("profile")).rejects.toThrow("Sessão encerrada.");

  expect(cleared).toHaveBeenCalledOnce();
  expect(window.location.replace).toHaveBeenCalledExactlyOnceWith(`http://localhost${destination}`);
});
