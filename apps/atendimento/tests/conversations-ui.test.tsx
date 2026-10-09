// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  api: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
  refresh: vi.fn(async () => {}),
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
  api: fixtures.api,
  useData: (path: string) => ({
    data: path.startsWith("messages?")
      ? fixtures.detail
      : path.startsWith("conversations?")
        ? {
            records: [fixtures.detail.conversation],
            total: 1,
            unread: 0,
            limit: 30,
          }
        : path.startsWith("agents")
          ? {
              records: [{ id: "synthetic-agent", name: "Atendente sintética" }],
            }
          : { profile: { id: "synthetic-agent" }, admin: false },
    error: "",
    refresh: fixtures.refresh,
  }),
  labels: {
    received: "Recebido",
    sent: "Enviado",
    uncertain: "Conferir envio",
  },
  when: (date: string) => date,
}));

import { Conversations } from "../components/conversations";
const initial = structuredClone(fixtures.detail);
let root: Root | undefined, container: HTMLDivElement;
let resizeObservers: { targets: Set<Element>; run: () => void }[];
beforeEach(() => {
  fixtures.detail = structuredClone(initial);
  fixtures.api.mockReset().mockResolvedValue({});
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T12:10:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  resizeObservers = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry: { targets: Set<Element>; run: () => void };
      constructor(callback: () => void) {
        this.entry = { targets: new Set(), run: callback };
        resizeObservers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.targets.add(target);
      }
      disconnect() {
        this.entry.targets.clear();
      }
    },
  );
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(<Conversations initialSelected="synthetic-conversation" />),
  );
}
async function type(body: string) {
  const textarea = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(textarea, body);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return textarea;
}

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

