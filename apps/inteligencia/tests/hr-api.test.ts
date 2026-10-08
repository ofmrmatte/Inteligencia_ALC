import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfile } from "@/lib/auth";
const state = vi.hoisted(() => ({ profile: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth-server", () => ({ getCurrentProfile: state.profile }));
vi.mock("@/lib/hr/db", () => ({ hrDb: () => {
  if (!process.env.HR_DATABASE_URL) throw new Error("HR_DATABASE_UNAVAILABLE");
  return { query: state.query };
}, hrTransaction: state.transaction }));
import { GET, POST, PATCH, DELETE } from "@/app/api/hr/[...path]/route";
const id = "00000000-0000-4000-8000-000000000001";
const profile = (role: AuthProfile["role"]) => ({ id, role, globalAccess: true, moduleScope: ["rh"], baseScope: [], siglaScope: [] });
const context = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
const request = (path: string, method = "GET", body?: unknown) => new Request(`http://localhost/api/hr/${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });
const endpoints: Array<["GET" | "POST" | "PATCH" | "DELETE", string]> = [
  ["GET", "overview"], ["GET", "employees"], ["POST", "employees"], ["GET", `employees/${id}`], ["PATCH", `employees/${id}`],
  ["GET", "departments"], ["POST", "departments"], ["PATCH", `departments/${id}`],
  ["GET", "positions"], ["POST", "positions"], ["PATCH", `positions/${id}`],
  ["GET", "attendance"], ["POST", "attendance/import"], ["GET", "leave"], ["POST", "leave"], ["PATCH", `leave/${id}`],
  ["GET", "documents"], ["POST", "documents"], ["DELETE", `documents/${id}`], ["GET", `documents/${id}/download`],
  ["GET", "audit"], ["GET", "contracts"], ["POST", "contracts"], ["PATCH", `contracts/${id}`],
  ["GET", "compensation"], ["POST", "compensation"], ["PATCH", `compensation/${id}`],
  ["GET", "occurrences"], ["POST", "occurrences"], ["PATCH", `occurrences/${id}`], ["DELETE", `occurrences/${id}`],
];
const handlers = { GET, POST, PATCH, DELETE };
beforeEach(() => { vi.clearAllMocks(); state.query.mockResolvedValue({ rows: [] }); });
describe("RH APIs authorization", () => {
  it.each(endpoints)("%s %s retorna 401 sem sessão e no-store", async (method, path) => {
    state.profile.mockResolvedValue(null);
    const response = await handlers[method](request(path, method), context(path));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(state.query).not.toHaveBeenCalled();
  });
  it.each(endpoints)("%s %s retorna 403 para Loss antes de acessar dados", async (method, path) => {
    state.profile.mockResolvedValue(profile("loss_supervisor"));
    const response = await handlers[method](request(path, method), context(path));
    expect(response.status).toBe(403);
    expect(state.query).not.toHaveBeenCalled();
  });
  it.each(endpoints.filter(([method]) => method !== "GET"))("diretor não pode %s %s", async (method, path) => {
    state.profile.mockResolvedValue(profile("director"));
    expect((await handlers[method](request(path, method), context(path))).status).toBe(403);
  });
  it("diretor consulta colaboradores mas não salário nem auditoria geral", async () => {
    vi.stubEnv("HR_DATABASE_URL", "postgres://synthetic/hr");
    state.profile.mockResolvedValue(profile("director"));
    expect((await GET(request("employees"), context("employees"))).status).toBe(200);
    expect(state.query.mock.calls[0][0]).not.toMatch(/salary|compensation/);
    expect((await GET(request("compensation"), context("compensation"))).status).toBe(403);
    expect((await GET(request("audit"), context("audit"))).status).toBe(403);
    vi.unstubAllEnvs();
  });
  it("API retorna 503 controlado sem HR_DATABASE_URL, mesmo com Core/Aux", async () => {
    vi.stubEnv("HR_DATABASE_URL", ""); vi.stubEnv("DATABASE_URL", "postgres://synthetic/core"); vi.stubEnv("PNR_DATABASE_URL", "postgres://synthetic/aux");
    state.profile.mockResolvedValue(profile("developer"));
    const response = await GET(request("overview"), context("overview"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Banco de Recursos Humanos ainda não configurado." });
    expect(state.query).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it("payload inválido recebe 400 e erro interno não expõe stack, SQL ou segredo", async () => {
    state.profile.mockResolvedValue(profile("developer"));
    expect((await POST(request("employees", "POST", { salary_amount: 10 }), context("employees"))).status).toBe(400);
    vi.stubEnv("HR_DATABASE_URL", "postgres://synthetic/hr");
    state.query.mockRejectedValue(new Error("secret SQL stack internal"));
    const response = await GET(request("employees"), context("employees"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/secret|SQL|stack/);
    vi.unstubAllEnvs();
  });
  it("PATCH numérico preserva conversão pg e gera audit log", async () => {
    vi.stubEnv("HR_DATABASE_URL", "postgres://synthetic/hr");
    state.profile.mockResolvedValue(profile("developer"));
    state.query.mockResolvedValue({ rows: [{ id, employee_id: id, effective_from: "2026-10-07", effective_to: null, salary_amount: "5000.00", salary_type: "MONTHLY", notes: null }] });
    const txQuery = vi.fn().mockResolvedValue({ rows: [{ id, employee_id: id, salary_amount: "5000.00" }] });
    state.transaction.mockImplementation(async (work: (client: unknown) => Promise<unknown>) => work({ query: txQuery }));
    const response = await PATCH(request(`compensation/${id}`, "PATCH", { effective_to: "2026-12-31" }), context(`compensation/${id}`));
    expect(response.status).toBe(200);
    expect(txQuery.mock.calls.some((c) => c[0].includes("INSERT INTO hr_audit_log"))).toBe(true);
    vi.unstubAllEnvs();
  });
  it("If-Match desatualizado retorna 409 sem mutação", async () => {
    vi.stubEnv("HR_DATABASE_URL", "postgres://synthetic/hr");
    state.profile.mockResolvedValue(profile("developer"));
    state.query.mockResolvedValue({ rows: [{ id, updated_at: "2026-10-07 12:00:00.123456" }] });
    const req = request(`employees/${id}`, "PATCH", { full_name: "Sintético" });
    req.headers.set("If-Match", '"2026-10-07 11:00:00.123456"');
    expect((await PATCH(req, context(`employees/${id}`))).status).toBe(409);
    expect(state.transaction).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
