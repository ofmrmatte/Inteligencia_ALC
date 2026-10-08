import { describe, expect, it } from "vitest";
import { canAccessOperationalData, canAccessSection, modulesForProfile } from "@/lib/access-control";
import { canManageImports, canManageUsers, hasFullAccess, type AuthProfile } from "@/lib/auth";

function profile(role: AuthProfile["role"], moduleScope?: string[]): AuthProfile {
  return {
    id: `${role}-1`, email: `${role}@alc.test`, fullName: role, role,
    globalAccess: ["director", "developer", "loss_supervisor", "loss_admin"].includes(role),
    baseScope: [], siglaScope: [], moduleScope,
  };
}

describe("matriz de acesso do painel", () => {
  it("mantém Diretoria e Desenvolvedor com visão total sem o módulo removido", () => {
    for (const role of ["director", "developer"] as const) {
      const current = profile(role);
      expect(canAccessSection(current, "visao-geral")).toBe(true);
      expect(canAccessSection(current, "configuracoes")).toBe(true);
      expect(modulesForProfile(current)).not.toContain("gestao-motoristas");
    }
  });

  it("mantém Supervisor Loss global no painel", () => {
    const current = profile("loss_supervisor");
    expect(canAccessSection(current, "gestao-pnr")).toBe(true);
    expect(canAccessSection(current, "bandeja-pnr")).toBe(true);
    expect(canAccessSection(current, "pre-faturamento")).toBe(true);
    expect(canAccessSection(current, "configuracoes")).toBe(true);
  });

  it("mantém Administração Loss nos módulos operacionais e importações", () => {
    const current = profile("loss_admin", ["visao-geral"]);
    expect(canAccessSection(current, "visao-geral")).toBe(true);
    expect(canAccessSection(current, "gestao-pnr")).toBe(true);
    expect(canAccessSection(current, "pre-faturamento")).toBe(true);
    expect(canAccessSection(current, "risco-lm")).toBe(true);
    expect(canAccessSection(current, "importacoes")).toBe(true);
    expect(canAccessSection(current, "configuracoes")).toBe(false);
    expect(hasFullAccess(current)).toBe(true);
    expect(canManageImports(current)).toBe(true);
    expect(canManageUsers(current)).toBe(false);
  });

  it("concede somente RH à administração e mantém motorista sem módulos", () => {
    for (const role of ["admin", "administration_supervisor"] as const) expect(modulesForProfile(profile(role))).toEqual(["rh"]);
    expect(modulesForProfile(profile("driver"))).toEqual([]);
  });

  it("não restaura permissões quando um escopo explícito está vazio", () => {
    expect(modulesForProfile(profile("supervisor", []))).toEqual([]);
  });

  it("mantém fallback apenas para perfis legados sem module_scope", () => {
    const current = profile("coordinator");
    expect(canAccessSection(current, "visao-geral")).toBe(true);
    expect(canAccessSection(current, "configuracoes")).toBe(false);
  });

  it("permite Atendimento independente de PNR sem liberar outras APIs operacionais", () => {
    const current = { ...profile("supervisor", ["perfil"]), atendimentoAccess: true };
    expect(canAccessSection(current, "atendimento")).toBe(true);
    expect(canAccessSection(current, "gestao-pnr")).toBe(false);
    expect(canAccessOperationalData(current)).toBe(false);
  });

  it("revoga Atendimento mesmo de cargos globais sem remover Prevenção de Perdas", () => {
    const current = { ...profile("director"), atendimentoAccess: false };
    expect(canAccessSection(current, "atendimento")).toBe(false);
    expect(canAccessSection(current, "gestao-pnr")).toBe(true);
  });

  it("preserva acesso legado e respeita o teto dos cargos nas novas liberações", () => {
    expect(canAccessSection(profile("coordinator", ["gestao-pnr"]), "atendimento")).toBe(true);
    expect(canAccessSection(profile("coordinator", ["perfil"]), "atendimento")).toBe(false);
    for (const role of ["admin", "administration_supervisor", "driver"] as const) {
      expect(canAccessSection({ ...profile(role), atendimentoAccess: true }, "atendimento")).toBe(false);
    }
  });
});
