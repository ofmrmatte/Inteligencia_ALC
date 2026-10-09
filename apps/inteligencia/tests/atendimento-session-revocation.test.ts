import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), release: vi.fn() }));
vi.mock("pg", () => ({ default: { Pool: class {
  query = mocks.query;
  connect = mocks.connect;
} } }));
import { registerAtendimentoSession, revokeAtendimentoSessions } from "@/lib/atendimento-access";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PNR_DATABASE_URL", "postgres://synthetic.example.test/test");
  mocks.query.mockResolvedValue({ rows: [{ key: "synthetic" }] });
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
});

it("registra somente o vínculo revogável, sem tokens, e não ressuscita a mesma sessão", async () => {
  await registerAtendimentoSession("synthetic-user", "synthetic-session");
  const [sql, values] = mocks.query.mock.calls[0];
  expect(values).toEqual(["sso_session_synthetic-session", expect.objectContaining({ profileId: "synthetic-user", active: true }), "synthetic-user"]);
  expect(sql).toContain("value->>'active'='true'");
  mocks.query.mockResolvedValueOnce({ rows: [] });
  await expect(registerAtendimentoSession("synthetic-user", "synthetic-session")).rejects.toThrow("ATENDIMENTO_SESSION_REVOKED");
});

it("revoga os vínculos e tickets pendentes da própria conta em uma transação", async () => {
  await revokeAtendimentoSessions("synthetic-user", "synthetic-session");
  const calls = mocks.query.mock.calls;
  expect(calls[0][0]).toBe("BEGIN");
  expect(calls[1][1]).toEqual(["sso_session_synthetic-session", expect.objectContaining({ active: false, profileId: "synthetic-user" }), "synthetic-user"]);
  expect(calls[2][0]).toContain("value->>'profileId'=$1");
  expect(calls[2][1]).toEqual(["synthetic-user"]);
  expect(calls[3]).toEqual(["DELETE FROM alc_atendimento.login_tickets WHERE profile_id=$1", ["synthetic-user"]]);
  expect(calls[4][0]).toBe("COMMIT");
  expect(mocks.release).toHaveBeenCalledOnce();
});

it("faz rollback e não esconde falha de revogação", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("write failed"));
  await expect(revokeAtendimentoSessions("synthetic-user", "synthetic-session")).rejects.toThrow("write failed");
  expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
  expect(mocks.query).not.toHaveBeenCalledWith("COMMIT");
  expect(mocks.release).toHaveBeenCalledOnce();
});

it("falha fechado quando o banco de revogação não está configurado", async () => {
  vi.stubEnv("PNR_DATABASE_URL", "");
  await expect(revokeAtendimentoSessions("synthetic-user", "synthetic-session"))
    .rejects.toThrow("ATENDIMENTO_DATABASE_UNAVAILABLE");
  expect(mocks.connect).not.toHaveBeenCalled();
});
