import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  records: [
    { id: "enabled", email: "enabled@example.test", full_name: "Enabled User", role: "supervisor", active: true, atendimentoActive: true },
    { id: "disabled", email: "disabled@example.test", full_name: "Disabled User", role: "supervisor", active: true, atendimentoActive: false },
    { id: "inactive", email: "inactive@example.test", full_name: "Inactive User", role: "supervisor", active: false, atendimentoActive: true },
  ],
}));
vi.mock("../components/data", () => ({
  api: vi.fn(),
  useData: () => ({ data: { records: state.records }, error: null, refresh: vi.fn() }),
  labels: { client: "Cliente", driver: "Motorista" },
  when: (value: string) => value,
}));
vi.mock("../components/collector", () => ({ Collector: () => null }));

import { Users } from "../components/administration";

afterEach(() => {
  state.records = [
    { id: "enabled", email: "enabled@example.test", full_name: "Enabled User", role: "supervisor", active: true, atendimentoActive: true },
    { id: "disabled", email: "disabled@example.test", full_name: "Disabled User", role: "supervisor", active: true, atendimentoActive: false },
    { id: "inactive", email: "inactive@example.test", full_name: "Inactive User", role: "supervisor", active: false, atendimentoActive: true },
  ];
});

it("exibe apenas usuarios ativos e habilitados no Atendimento", () => {
  const html = renderToStaticMarkup(<Users />);
  expect(html).toContain("Enabled User");
  expect(html).not.toContain("Disabled User");
  expect(html).not.toContain("Inactive User");
  expect(html).toContain("Desativar");
  expect(html).not.toContain("Habilitar");
  expect(html).toContain("Inteligência ALC");
});

it("mostra um estado vazio quando nao existem usuarios habilitados", () => {
  state.records = [];
  const html = renderToStaticMarkup(<Users />);
  expect(html).toContain("Nenhum usuário habilitado no Atendimento.");
});
