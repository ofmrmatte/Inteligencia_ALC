import { describe, expect, it } from "vitest";
import { buildAccessScope, canAccessBase, canAccessScopedRecord, filterByAccessScope } from "@/lib/access-scope";
import type { AuthProfile } from "@/lib/auth";

function profile(role: AuthProfile["role"], baseScope: string[] = [], globalAccess = false): AuthProfile {
  return {
    id: `${role}-1`,
    email: `${role}@alc.test`,
    fullName: role,
    role,
    globalAccess,
    baseScope,
    siglaScope: [],
  };
}

describe("escopo central de acesso", () => {
  it("limita coordenador às bases vinculadas", () => {
    const scope = buildAccessScope(profile("coordinator", ["BASE 1", "BASE 2"]));
    expect(canAccessBase(scope, "BASE 1")).toBe(true);
    expect(canAccessBase(scope, "BASE 2")).toBe(true);
    expect(canAccessBase(scope, "BASE 3")).toBe(false);

    const rows = filterByAccessScope(scope, [
      { baseKey: "BASE 1", sigla: "A" },
      { baseKey: "BASE 3", sigla: "C" },
      { baseKey: "", sigla: "" },
    ]);
    expect(rows).toEqual([{ baseKey: "BASE 1", sigla: "A" }]);
  });

  it("mantém supervisor restrito à própria base", () => {
    const scope = buildAccessScope(profile("supervisor", ["BASE 1"]));
    expect(canAccessScopedRecord(scope, { baseKey: "BASE 1" })).toBe(true);
    expect(canAccessScopedRecord(scope, { baseKey: "BASE 2" })).toBe(false);
  });

  it("mantém Administração Loss restrita às bases atribuídas", () => {
    const scope = buildAccessScope(profile("loss_admin", ["BASE LOSS 1"]));
    expect(scope.fullAccess).toBe(false);
    expect(canAccessBase(scope, "BASE LOSS 1")).toBe(true);
    expect(canAccessBase(scope, "BASE LOSS 2")).toBe(false);
    expect(canAccessScopedRecord(scope, { baseKey: null, sigla: null })).toBe(false);
  });

  it("permite diretoria e super admin acessarem dados globais e sem base", () => {
    const director = buildAccessScope(profile("director"));
    const developer = buildAccessScope(profile("developer"));
    expect(canAccessScopedRecord(director, { baseKey: "BASE 3" })).toBe(true);
    expect(canAccessScopedRecord(developer, { baseKey: null, sigla: null })).toBe(true);
  });
});
