import { describe, expect, it } from "vitest";
import { canAccessDriverManagementTab, canAccessSection, driverManagementTabsForProfile, modulesForProfile } from "@/lib/access-control";
import { canManageImports, canManageUsers, hasFullAccess, type AuthProfile } from "@/lib/auth";

function profile(role: AuthProfile["role"], moduleScope?: string[], driverManagementScope?: string[]): AuthProfile {
  return { id: `${role}-1`, email: `${role}@alc.test`, fullName: role, role, globalAccess: role === "director" || role === "developer" || role === "loss_supervisor" || role === "loss_admin", baseScope: [], siglaScope: [], moduleScope, driverManagementScope };
}

describe("matriz de acesso do painel", () => {
  it("limita Administração à Gestão de Motoristas e às abas Pagamentos/Contestações", () => {
    const admin = profile("admin", ["gestao-motoristas"], ["payments", "disputes"]);
    expect(modulesForProfile(admin)).toEqual(["gestao-motoristas"]);
    expect(canAccessSection(admin, "visao-geral")).toBe(false);
    expect(canAccessDriverManagementTab(admin, "payments")).toBe(true);
    expect(canAccessDriverManagementTab(admin, "disputes")).toBe(true);
    expect(canAccessDriverManagementTab(admin, "drivers")).toBe(false);
    expect(canAccessDriverManagementTab(admin, "overview")).toBe(false);
  });

  it("mantém Diretoria e Desenvolvedor com visão total", () => {
    for (const role of ["director", "developer"] as const) {
      const current = profile(role);
      expect(canAccessSection(current, "visao-geral")).toBe(true);
      expect(canAccessSection(current, "configuracoes")).toBe(true);
      expect(canAccessSection(current, "gestao-motoristas")).toBe(true);
      expect(canAccessDriverManagementTab(current, "admins")).toBe(true);
    }
  });

  it("mantém Supervisor Loss global no painel, mas sem Gestão de Motoristas", () => {
    const current = profile("loss_supervisor");
    expect(canAccessSection(current, "visao-geral")).toBe(true);
    expect(canAccessSection(current, "gestao-pnr")).toBe(true);
    expect(canAccessSection(current, "pre-faturamento")).toBe(true);
    expect(canAccessSection(current, "configuracoes")).toBe(true);
    expect(canAccessSection(current, "gestao-motoristas")).toBe(false);
    expect(driverManagementTabsForProfile(current)).toEqual([]);
  });

  it("mantém Administração Loss nos módulos operacionais, com todas as bases e permissão de importar", () => {
    const current = profile("loss_admin", ["visao-geral", "gestao-pnr", "risco-lm", "perfil"], []);
    expect(modulesForProfile(current)).toEqual(["visao-geral", "gestao-pnr", "risco-lm", "perfil"]);
    expect(canAccessSection(current, "risco-lm")).toBe(true);
    expect(canAccessSection(current, "configuracoes")).toBe(false);
    expect(canAccessSection(current, "gestao-motoristas")).toBe(false);
    expect(driverManagementTabsForProfile(current)).toEqual([]);
    expect(hasFullAccess(current)).toBe(true);
    expect(canManageImports(current)).toBe(true);
    expect(canManageUsers(current)).toBe(false);
  });

  it("limita Supervisor de Administração ao módulo Gestão de Motoristas", () => {
    const current = profile("administration_supervisor", ["gestao-motoristas"], ["overview", "pilot", "drivers", "tickets", "payments", "disputes", "admins"]);
    expect(modulesForProfile(current)).toEqual(["gestao-motoristas"]);
    expect(driverManagementTabsForProfile(current)).toHaveLength(7);
    expect(canAccessSection(current, "pre-faturamento")).toBe(false);
  });

  it("não restaura permissões quando um escopo explícito está vazio", () => {
    const current = profile("supervisor", [], []);
    expect(modulesForProfile(current)).toEqual([]);
    expect(driverManagementTabsForProfile(current)).toEqual([]);
  });

  it("mantém fallback apenas para perfis legados sem os novos campos", () => {
    const current = profile("coordinator");
    expect(canAccessSection(current, "visao-geral")).toBe(true);
    expect(canAccessSection(current, "configuracoes")).toBe(false);
  });
});
