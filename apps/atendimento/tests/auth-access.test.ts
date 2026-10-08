import { beforeEach, describe, expect, it, vi } from "vitest";

const { setting, maybeSingle } = vi.hoisted(() => ({ setting: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("../lib/db", () => ({ setting, core: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], get: () => ({ value: "test-receipt" }) }) }));
vi.mock("@alc/identity/transfer", async (original) => ({ ...await original(), ENTRY_COOKIE: "test-entry", validEntryReceipt: () => true }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({
  auth: { getClaims: async () => ({ data: { claims: { sub: "test-user", session_id: "test-session", aal: "aal2" } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
}) }));
import { currentProfile } from "../lib/auth";

describe("permissão atual de uma sessão do Atendimento", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    maybeSingle.mockResolvedValue({ data: { id: "test-user", role: "supervisor", active: true, module_scope: ["perfil"] }, error: null });
    setting.mockImplementation(async (key) => key.startsWith("sso_session_") ? { active: true, profileId: "test-user", expiresAt: Date.now() + 60_000 } : { active: true });
  });

  it("aceita liberação explícita independente de PNR e bloqueia a próxima requisição após revogação", async () => {
    let access = true;
    expect(await currentProfile()).toMatchObject({ id: "test-user", atendimentoAccess: true });
    access = false;
    setting.mockImplementation(async (key) => key.startsWith("sso_session_") ? { active: true, profileId: "test-user", expiresAt: Date.now() + 60_000 } : { active: access });
    await expect(currentProfile()).rejects.toMatchObject({ status: 403 });
    expect(setting.mock.calls.filter(([key]) => key === "access_test-user")).toHaveLength(2);
  });

  it("continua verificando o perfil central ativo e o teto do cargo", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: "test-user", role: "supervisor", active: false }, error: null });
    await expect(currentProfile()).rejects.toMatchObject({ status: 403 });
    maybeSingle.mockResolvedValueOnce({ data: { id: "test-user", role: "driver", active: true }, error: null });
    await expect(currentProfile()).rejects.toMatchObject({ status: 403 });
  });

  it.each([undefined, { active: false, profileId: "test-user" }, { active: true, profileId: "another-user", expiresAt: Date.now() + 60_000 }, { active: true, profileId: "test-user", expiresAt: 0 }])(
    "bloqueia a sessão central ausente, revogada ou de outra conta mesmo com JWT válido: %j",
    async (grant) => {
      setting.mockImplementation(async (key) => key.startsWith("sso_session_") ? grant : { active: true });
      await expect(currentProfile()).rejects.toMatchObject({ status: 401 });
      expect(maybeSingle).not.toHaveBeenCalled();
    },
  );
});
