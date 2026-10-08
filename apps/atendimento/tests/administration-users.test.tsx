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

import { ChannelCard, Users } from "../components/administration";

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

it("mostra controle de revelação do token Meta por canal, oculto até autorização explícita", () => {
  const html = renderToStaticMarkup(
    <ChannelCard channel={{
      channel: "client",
      number: "5511999990000",
      phoneId: "123450000",
      wabaId: "876540000",
      tokenConfigured: true,
      secretConfigured: true,
      verifyConfigured: true,
      webhook: "https://alc.example.test/webhooks/whatsapp/client",
    }} refresh={async () => {}} />,
  );
  expect(html).toContain("Token de verificação para o painel Meta");
  expect(html).toContain("Não é o token de acesso ao WhatsApp.");
  expect(html).toContain('aria-label="Mostrar token de verificação"');
  expect(html).not.toContain('aria-label="Copiar token de verificação"');
  expect(html).toContain("oculto");
  expect(html).toContain("https://alc.example.test/webhooks/whatsapp/client");
});

it("orienta cadastrar o token quando a verificação ainda não está configurada", () => {
  const html = renderToStaticMarkup(
    <ChannelCard channel={{
      channel: "driver",
      number: "5511999990001",
      phoneId: "123450001",
      wabaId: "876540001",
      tokenConfigured: false,
      secretConfigured: false,
      verifyConfigured: false,
      webhook: "https://alc.example.test/webhooks/whatsapp/driver",
    }} refresh={async () => {}} />,
  );
  expect(html).toContain("Ainda não configurado");
  expect(html).toContain("Clique em Configurar canal");
  expect(html).not.toContain('aria-label="Mostrar token de verificação"');
});
