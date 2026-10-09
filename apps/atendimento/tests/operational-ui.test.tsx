// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  useData: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../components/data", () => ({
  api: mocks.api,
  useData: mocks.useData,
  when: (v: string) => v || "—",
  labels: { aguardando_comprovante: "Aguardando comprovante" },
}));
import { AgentManagement } from "../components/agent-management";
import { Overview } from "../components/overview";
import { AutomationForm } from "../components/administration";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
const units = ["A", "B"].map((s) => ({
  unit_key: `test-${s}`,
  sigla: `TEST-${s}`,
  base_key: `BASE ${s}`,
  base_name: `City ${s}`,
  xpt_code: "",
  coordinator_name: "Reference coordinator",
  supervisors: ["Reference supervisor"],
}));
const operator = {
  user_id: A,
  name: "Explicit agent",
  active: true,
  available: true,
  receiving: true,
  roles: ["agent"],
  identityEnabled: true,
  conversations: 4,
  bases: [{ unit_key: "test-A", responsibility: "primary" }],
};
const directory = {
  units,
  records: [operator],
  profiles: [
    { id: A, name: "Explicit agent", unitKeys: ["test-A"] },
    { id: B, name: "New central identity", unitKeys: ["test-B"] },
  ],
};
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  mocks.api.mockResolvedValue({ ok: true });
  mocks.refresh.mockResolvedValue(undefined);
  mocks.useData.mockImplementation((path) => ({
    data:
      path === "operators"
        ? directory
        : path === "assignment-policy"
          ? { policy: { mode: "manual" } }
          : {
              records: [
                {
                  case_id: "TEST-PNR",
                  base_key: "BASE A",
                  sigla: "TEST-A",
                  classification: "aguardando_comprovante",
                  assigned_to: A,
                  version: 7,
                },
              ],
              summary: {
                total: 1,
                assigned: 1,
                unassigned: 0,
                recentRedistributions: 2,
              },
            },
    refresh: mocks.refresh,
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  )!;
  await act(async () => button.click());
}
async function input(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
async function submit() {
  await act(async () =>
    container
      .querySelector("dialog form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
it("opens, edits and saves only authorized attendance bases, then restores focus", async () => {
  await render(<AgentManagement />);
  const button = container.querySelector<HTMLButtonElement>(
    '[aria-label="Editar Explicit agent"]',
  )!;
  button.focus();
  await act(async () => button.click());
  expect(container.querySelector("dialog")?.open).toBe(true);
  expect(
    container.querySelector(".management-unit-options")?.textContent,
  ).toContain("City A");
  expect(
    container.querySelector(".management-unit-options")?.textContent,
  ).not.toContain("City B");
  await input(
    container.querySelector<HTMLInputElement>(
      '[aria-label="Buscar bases autorizadas"]',
    )!,
    "absent",
  );
  expect(
    container.querySelector(".management-unit-options")?.textContent,
  ).toContain("Nenhuma base autorizada");
  await input(
    container.querySelector<HTMLInputElement>(
      '[aria-label="Buscar bases autorizadas"]',
    )!,
    "TEST-A",
  );
  await click("Desmarcar filtradas");
  expect(container.textContent).toContain("0 selecionadas");
  await click("Selecionar filtradas");
  await submit();
  expect(mocks.api).toHaveBeenCalledWith(
    "operators",
    expect.objectContaining({
      userId: A,
      bases: [{ unitKey: "test-A", responsibility: "primary" }],
    }),
  );
  expect(container.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(button);
});
it("lists only explicit attendants while preserving management roles when enrolling an existing operator", async () => {
  const managementOnly = {
    ...operator,
    user_id: B,
    name: "Management-only identity",
    roles: ["supervisor"],
    bases: [{ unit_key: "test-B", responsibility: "substitute" }],
  };
  mocks.useData.mockReturnValue({ data: { ...directory, records: [operator, managementOnly] }, refresh: mocks.refresh });
  await render(<AgentManagement />);
  expect(container.textContent).toContain("Explicit agent");
  expect(container.textContent).not.toContain("Management-only identity");
  await click("Adicionar atendente");
  await input(container.querySelector<HTMLSelectElement>("dialog select")!, B);
  await submit();
  expect(mocks.api).toHaveBeenCalledWith("operators", expect.objectContaining({
    userId: B,
    roles: ["supervisor", "agent"],
    bases: [{ unitKey: "test-B", responsibility: "substitute" }],
  }));
});

it("retains an editor draft after a denied save and allows cancellation", async () => {
  await render(<AgentManagement />);
  await click("Adicionar atendente");
  await input(container.querySelector<HTMLSelectElement>("dialog select")!, B);
  await click("Selecionar filtradas");
  mocks.api.mockRejectedValueOnce(new Error("Acesso revogado"));
  await submit();
  expect(container.querySelector("dialog [role=alert]")?.textContent).toBe(
    "Acesso revogado",
  );
  expect(container.textContent).toContain("1 selecionadas");
  await click("Cancelar");
  expect(container.querySelector("dialog")).toBeNull();
});
it("edits coverage separately without a user or organogram editor", async () => {
  await render(<AgentManagement section="bases" />);
  expect(container.textContent).toContain("não recebem acesso ao Atendimento");
  expect(container.textContent).not.toContain("Adicionar atendente");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Configurar cobertura TEST-A City A"]',
      )!
      .click(),
  );
  expect(container.querySelector("dialog")?.textContent).toContain(
    "Reference coordinator",
  );
  expect(container.querySelector("dialog")?.textContent).not.toContain(
    "Usuário existente",
  );
  await submit();
  expect(mocks.api).toHaveBeenCalledWith("coverage", {
    unitKey: "test-A",
    expected: [{ userId: A, responsibility: "primary" }],
    assignments: [{ userId: A, responsibility: "primary" }],
  });
});
it("requires a reason, posts the assignment version, and retains a conflicted transfer", async () => {
  await render(<AgentManagement section="queue" />);
  await input(
    container.querySelector<HTMLSelectElement>(
      '[aria-label="Responsável PNR TEST-PNR"]',
    )!,
    "",
  );
  expect(container.querySelector("dialog")?.textContent).toContain(
    "Sem responsável",
  );
  await input(
    container.querySelector("dialog textarea")!,
    "Reassignment reason",
  );
  mocks.api.mockRejectedValueOnce(new Error("Atribuição alterada"));
  await submit();
  expect(mocks.api).toHaveBeenCalledWith("assignments", {
    caseId: "TEST-PNR",
    assignedTo: null,
    version: 7,
    reason: "Reassignment reason",
  });
  expect(container.querySelector("dialog [role=alert]")?.textContent).toBe(
    "Atribuição alterada",
  );
  await submit();
  expect(container.querySelector("dialog")).toBeNull();
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it.each([null, "invalid", "", "   "])(
  "renders confirmed financial cards without treating missing value %j as zero",
  async (unknownValue) => {
    mocks.useData.mockReturnValue({
      data: {
        open: 3,
        proof: 2,
        penalty: 1,
        human: 1,
        pending: 0,
        unread: 0,
        purchase_value_confirmed: "125.50",
        penalty_value_confirmed: null,
        proof_value_confirmed: unknownValue,
        purchase_value_unknown: 2,
        source: { syncStats: { new: 6, updated: 7 } },
        collector: { enabled: false },
        queue: [],
        authorship: { ai: 8, human: 9 },
      },
      refresh: mocks.refresh,
    });
    await render(<Overview />);
    const finances = container.querySelector(
      '[aria-label="Indicadores financeiros"]',
    )!;
    expect(finances.textContent).toContain("125,50");
    expect(finances.textContent?.match(/Subtotal confirmado/g)).toHaveLength(3);
    expect(finances.textContent?.match(/—/g)).toHaveLength(2);
    expect(finances.textContent).not.toContain("0,00");
    expect(container.querySelectorAll(".sync-group")).toHaveLength(4);
    expect(
      container.querySelectorAll(".sync-metrics .kpi-card__head i svg"),
    ).toHaveLength(15);
    expect(mocks.useData).toHaveBeenCalledWith("overview", 15000);
  },
);
it("preserves automation flags without posting a legacy operator or editable interval", async () => {
  await render(
    <AutomationForm
      initial={{
        driverNotifications: false,
        clientOutreach: false,
        bot: true,
        operatorName: "Legacy human",
        intervalMinutes: 30,
      }}
      refresh={mocks.refresh}
    />,
  );
  const switches =
    container.querySelectorAll<HTMLInputElement>('[role="switch"]');
  expect([...switches].map((s) => s.checked)).toEqual([false, false, true]);
  expect(container.textContent).toContain("atendente responsável pela PNR");
  expect(container.querySelector('input[type="text"]')).toBeNull();
  await act(async () => switches[0].click());
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(mocks.api).toHaveBeenCalledWith("automation", {
    driverNotifications: true,
    clientOutreach: false,
    bot: true,
    intervalMinutes: 30,
  });
});
