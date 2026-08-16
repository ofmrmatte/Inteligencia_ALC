import { describe, expect, it } from "vitest";
import { canManageDriverPortalBaseSettings, getEffectiveDriverPortalAccess, portalEligibilityFromBase } from "@/lib/driver-portal-base-access";
import type { UserRole } from "@/lib/auth";

function profile(role: UserRole) {
  return { role };
}

describe("controle de liberacao do portal por base", () => {
  it("permite listar configuracoes apenas para director, super_admin e developer", () => {
    expect(canManageDriverPortalBaseSettings(profile("director"))).toBe(true);
    expect(canManageDriverPortalBaseSettings(profile("super_admin"))).toBe(true);
    expect(canManageDriverPortalBaseSettings(profile("developer"))).toBe(true);
    expect(canManageDriverPortalBaseSettings(profile("coordinator"))).toBe(false);
    expect(canManageDriverPortalBaseSettings(profile("supervisor"))).toBe(false);
    expect(canManageDriverPortalBaseSettings(profile("admin"))).toBe(false);
  });

  it("liberar uma base habilita somente motoristas nao bloqueados daquela base", () => {
    expect(portalEligibilityFromBase(true, "not_activated")).toBe(true);
    expect(portalEligibilityFromBase(true, "active")).toBe(true);
    expect(portalEligibilityFromBase(true, "blocked")).toBe(false);
    expect(portalEligibilityFromBase(true, "inactive")).toBe(false);
    expect(portalEligibilityFromBase(false, "not_activated")).toBe(false);
  });

  it("master switch bloqueia acesso mesmo quando o motorista esta elegivel", () => {
    expect(getEffectiveDriverPortalAccess({ portal_status: "active", portal_eligible: true }, false)).toMatchObject({
      allowed: false,
      reason: "base_disabled",
    });
  });

  it("base liberada nao contorna bloqueio individual", () => {
    expect(getEffectiveDriverPortalAccess({ portal_status: "blocked", portal_eligible: true }, true)).toMatchObject({
      allowed: false,
      reason: "driver_blocked",
    });
  });

  it("representa base A liberada e base B bloqueada sem vazamento", () => {
    const driverA = getEffectiveDriverPortalAccess({ portal_status: "active", portal_eligible: true }, true);
    const driverB = getEffectiveDriverPortalAccess({ portal_status: "active", portal_eligible: true }, false);
    expect(driverA.allowed).toBe(true);
    expect(driverB.allowed).toBe(false);
  });
});
