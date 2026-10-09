import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  detail: {
    conversation: {
      id: "synthetic-conversation",
      name: "Contato sintético",
      phone: "5511999990000",
      channel: "client",
      status: "human",
      unread: 0,
      updated_at: "2026-10-09T12:00:00.000Z",
      assigned_to: "synthetic-agent",
      labels: [],
      identity_verified: true,
      driver_id: "synthetic-driver",
      base_key: "BASE TESTE",
      sigla: "TST",
      case_id: "synthetic-case",
      last_inbound_at: "2026-10-09T12:00:00.000Z",
      agent_state: { step: "staff" },
    },
    messages: [
      {
        id: "synthetic-in",
        direction: "in",
        body: "Mensagem recebida de teste.",
        status: "received",
        created_at: "2026-10-09T12:01:00.000Z",
        sender_kind: "contact",
      },
      {
        id: "synthetic-out",
        direction: "out",
        body: "Resposta enviada de teste.",
        status: "sent",
        created_at: "2026-10-09T12:02:00.000Z",
        sender_kind: "human",
        sender_display_name_snapshot: "Atendente sintética",
      },
      {
        id: "synthetic-note",
        direction: "note",
        body: "Nota visível somente à equipe.",
        status: "sent",
        created_at: "2026-10-09T12:03:00.000Z",
        sender_kind: "human",
        sender_display_name_snapshot: "Atendente sintética",
      },
    ],
    queued: [
      {
        id: "synthetic-uncertain",
        payload: { text: { body: "Envio sem confirmação." } },
        status: "uncertain",
        error: "Confirme o status antes de tentar novamente.",
        created_at: "2026-10-09T12:04:00.000Z",
        sender_kind: "human",
        sender_display_name_snapshot: "Atendente sintética",
      },
    ],
    cases: [],
    hasMore: false,
  },
}));

vi.mock("../components/data", () => ({
  api: vi.fn(async () => ({})),
  useData: (path: string) => ({
    data: path.startsWith("messages?")
      ? fixtures.detail
      : path.startsWith("conversations?")
        ? { records: [fixtures.detail.conversation], total: 1, unread: 0, limit: 30 }
        : path.startsWith("agents")
          ? { records: [{ id: "synthetic-agent", name: "Atendente sintética" }] }
          : { profile: { id: "synthetic-agent" }, admin: false },
    error: "",
    refresh: vi.fn(async () => {}),
  }),
  labels: { received: "Recebido", sent: "Enviado", uncertain: "Conferir envio" },
  when: (date: string) => date,
}));

import { Conversations } from "../components/conversations";

it("renders synthetic WhatsApp bubbles without flattening authorship or uncertain delivery", () => {
  const html = renderToStaticMarkup(
    <Conversations initialSelected="synthetic-conversation" />,
  );

  expect(html).toContain('class="message in"');
  expect(html).toContain('class="message out"');
  expect(html).toContain('class="message note"');
  expect(html).toContain("Contato sintético");
  expect(html).toContain("Atendente sintética");
  expect(html).toContain("Nota interna · Atendente sintética");
  expect(html).toContain("Conferir envio");
  expect(html).toContain("Confirme o status antes de tentar novamente.");
  expect(html).toContain("2026-10-09T12:04:00.000Z");
});

it.each(["sent", "delivered", "read"])("only shows confirmed delivery icons for %s", status => {
  fixtures.detail.messages[1].status = status;
  const html = renderToStaticMarkup(<Conversations initialSelected="synthetic-conversation" />);
  expect(html).toContain(`aria-label="${status === "sent" ? "Enviado" : status}"`);
  expect(html).toContain('class="message-day"');
  expect(html).toMatch(/datetime="2026-10-09T12:02:00.000Z"/i);
  expect(html).toContain("Conferir envio");
  expect(html.includes('message-status is-read')).toBe(status === "read");
});