it.each(["sent", "delivered", "read"])(
  "only shows confirmed delivery icons for %s",
  (status) => {
    fixtures.detail.messages[1].status = status;
    const html = renderToStaticMarkup(
      <Conversations initialSelected="synthetic-conversation" />,
    );
    expect(html).toContain(
      `aria-label="${status === "sent" ? "Enviado" : status}"`,
    );
    expect(html).toContain('class="message-day"');
    expect(html).toMatch(/datetime="2026-10-09T12:02:00.000Z"/i);
    expect(html).toContain("Conferir envio");
    expect(html.includes("message-status is-read")).toBe(status === "read");
  },
);
it("uses Ellie for AI only and preserves historical human snapshots", () => {
  fixtures.detail.messages[0].direction = "out";
  fixtures.detail.messages[0].sender_kind = "ai";
  const html = renderToStaticMarkup(
    <Conversations initialSelected="synthetic-conversation" />,
  );
  expect(html).toContain("Ellie · Agente virtual");
  expect(html).toContain("Nota interna · Atendente sintética");
  expect(html).toContain("Atendente sintética · envio");
});
it("groups queued days chronologically using HH:mm timestamps", () => {
  fixtures.detail.queued[0].created_at = "2026-10-10T12:04:00.000Z";
  const html = renderToStaticMarkup(
    <Conversations initialSelected="synthetic-conversation" />,
  );
  expect(html.match(/class="message-day"/g)).toHaveLength(2);
  expect(html).toContain("09:04");
  expect(html).not.toContain("Criptografia");
});
it("preserves an audited historical AI snapshot and named human authors", () => {
  Object.assign(fixtures.detail.messages[0], {
    direction: "out",
    sender_kind: "ai",
    sender_display_name_snapshot: "Assistente histórico ALC",
  });
  fixtures.detail.messages[1].sender_display_name_snapshot = "Ellie humana";
  const html = renderToStaticMarkup(
    <Conversations initialSelected="synthetic-conversation" />,
  );
  expect(html).toContain("Assistente histórico ALC · Agente virtual");
  expect(html).toContain("Ellie humana");
  expect(html).not.toContain("Ellie humana · Agente virtual");
  expect(html).not.toContain("Ellie · Agente virtual");
});
it("uses Ellie only as fallback for a generic AI snapshot", () => {
  Object.assign(fixtures.detail.messages[0], {
    direction: "out",
    sender_kind: "ai",
    sender_display_name_snapshot: "Agente virtual",
  });
  expect(
    renderToStaticMarkup(
      <Conversations initialSelected="synthetic-conversation" />,
    ),
  ).toContain("Ellie · Agente virtual");
});
it.each(["Ellie", "Automação histórica ALC"])(
  "preserves system snapshot %s with explicit system authorship",
  (snapshot) => {
    Object.assign(fixtures.detail.messages[1], {
      sender_kind: "system",
      sender_display_name_snapshot: snapshot,
    });
    const html = renderToStaticMarkup(
      <Conversations initialSelected="synthetic-conversation" />,
    );
    expect(html).toContain(`${snapshot} · Sistema`);
    expect(html).not.toContain(`${snapshot} · Agente virtual`);
  },
);
it("does not label a human named Ellie as an agent or system", () => {
  fixtures.detail.messages[1].sender_display_name_snapshot = "Ellie";
  const html = renderToStaticMarkup(
    <Conversations initialSelected="synthetic-conversation" />,
  );
  expect(html).toContain("Ellie</small>");
  expect(html).not.toContain("Ellie · Sistema");
  expect(html).not.toContain("Ellie · Agente virtual");
});
it("sends Enter but preserves Shift+Enter and IME composition", async () => {
  await mount();
  const textarea = await type("Mensagem sintética");
  const submit = vi
    .spyOn(HTMLFormElement.prototype, "requestSubmit")
    .mockImplementation(function (this: HTMLFormElement) {
      this.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
  await act(async () =>
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
      }),
    ),
  );
  await act(async () =>
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  expect(submit).not.toHaveBeenCalled();
  await act(async () =>
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(fixtures.api).toHaveBeenCalledWith("conversation", {
    id: "synthetic-conversation",
    action: "reply",
    body: "Mensagem sintética",
  });
  expect(textarea.value).toBe("");
  submit.mockRestore();
});
it.each([
  ["synthetic-other", "2026-10-09T12:00:00Z"],
  ["synthetic-agent", "2026-10-07T12:00:00Z"],
])(
  "keeps ownership and the 24-hour window while allowing a distinct internal note: %s / %s",
  async (assignedTo, lastInbound) => {
    fixtures.detail.conversation.assigned_to = assignedTo;
    fixtures.detail.conversation.last_inbound_at = lastInbound;
    await mount();
    expect(container.querySelector("textarea")!.disabled).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Anexar arquivo"]',
      )!.disabled,
    ).toBe(true);
    expect(
      container.querySelector<HTMLSelectElement>(
        '[aria-label="Atribuir responsável"]',
      )!.disabled,
    ).toBe(true);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Escrever nota interna"]',
        )!
        .click(),
    );
    expect(container.querySelector("textarea")!.disabled).toBe(false);
    expect(document.activeElement).toBe(container.querySelector("textarea"));
    expect(container.querySelector(".composer-note")).not.toBeNull();
    expect(container.querySelector('[aria-label="Anexar arquivo"]')).toBeNull();
    await type("Nota sintética");
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Salvar nota"]')!
        .click(),
    );
    expect(fixtures.api).toHaveBeenCalledWith("conversation", {
      id: "synthetic-conversation",
      action: "note",
      body: "Nota sintética",
    });
    expect(
      fixtures.api.mock.calls.some(
        ([, payload]) => (payload as { action?: string })?.action === "reply",
      ),
    ).toBe(false);
  },
);
it("closes operational actions with Escape and returns keyboard focus", async () => {
  await mount();
  const menu = container.querySelector<HTMLDetailsElement>(".thread-menu")!;
  menu.open = true;
  await act(async () =>
    menu.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(menu.open).toBe(false);
  expect(document.activeElement).toBe(menu.querySelector("summary"));
});
it("opens contact details with focus and returns to the chat by Escape or the back button", async () => {
  await mount();
  const open = container.querySelector<HTMLButtonElement>(
    '[aria-label="Abrir detalhes do contato"]',
  )!;
  const panel = container.querySelector<HTMLElement>(".contact-details")!;
  const back = container.querySelector<HTMLButtonElement>(
    '[aria-label="Voltar à conversa"]',
  )!;
  await act(async () => open.click());
  expect(document.activeElement).toBe(panel);
  await act(async () =>
    panel.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(open);
  expect(
    container
      .querySelector(".conversation-workspace")
      ?.getAttribute("data-show-details"),
  ).toBe("false");
  await act(async () => open.click());
  await act(async () => back.click());
  expect(document.activeElement).toBe(open);
});
it("never offers a retry for an uncertain queued attachment", () => {
  Object.assign(fixtures.detail.queued[0], { media_id: "synthetic-media" });
  const html = renderToStaticMarkup(
    <Conversations initialSelected="synthetic-conversation" />,
  );
  expect(html).toContain("Conferir envio");
  expect(html).not.toContain("Tentar envio novamente");
});

it.each(["pending", "failed", "uncertain"])(
  "never marks unconfirmed %s queue items as delivered",
  async (status) => {
    fixtures.detail.queued[0].status = status;
    await mount();
    const queued = [...container.querySelectorAll(".message.out")].find(
      (element) => element.textContent?.includes("Envio sem confirmação."),
    )!;
    expect(queued.querySelector('.message-status [role="img"]')).toBeNull();
    expect(queued.querySelector(".status-badge")).not.toBeNull();
  },
);

it("renders private media before its caption and timestamp", async () => {
  Object.assign(fixtures.detail.messages[1], {
    attachment: {
      internalId: "synthetic-image",
      type: "image",
      mime: "image/png",
      status: "ready",
    },
  });
  await mount();
  const media = container.querySelector(".chat-media")!;
  expect(media.nextElementSibling?.textContent).toBe(
    "Resposta enviada de teste.",
  );
  expect(media.nextElementSibling?.nextElementSibling?.tagName).toBe("FOOTER");
});

it("hides history pagination after an empty last page", async () => {
  fixtures.detail.hasMore = true;
  fixtures.api.mockImplementation(async (path) =>
    String(path).startsWith("messages?")
      ? { messages: [], hasMore: false }
      : {},
  );
  await mount();
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".history-button")!.click(),
  );
  expect(container.querySelector(".history-button")).toBeNull();
});

