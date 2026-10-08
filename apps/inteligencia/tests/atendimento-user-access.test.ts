import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentProfile, maybeSingle, writeAtendimentoAccess, update } = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(), maybeSingle: vi.fn(), writeAtendimentoAccess: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/auth-server", () => ({ getCurrentProfile }));
vi.mock("@/lib/atendimento-access", () => ({ readAtendimentoAccess: vi.fn(), writeAtendimentoAccess }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }), update }),
}) }));
vi.mock("@/lib/hr/db", () => ({ hrDb: vi.fn() }));

import { PATCH } from "@/app/api/users/route";

function request(body: Record<string, unknown> = {}) {
  return new Request("https://alc.test/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "atendimento-access", id: "target", active: true, ...body }) });
}

describe("gestão central do acesso ao Atendimento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentProfile.mockResolvedValue({ id: "manager", role: "director" });
    maybeSingle.mockResolvedValue({ data: { id: "target", role: "supervisor", active: true }, error: null });
    writeAtendimentoAccess.mockResolvedValue(undefined);
  });

  it("libera e revoga somente a permissão no banco compartilhado, sem alterar Auth", async () => {
    for (const active of [true, false]) {
      const result = await PATCH(request({ active }));
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ id: "target", atendimentoAccess: active });
      expect(writeAtendimentoAccess).toHaveBeenLastCalledWith("manager", "target", active);
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("bloqueia chamadas sem sessão, sem cargo gestor e alterações da própria conta", async () => {
    getCurrentProfile.mockResolvedValueOnce(null);
    expect((await PATCH(request())).status).toBe(401);
    getCurrentProfile.mockResolvedValueOnce({ id: "manager", role: "supervisor" });
    expect((await PATCH(request())).status).toBe(403);
    expect((await PATCH(request({ id: "manager" }))).status).toBe(403);
    expect(writeAtendimentoAccess).not.toHaveBeenCalled();
  });

  it("impede gerenciar cargos fora da hierarquia e conceder acesso a perfis inativos", async () => {
    getCurrentProfile.mockResolvedValueOnce({ id: "manager", role: "loss_supervisor" });
    maybeSingle.mockResolvedValueOnce({ data: { id: "target", role: "director", active: true }, error: null });
    expect((await PATCH(request())).status).toBe(403);
    maybeSingle.mockResolvedValueOnce({ data: { id: "target", role: "supervisor", active: false }, error: null });
    expect((await PATCH(request())).status).toBe(403);
    expect(writeAtendimentoAccess).not.toHaveBeenCalled();
  });

  it("rejeita um booleano inválido e relata indisponibilidade sem sucesso falso", async () => {
    expect((await PATCH(request({ active: "false" }))).status).toBe(400);
    expect(writeAtendimentoAccess).not.toHaveBeenCalled();
    writeAtendimentoAccess.mockRejectedValueOnce(new Error("ATENDIMENTO_DATABASE_UNAVAILABLE"));
    expect((await PATCH(request())).status).toBe(503);
  });
});
