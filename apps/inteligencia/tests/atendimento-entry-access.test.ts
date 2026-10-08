import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { getCurrentProfile, createClient, registerAtendimentoSession, query } = vi.hoisted(() => ({ getCurrentProfile: vi.fn(), createClient: vi.fn(), registerAtendimentoSession: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getCurrentProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/atendimento-access", () => ({ registerAtendimentoSession }));
vi.mock("pg", () => ({ default: { Pool: class { query = query; } } }));
import { GET } from "@/app/atendimento/route";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ATENDIMENTO_SSO_KEY", "ab".repeat(32));
  vi.stubEnv("PNR_DATABASE_URL", "postgresql://synthetic.invalid/aux");
  getCurrentProfile.mockResolvedValue({ id: "test-user", role: "developer", atendimentoAccess: true });
  createClient.mockResolvedValue({ auth: {
    getSession: async () => ({ data: { session: { access_token: "synthetic-token", refresh_token: "synthetic-refresh" } }, error: null }),
    getClaims: async () => ({ data: { claims: { sub: "test-user", session_id: "test-session" } }, error: null }),
  } });
  query.mockResolvedValue({ rows: [] });
});
afterEach(() => vi.unstubAllEnvs());
it("não emite ticket SSO a um usuário que teve o Atendimento revogado", async () => {
  getCurrentProfile.mockResolvedValue({ id: "test-user", role: "director", atendimentoAccess: false });
  const result = await GET(new Request("https://alc.test/atendimento"));
  expect(result.status).toBe(403);
  expect(createClient).not.toHaveBeenCalled();
});
it("registra o vínculo antes de emitir o ticket cifrado", async () => {
  const result = await GET(new Request("https://alc.test/atendimento"));
  expect(result.status).toBe(200);
  expect(registerAtendimentoSession).toHaveBeenCalledWith("test-user", "test-session");
  expect(registerAtendimentoSession.mock.invocationCallOrder[0]).toBeLessThan(query.mock.invocationCallOrder[0]);
  const html = await result.text();
  expect(html).toContain('/auth/transfer');
  expect(html).not.toContain("synthetic-token");
  expect(html).not.toContain("synthetic-refresh");
});
it("não emite ticket se o vínculo da sessão já foi revogado", async () => {
  registerAtendimentoSession.mockRejectedValue(new Error("ATENDIMENTO_SESSION_REVOKED"));
  const result = await GET(new Request("https://alc.test/atendimento"));
  expect(result.status).toBe(503);
  expect(query).not.toHaveBeenCalled();
});
it("encaminha uma sessão ausente ao login central", async () => {
  getCurrentProfile.mockResolvedValue(null);
  const result = await GET(new Request("https://alc.test/atendimento"));
  expect(result.status).toBe(307);
  expect(result.headers.get("location")).toBe("https://alc.test/login?next=%2Fatendimento");
  expect(createClient).not.toHaveBeenCalled();
});
