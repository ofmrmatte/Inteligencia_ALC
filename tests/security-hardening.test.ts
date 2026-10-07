import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canManageRole,
  canManageUserTransition,
  manageableUserRoles,
} from "@/lib/auth";

describe("security hardening", () => {
  it("impede Supervisor Loss de promover usuários para cargos privilegiados", () => {
    const manager = { role: "loss_supervisor" as const };
    expect(manageableUserRoles(manager)).toEqual(["coordinator", "supervisor", "loss_admin"]);
    expect(canManageRole(manager, "director")).toBe(false);
    expect(canManageRole(manager, "developer")).toBe(false);
    expect(canManageUserTransition(manager, "coordinator", "director")).toBe(false);
  });

  it("mantém Diretoria, Desenvolvedor e Super Admin na matriz privilegiada", () => {
    expect(canManageRole({ role: "director" }, "developer")).toBe(true);
    expect(canManageRole({ role: "developer" }, "director")).toBe(true);
    expect(canManageRole({ role: "super_admin" }, "loss_supervisor")).toBe(true);
  });

  it("protege a API de usuários contra autoalteração e senha fraca", () => {
    const route = readFileSync("app/api/users/route.ts", "utf8");
    expect(route).toContain("sua própria conta não pode ser alterada");
    expect(route).toContain("pelo menos 12 caracteres");
    expect(route).toContain("canManageUserTransition");
    expect(route).toContain("writeUserAudit");
  });

  it("define headers de segurança e defesa contra CSRF", () => {
    const nextConfig = readFileSync("next.config.ts", "utf8");
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(nextConfig).toContain("Content-Security-Policy");
    expect(nextConfig).toContain("frame-ancestors 'none'");
    expect(nextConfig).toContain("Strict-Transport-Security");
    expect(nextConfig).toContain("X-Content-Type-Options");
    expect(proxy).toContain('fetchSite === "cross-site"');
    expect(proxy).toContain("Origem da requisição não autorizada");
  });

  it("restringe o Conector PNR somente à produção Railway", () => {
    const manifest = readFileSync("extension-pnr/src/manifest.json", "utf8");
    const bridge = readFileSync("extension-pnr/src/panel-bridge.js", "utf8");
    expect(manifest).toContain("inteligenciaalc-production.up.railway.app");
    expect(manifest).not.toContain("*.vercel.app");
    expect(manifest).not.toContain("localhost");
    expect(bridge).not.toContain("previewHost");
    expect(bridge).not.toContain("localhost");
  });
});
