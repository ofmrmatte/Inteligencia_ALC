import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfile } from "@alc/identity/auth";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  core: vi.fn(),
  profiles: vi.fn(),
}));
vi.mock("../lib/db", () => ({
  db: () => ({ query: mocks.query }),
  core: () => ({ query: mocks.core }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ limit: mocks.profiles }) }),
  }),
}));
import {
  canonicalUnit,
  receivingOperator,
  eligibleOperators,
  operatorScope,
  operatorSchema,
  requireOperator,
  type Unit,
} from "../lib/operator-directory";
import { canReadConversation } from "../lib/inbox";
const A = "22222222-2222-4222-8222-222222222222",
  B = "33333333-3333-4333-8333-333333333333";
const unit: Unit = {
  unit_key: "test-a",
  base_key: "TEST BASE A",
  sigla: "TEST-A",
  base_name: "Synthetic base",
  xpt_code: "",
  coordinator_name: "",
  supervisors: [],
};
const profile: AuthProfile = {
  id: A,
  role: "supervisor",
  fullName: "Synthetic agent",
  email: "a@example.test",
  globalAccess: false,
  baseScope: [],
  siglaScope: [],
  atendimentoAccess: true,
};
const operator = {
  user_id: A,
  roles: ["agent"],
  active: true,
  receiving: true,
  available: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic");
  mocks.core.mockResolvedValue({ rows: [unit] });
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.profiles.mockResolvedValue({
    data: [
      {
        id: A,
        role: "supervisor",
        active: true,
        full_name: "Synthetic agent",
        base_scope: [],
        sigla_scope: [],
      },
    ],
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("operational membership without privilege escalation", () => {
  it.each(["SVC", "XPT", "", "UNKNOWN"])(
    "does not treat type/unknown %s as a sigla",
    (sigla) => {
      expect(
        canonicalUnit([unit], { sigla, base_key: unit.base_key }),
      ).toBeNull();
    },
  );
  it("rejects ambiguous siglas and resolves a canonical pair", () => {
    const second = { ...unit, unit_key: "test-b", base_key: "TEST BASE B" };
    expect(canonicalUnit([unit, second], { sigla: unit.sigla })).toBeNull();
    expect(
      canonicalUnit([unit, second], {
        sigla: unit.sigla,
        base_key: unit.base_key,
      }),
    ).toEqual(unit);
  });
  it.each(["supervisor", "coordinator", "manager", "director", "admin"])(
    "does not enroll a %s as an agent",
    (role) => {
      expect(receivingOperator({ ...operator, roles: [role] })).toBe(false);
    },
  );
  it.each(["active", "available", "receiving"] as const)(
    "blocks receiving when %s is false",
    (flag) => {
      expect(receivingOperator({ ...operator, [flag]: false })).toBe(false);
    },
  );
  it("requires explicit agent role even for a central administrator", async () => {
    await expect(
      requireOperator({ ...profile, role: "developer" }),
    ).rejects.toMatchObject({ status: 403 });
    mocks.query.mockResolvedValue({ rows: [operator] });
    expect(await requireOperator(profile)).toEqual(operator);
  });
  it("does not grant an unregistered agent the legacy global supervisor scope", async () => {
    const scoped = await operatorScope(profile, {
      full: true,
      pairs: new Set(),
      safe: new Set(),
    });
    expect(scoped.full).toBe(false);
    expect(scoped.pairs.size).toBe(0);
  });
  it("intersects membership with the central scope and ignores stale unit keys", async () => {
    mocks.query.mockResolvedValue({
      rows: [
        { ...unit, user_id: A },
        { ...unit, unit_key: "old-unit" },
      ],
    });
    const central = {
      full: false,
      pairs: new Set<string>(),
      safe: new Set<string>(),
    };
    expect((await operatorScope(profile, central)).pairs.size).toBe(0);
    central.pairs.add("TEST-A|TEST BASE A");
    expect([...(await operatorScope(profile, central)).pairs]).toEqual([
      "TEST-A|TEST BASE A",
    ]);
  });
  it("does not reactivate a centrally disabled or revoked identity", async () => {
    mocks.query.mockImplementation(async (sql) => ({
      rows: sql.includes("settings")
        ? [{ key: `access_${A}`, value: { active: false } }]
        : [operator],
    }));
    expect(await eligibleOperators()).toEqual([]);
    mocks.profiles.mockResolvedValue({
      data: [{ id: A, role: "supervisor", active: false }],
      error: null,
    });
    expect(await eligibleOperators()).toEqual([]);
  });
  it("blocks horizontal conversation reads by agents, including media callers", async () => {
    mocks.query.mockResolvedValue({ rows: [operator] });
    const scope = {
      full: true,
      pairs: new Set<string>(),
      safe: new Set<string>(),
    };
    expect(
      await canReadConversation(profile, { assigned_to: B, ...unit }, scope),
    ).toBe(false);
    expect(
      await canReadConversation(profile, { assigned_to: A, ...unit }, scope),
    ).toBe(true);
    expect(
      await canReadConversation(
        profile,
        { assigned_to: B, ...unit },
        { ...scope, full: false },
      ),
    ).toBe(false);
  });
  it("rejects mass assignment and unsupported roles", () => {
    expect(
      operatorSchema.safeParse({
        userId: A,
        roles: ["agent"],
        active: true,
        available: true,
        receiving: true,
        bases: [],
        globalAccess: true,
      }).success,
    ).toBe(false);
  });
});
