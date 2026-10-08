import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { NAVIGATION } from "@/lib/navigation";
import { Sidebar } from "@/components/sidebar";
import { HrView } from "@/components/views/hr-view";
import type { AuthProfile } from "@/lib/auth";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
const profile: AuthProfile = { id: "synthetic", fullName: "Revisão", email: "synthetic@example.test", role: "developer", globalAccess: true, baseScope: [], siglaScope: [] };

describe("RH native UI and navigation", () => {
  it("RH fica em Administração e Configurações/Perfil em Ajustes sem links duplicados", () => {
    expect(NAVIGATION.find((item) => item.id === "rh")?.group).toBe("Administração");
    for (const id of ["configuracoes", "perfil"]) expect(NAVIGATION.find((item) => item.id === id)?.group).toBe("Ajustes");
    expect(new Set(NAVIGATION.map((item) => item.id)).size).toBe(NAVIGATION.length);
    const html = renderToStaticMarkup(React.createElement(Sidebar, { active: "rh", collapsed: false, profile, canImport: false, onToggle() {}, onImport() {} }));
    const admin = html.indexOf("<p>Administração</p>");
    const adjustments = html.indexOf("<p>Ajustes</p>");
    expect(admin).toBeGreaterThan(html.indexOf("<p>Controle de dados</p>"));
    expect(adjustments).toBeGreaterThan(admin);
    expect(html.indexOf('href="/rh"')).toBeGreaterThan(admin);
    expect(html.indexOf('href="/rh"')).toBeLessThan(adjustments);
    expect(html.indexOf('href="/configuracoes"')).toBeGreaterThan(adjustments);
    expect(html.indexOf('href="/perfil"')).toBeGreaterThan(adjustments);
  });
  it("HrView usa view-stack sem segundo shell/topbar e Recrutamento aparece só na tab desabilitada", () => {
    const html = renderToStaticMarkup(React.createElement(HrView, { profile }));
    expect(html).toContain('class="view-stack"');
    expect(html).not.toMatch(/<header|<aside|<h1|app-shell|page-canvas|RH administrativo/);
    expect(html.match(/Recrutamento/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>Recrutamento/);
    expect(html).toContain("Em preparação");
  });
  it("RH herda tema e componentes globais sem CSS de dark shell próprio", () => {
    const css = readFileSync("components/views/hr-view.module.css", "utf8");
    expect(css).not.toMatch(/prefers-color-scheme|data-theme|--hr-surface|--hr-input|color-scheme|#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/:global\(\.(panel|kpi-card|table-wrap|secondary-button|page-intro)\)/);
    const view = readFileSync("components/views/hr-view.tsx", "utf8");
    for (const component of ["Panel", "KpiCard", "StatusBadge", "TableWrap"]) expect(view).toContain(`<${component}`);
  });
});