it("keeps following media growth despite delayed programmatic scroll events, but respects reading older messages", async () => {
  await mount();
  const pane = container.querySelector<HTMLDivElement>(".messages")!;
  let height = 1000,
    top = 0;
  Object.defineProperties(pane, {
    scrollHeight: { get: () => height },
    clientHeight: { get: () => 300 },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.min(value, height - 300);
      },
    },
  });
  const observer = resizeObservers.find(({ targets }) => targets.has(pane))!;
  await act(async () => observer.run());
  expect(top).toBe(700);
  height = 1500;
  await act(async () => {
    pane.dispatchEvent(new Event("scroll", { bubbles: true }));
    observer.run();
  });
  expect(top).toBe(1200);
  pane.scrollTop = 100;
  await act(async () =>
    pane.dispatchEvent(new Event("scroll", { bubbles: true })),
  );
  height = 2000;
  await act(async () => observer.run());
  expect(top).toBe(100);
  pane.scrollTop = 1700;
  await act(async () =>
    pane.dispatchEvent(new Event("scroll", { bubbles: true })),
  );
  height = 2300;
  await act(async () => observer.run());
  expect(top).toBe(2000);
});

it("retains the reading position when earlier messages are prepended", async () => {
  fixtures.detail.hasMore = true;
  fixtures.api.mockImplementation(async (path) =>
    String(path).startsWith("messages?")
      ? {
          messages: [
            {
              ...fixtures.detail.messages[0],
              id: "synthetic-earlier",
              created_at: "2026-10-08T12:00:00Z",
              body: "Histórico sintético",
            },
          ],
          hasMore: true,
        }
      : {},
  );
  await mount();
  const pane = container.querySelector<HTMLDivElement>(".messages")!;
  let top = 100;
  Object.defineProperties(pane, {
    scrollHeight: {
      get: () => container.querySelectorAll(".message").length * 300,
    },
    clientHeight: { get: () => 200 },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = value;
      },
    },
  });
  await act(async () =>
    pane.dispatchEvent(new Event("scroll", { bubbles: true })),
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".history-button")!.click(),
  );
  expect(container.querySelectorAll(".message")).toHaveLength(5);
  expect(top).toBe(400);
  await act(async () =>
    resizeObservers.find(({ targets }) => targets.has(pane))!.run(),
  );
  expect(top).toBe(400);
  expect(container.querySelector(".message")!.textContent).toContain(
    "Histórico sintético",
  );
});
