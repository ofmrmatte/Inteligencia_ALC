import { beforeEach, describe, expect, it, vi } from "vitest";

const { setting, maybeSingle } = vi.hoisted(() => ({ setting: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("../lib/db", () => ({ setting, core: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], get: () => ({ value: "test-receipt" }) }) }));
vi.mock("@alc/identity/transfer", () => ({ ENTRY_COOKIE: "test-entry", validEntryReceipt: () => true }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({
  auth: { getClaims: async () => ({ data: { claims: { sub: "test-user", aal: "aal2" } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
}) }));
import { currentProfile } from "../lib/auth";

describe("permissão atual de uma sessão do Atendimento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    maybeSingle.mockResolvedValue({ data: { id: "test-user", role: "supervisor", active: true, module_scope: ["perfil"] }, error: null });
  });

  it("aceita liberação explícita independente de PNR e bloqueia a próxima requisição após revogação", async () => {
    setting.mockResolvedValueOnce({ active: true }).mockResolvedValueOnce({ active: false });
    expect(await currentProfile()).toMatchObject({ id: "test-user", atendimentoAccess: true });
    await expect(currentProfile()).rejects.toMatchObject({ status: 403 });
    expect(setting).toHaveBeenCalledTimes(2);
  });

  it("continua verificando o perfil central ativo e o teto do cargo", async () => {
    setting.mockResolvedValue({ active: true });
    maybeSingle.mockResolvedValueOnce({ data: { id: "test-user", role: "supervisor", active: false }, error: null });
    await expect(currentProfile()).rejects.toMatchObject({ status: 403 });
    maybeSingle.mockResolvedValueOnce({ data: { id: "test-user", role: "driver", active: true }, error: null });
    await expect(currentProfile()).rejects.toMatchObject({ status: 403 });
  });
});
