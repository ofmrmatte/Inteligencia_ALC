import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, redirect, signInWithPassword, listFactors, signOut, headers, getClaims, revokeAtendimentoSessions } = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
  signInWithPassword: vi.fn(),
  listFactors: vi.fn(),
  signOut: vi.fn(),
  getClaims: vi.fn(),
  revokeAtendimentoSessions: vi.fn(),
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.10" })),
}));

vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/atendimento-access", () => ({ revokeAtendimentoSessions }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers }));

import { signInAction, signOutAction } from "@/app/login/actions";

function credentials(next = "/") {
  const form = new FormData();
  form.set("email", "user@alc.test");
  form.set("password", "secret123");
  form.set("next", next);
  return form;
}

describe("login administrativo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createClient.mockResolvedValue({
      auth: {
        signInWithPassword,
        signOut,
        getClaims,
        mfa: { listFactors },
      },
    });
    getClaims.mockResolvedValue({ data: null, error: null });
    signOut.mockResolvedValue({ error: null });
  });

  it("mantém o usuário no login e abre MFA quando existe TOTP verificado", async () => {
    signInWithPassword.mockResolvedValue({ data: { session: { access_token: "redacted" } }, error: null });
    listFactors.mockResolvedValue({ data: { totp: [{ id: "factor-1" }], all: [{ id: "factor-1", status: "verified" }] }, error: null });

    await expect(signInAction({}, credentials())).resolves.toEqual({ mfaRequired: true });

    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(listFactors).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("entra direto no destino quando a conta não possui MFA", async () => {
    signInWithPassword.mockResolvedValue({ data: { session: { access_token: "redacted" } }, error: null });
    listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });

    await expect(signInAction({}, credentials("/bandeja-pnr"))).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/bandeja-pnr");
  });

  it("encerra a sessão se não conseguir verificar os fatores após a senha", async () => {
    signInWithPassword.mockResolvedValue({ data: { session: { access_token: "redacted" } }, error: null });
    listFactors.mockResolvedValue({ data: null, error: { message: "temporary failure" } });

    await expect(signInAction({}, credentials())).resolves.toEqual({
      error: "Não foi possível verificar a segurança da conta. Tente entrar novamente.",
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("não repete signInWithPassword após erro transitório", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Connection terminated due to connection timeout", status: 503 },
    });

    const result = await signInAction({}, credentials());

    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(result.error).toMatch(/Não foi possível concluir o acesso agora/);
    expect(listFactors).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reserva a mensagem de credenciais inválidas ao erro correspondente", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 },
    });

    await expect(signInAction({}, credentials())).resolves.toEqual({ error: "E-mail ou senha inválidos." });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(listFactors).not.toHaveBeenCalled();
  });

  it("revoga o vínculo do Atendimento antes de concluir o logout central", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "previous-user", session_id: "previous-session" } }, error: null });
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(revokeAtendimentoSessions).toHaveBeenCalledWith("previous-user", "previous-session");
    expect(revokeAtendimentoSessions.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("não anuncia logout bem-sucedido se não conseguir persistir a revogação", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "previous-user", session_id: "previous-session" } }, error: null });
    revokeAtendimentoSessions.mockRejectedValue(new Error("database unavailable"));
    await expect(signOutAction()).rejects.toThrow("database unavailable");
    expect(signOut).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("revoga a conta anterior antes de trocar o usuário na autenticação central", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "previous-user", session_id: "previous-session" } }, error: null });
    signInWithPassword.mockResolvedValue({ data: { session: { access_token: "synthetic-token" } }, error: null });
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    await expect(signInAction({}, credentials())).rejects.toThrow("NEXT_REDIRECT");
    expect(revokeAtendimentoSessions).toHaveBeenCalledWith("previous-user", "previous-session");
    expect(revokeAtendimentoSessions.mock.invocationCallOrder[0]).toBeLessThan(signInWithPassword.mock.invocationCallOrder[0]);
  });

  it("não troca de conta se não conseguir verificar a sessão anterior", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "verification unavailable" } });
    await expect(signInAction({}, credentials())).resolves.toMatchObject({ error: expect.stringContaining("verificar a sessão anterior") });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("não anuncia logout se não conseguir verificar a sessão para revogação", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "verification unavailable" } });
    await expect(signOutAction()).rejects.toThrow("verificar sua sessão");
    expect(signOut).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
