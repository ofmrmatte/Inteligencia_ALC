import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const Pool = vi.fn(function () { return { connect, query, on: vi.fn() }; });
  return { Pool, query, release, connect };
});
vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({ default: { Pool: state.Pool } }));
import { hrDb, hrTransaction } from "@/lib/hr/db";

describe("independent lazy RH database", () => {
  beforeEach(() => { vi.clearAllMocks(); delete (globalThis as typeof globalThis & { __alcHrPool?: unknown }).__alcHrPool; });
  afterEach(() => vi.unstubAllEnvs());
  it("não conecta no import e não usa fallback Core/Aux", () => {
    vi.stubEnv("HR_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgres://synthetic/core");
    vi.stubEnv("PNR_DATABASE_URL", "postgres://synthetic/aux");
    expect(state.Pool).not.toHaveBeenCalled();
    expect(() => hrDb()).toThrow("HR_DATABASE_UNAVAILABLE");
    expect(state.connect).not.toHaveBeenCalled();
    expect(state.Pool).not.toHaveBeenCalled();
  });
  it("usa exclusivamente HR_DATABASE_URL com pool reutilizado e timeouts", () => {
    vi.stubEnv("HR_DATABASE_URL", "postgres://127.0.0.1/alc_hr_local");
    expect(hrDb()).toBe(hrDb());
    expect(state.Pool).toHaveBeenCalledTimes(1);
    expect(state.Pool).toHaveBeenCalledWith(expect.objectContaining({ connectionString: "postgres://127.0.0.1/alc_hr_local", max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000 }));
    expect(state.connect).not.toHaveBeenCalled();
  });
  it("commit e rollback liberam a conexão", async () => {
    vi.stubEnv("HR_DATABASE_URL", "postgres://127.0.0.1/alc_hr_local");
    expect(await hrTransaction(async () => "saved")).toBe("saved");
    expect(state.query.mock.calls.map((c) => c[0])).toEqual(["BEGIN", "COMMIT"]);
    state.query.mockClear();
    await expect(hrTransaction(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    expect(state.query.mock.calls.map((c) => c[0])).toEqual(["BEGIN", "ROLLBACK"]);
    expect(state.release).toHaveBeenCalledTimes(2);
  });
});
