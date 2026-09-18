import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, redirect, signInWithPassword } = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
  signInWithPassword: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({ redirect }));

import { signInAction } from "@/app/login/actions";

function credentials() {
  const form = new FormData();
  form.set("email", "user@alc.test");
  form.set("password", "secret123");
  return form;
}

describe("login administrativo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createClient.mockResolvedValue({ auth: { signInWithPassword } });
  });

  it("redireciona após uma única autenticação válida", async () => {
    signInWithPassword.mockResolvedValue({ data: { session: { access_token: "redacted" } }, error: null });

    await expect(signInAction({}, credentials())).rejects.toThrow("NEXT_REDIRECT");

    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("não repete signInWithPassword após erro transitório", async () => {
    signInWithPassword
      .mockResolvedValueOnce({ data: { session: null }, error: { message: "Connection terminated due to connection timeout", status: 503 } })
      .mockResolvedValueOnce({ data: { session: { access_token: "redacted" } }, error: null });

    const result = await signInAction({}, credentials());

    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(result.error).toMatch(/Não foi possível concluir o acesso agora/);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reserva a mensagem de credenciais inválidas ao erro correspondente", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 },
    });

    await expect(signInAction({}, credentials())).resolves.toEqual({ error: "E-mail ou senha inválidos." });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });
});
