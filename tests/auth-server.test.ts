import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, getClaims, from, select, eq, maybeSingle } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { getCurrentProfile, requireCurrentProfile } from "@/lib/auth-server";
import { redirect } from "next/navigation";

describe("perfil autenticado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockResolvedValue({ auth: { getClaims }, from });
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1", email: "user@alc.test" } }, error: null });
    from.mockReturnValue({ select });
    select.mockReturnValue({ eq });
    eq.mockReturnValue({ maybeSingle });
    maybeSingle.mockResolvedValue({
      data: { id: "user-1", role: "developer", active: true, email: "user@alc.test", base_scope: [] },
      error: null,
    });
  });

  it("lê o próprio perfil usando a sessão autenticada", async () => {
    const profile = await getCurrentProfile();

    expect(from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "user-1");
    expect(profile).toMatchObject({ id: "user-1", role: "developer", email: "user@alc.test" });
  });

  it("não autoriza perfil inativo ou consulta com erro", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { role: "developer", active: false }, error: null });
    expect(await getCurrentProfile()).toBeNull();

    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await expect(getCurrentProfile()).rejects.toThrow("PROFILE_LOOKUP_FAILED");
  });

  it("não transforma indisponibilidade temporária do perfil em logout", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "connection timeout", status: 503 } });

    await expect(requireCurrentProfile()).rejects.toThrow("PROFILE_LOOKUP_FAILED");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("distingue perfil sem acesso de sessão ausente", async () => {
    maybeSingle.mockResolvedValue({ data: { role: "developer", active: false }, error: null });

    await requireCurrentProfile();

    expect(redirect).toHaveBeenCalledWith("/login?error=access");
  });
});
