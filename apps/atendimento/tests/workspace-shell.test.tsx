import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({ path: "/conversas", sessionError: "", sessionId: "synthetic-user" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.path }));
vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("next/image", () => ({ default: ({ src, alt, width, height }: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement("img", { src, alt, width, height }) }));
vi.mock("../components/data", async (original) => ({ ...await original(), useData: (path: string) => ({
  data: path === "profile" ? { profile: { ...profile, id: mocks.sessionId } } : null,
  error: path === "profile" ? mocks.sessionError : "", refresh: vi.fn(),
}) }));

import { WorkspaceShell } from "../components/workspace-shell";
import { Conversations } from "../components/conversations";
import { Overview } from "../components/overview";
import { Cases } from "../components/cases";
import { Dispatches } from "../components/dispatches";
import { Administration } from "../components/administration";

const profile = { id: "synthetic-user", email: "synthetic@example.test", fullName: "Synthetic", role: "developer" as const, globalAccess: true, baseScope: [], siglaScope: [] };
it.each([
  ["/conversas", "CAIXA DE ATENDIMENTO", "Conversas", Conversations],
  ["/visao-geral", "MONITORAMENTO OPERACIONAL", "Visão Geral", Overview],
  ["/pnrs", "GESTÃO DE CASOS", "PNRs", Cases],
  ["/disparos/clientes", "MENSAGENS OPERACIONAIS", "Disparo Cliente", Dispatches],
  ["/disparos/motoristas", "MENSAGENS OPERACIONAIS", "Disparo Motorista", Dispatches],
  ["/admin", "CONFIGURAÇÕES", "Ajustes", Administration],
] as const)("usa um único título de seção no cabeçalho de %s", (path, eyebrow, title, View) => {
  mocks.path = path;
  mocks.sessionError = "";
  mocks.sessionId = profile.id;
  const html = renderToStaticMarkup(<WorkspaceShell profile={profile} inteligenciaUrl="https://synthetic.example.test"><View /></WorkspaceShell>);
  expect(html).toContain(`<span>${eyebrow}</span><h1>${title}</h1>`);
  expect(html.match(/<h1>/g)).toHaveLength(1);
  expect(html).not.toContain("<strong>ALC Atendimento</strong>");
  expect(html).toContain("Desenvolvedor");
  // The sole global refresh control is immediately to the right of the role badge.
  const roleIndex = html.indexOf('class="user-chip"');
  const refreshIndex = html.indexOf('aria-label="Atualizar dados desta página"');
  expect(roleIndex).toBeGreaterThan(-1);
  expect(refreshIndex).toBeGreaterThan(roleIndex);
  expect(html.slice(roleIndex, refreshIndex)).toContain("Desenvolvedor");
  expect(html.match(/aria-label="Atualizar dados desta página"/g)).toHaveLength(1);
  expect(html).not.toContain('aria-label="Atualizar indicadores"');
  expect(html).not.toContain('aria-label="Atualizar disparos"');
  expect(html).toContain('href="/disparos/clientes"');
  expect(html).toContain('href="/disparos/motoristas"');
  expect(html).not.toContain("Clientes e envios");
  expect(html).not.toContain("ADMINISTRAÇÃO");
});
it.each(["unavailable", "changed-account"])("remove os dados privados do shell em %s", (condition) => {
  mocks.sessionError = condition === "unavailable" ? "Sessão encerrada" : "";
  mocks.sessionId = condition === "changed-account" ? "other-user" : profile.id;
  const html = renderToStaticMarkup(<WorkspaceShell profile={profile} inteligenciaUrl="https://synthetic.example.test"><div>PRIVATE-CONVERSATION</div></WorkspaceShell>);
  expect(html).not.toContain("PRIVATE-CONVERSATION");
});
it("mantém os tempos do menu e drawer do Inteligencia e respeita movimento reduzido", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  expect(css).toContain("transition: width 180ms ease, transform 180ms ease");
  expect(css).toContain("transition: margin-left 180ms ease");
  expect(css).toContain("animation: detail-in 180ms ease-out");
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: .01ms !important;[\s\S]*transition-duration: .01ms !important;/);
});
it("coloca atualização junto da etiqueta sem uma linha extra acima dos filtros", () => {
  const html = renderToStaticMarkup(<Conversations />);
  expect(html).toMatch(/class="inbox-label-filter"[\s\S]*Filtrar etiqueta[\s\S]*aria-label="Atualizar conversas"/);
  expect(html).not.toContain('class="page-tools"');
  expect(html).toMatch(/class="list-search"[\s\S]*class="conversation-count"/);
});
