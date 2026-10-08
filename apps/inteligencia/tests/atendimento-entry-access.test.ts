import { beforeEach, expect, it, vi } from "vitest";
const { getCurrentProfile, createClient } = vi.hoisted(() => ({ getCurrentProfile: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getCurrentProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
import { GET } from "@/app/atendimento/route";

beforeEach(() => vi.clearAllMocks());
it("não emite ticket SSO a um usuário que teve o Atendimento revogado", async () => {
  getCurrentProfile.mockResolvedValue({ id: "test-user", role: "director", atendimentoAccess: false });
  const result = await GET(new Request("https://alc.test/atendimento"));
  expect(result.status).toBe(403);
  expect(createClient).not.toHaveBeenCalled();
});
it("encaminha uma sessão ausente ao login central", async () => {
  getCurrentProfile.mockResolvedValue(null);
  const result = await GET(new Request("https://alc.test/atendimento"));
  expect(result.status).toBe(307);
  expect(result.headers.get("location")).toBe("https://alc.test/login?next=%2Fatendimento");
  expect(createClient).not.toHaveBeenCalled();
});
