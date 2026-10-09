// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn(), refreshAi: vi.fn(), useData: vi.fn() }));
vi.mock("../components/data", () => ({ api: mocks.api, useData: mocks.useData, when: (value: string) => value || "—", PRIVATE_CONTENT_CLEARED_EVENT: "atendimento:private-cleared" }));
import { AgentPanel } from "../components/agent-panel";
import { AGENT_GUARDRAILS, CUSTOMER_STEPS, DRIVER_STEPS } from "../lib/agent-playbook";
let root: Root, container: HTMLDivElement;
const config = { revision: 4, enabled: false, provider: "openai", model: "", dailyCallLimit: 10, timeoutMs: 8000 };
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  mocks.api.mockResolvedValue({ ok: true });
  mocks.useData.mockImplementation(resource => resource.startsWith("ai-models") ? { data: { models: [{ id: "gpt-4.1-mini", label: "gpt-4.1-mini" }], fetchedAt: "2026-10-09T12:00:00Z" }, refresh: mocks.refreshAi } : resource === "ai-config"
    ? { data: { config, used: 2, remaining: 8, credentialEnv: "OPENAI_API_KEY", credentials: { openai: { configured: false, source: "absent", stored: false }, gemini: { configured: false, source: "absent", stored: false } }, diagnostic: { effective: "rules", lastTest: null } }, refresh: mocks.refreshAi }
    : { data: { revision: 7, client: CUSTOMER_STEPS.map(step => ({ ...step, channel: "client" })), driver: DRIVER_STEPS.map(step => ({ ...step, channel: "driver" })), policies: AGENT_GUARDRAILS }, refresh: mocks.refresh });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<AgentPanel/>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(button => button.textContent?.includes(text))!;
  await act(async () => button.click());
}
it("shows Ellie, off by default and daily usage without exposing stored credentials", async () => {
  expect(container.textContent).toContain("Instruções da Ellie");
  expect(container.textContent).toContain("Regras determinísticas");
  expect(container.textContent).toContain("2 / 10");
  await click("Configurar IA");
  expect(container.querySelector<HTMLInputElement>("input[type=checkbox]")?.checked).toBe(false);
  expect(container.querySelector("input[type=password]")).toBeNull();
  const model = [...container.querySelectorAll("label")].find(label => label.textContent?.includes("Modelos de texto disponíveis para teste"))!.querySelector("select")!;
  expect(model.required).toBe(false);
  await act(async () => container.querySelector<HTMLInputElement>("input[type=checkbox]")!.click());
  expect(model.required).toBe(true);
  expect(model.value).toBe("");
  expect(container.querySelector<HTMLInputElement>("input[max='8']")?.value).toBe("8");
});
it("loads a compatible model select and keeps credentials outside the config payload", async () => {
  await click("Configurar IA"); await click("Catálogo");
  expect(container.querySelectorAll("option")[2]?.textContent).not.toContain("secret");
  expect([...container.querySelectorAll("select option")].some(option => option.textContent === "gpt-4.1-mini")).toBe(true);
  await click("Cadastrar credencial");
  expect(container.querySelector<HTMLInputElement>("input[type=password]")?.value).toBe("");
  expect(container.querySelector<HTMLInputElement>("input[type=password]")?.autocomplete).toBe("off");
});
it("submits the exact optimistic config revision and retains the draft after a conflict", async () => {
  await click("Configurar IA");
  mocks.api.mockRejectedValueOnce(new Error("Conflito de revisão"));
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.api).toHaveBeenCalledWith("ai-config", config);
  expect(container.querySelector("form")).not.toBeNull();
  expect(container.textContent).toContain("Conflito de revisão");
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.refreshAi).toHaveBeenCalledOnce();
  expect(container.querySelector("form")).toBeNull();
});
it("preserves script revision saves and keeps C01 human operator placeholders", async () => {
  const article = container.querySelector("article")!;
  await act(async () => [...article.querySelectorAll("button")].find(button => button.textContent?.includes("Editar"))!.click());
  await click("Salvar instrução");
  expect(mocks.api).toHaveBeenCalledWith("agent-instructions", expect.objectContaining({ kind: "script", revision: 7, entry: expect.objectContaining({ code: "C01", example: expect.stringContaining("[Seu Nome]") }) }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("does not falsely label AI off when configuration cannot be verified", async () => {
  const previous = mocks.useData.getMockImplementation()!;
  mocks.useData.mockImplementation(resource => resource === "ai-config" ? { error: "Configuração indisponível", refresh: mocks.refreshAi } : previous(resource));
  await act(async () => root.render(<AgentPanel/>));
  expect(container.textContent).toContain("Configuração não verificada");
  expect(container.querySelector("[role=alert]")?.textContent).toContain("Configuração indisponível");
  expect(container.textContent).not.toContain("Regras determinísticas");
});
it("requires explicit billing confirmation for connection tests and cancellation never calls the provider", async () => {
  const previous = mocks.useData.getMockImplementation()!;
  mocks.useData.mockImplementation(resource => resource === "ai-config" ? {
    ...previous(resource), data: { ...previous(resource).data, config: { ...config, model: "gpt-4.1-mini" }, credentials: { openai: { configured: true, source: "environment", stored: false } } },
  } : previous(resource));
  await act(async () => root.render(<AgentPanel />));
  await click("Configurar IA");
  await click("Testar conexão");
  expect(container.querySelector("dialog")?.textContent).toContain("pode ser faturada");
  await act(async () => container.querySelector<HTMLButtonElement>("dialog footer button")!.click());
  expect(mocks.api).not.toHaveBeenCalled();
  await click("Testar conexão");
  mocks.api.mockResolvedValueOnce({ result: "ready", testedAt: "2026-10-09T12:00:00Z", provider: "openai", model: "gpt-4.1-mini" });
  await click("Confirmar teste faturável");
  expect(mocks.api).toHaveBeenCalledExactlyOnceWith("ai-test", { provider: "openai", model: "gpt-4.1-mini", timeoutMs: 8000, confirmed: true });
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.textContent).toContain("resposta estruturada confirmadas");
});
it("hands the transient key to MFA only and clears it on session invalidation", async () => {
  await click("Configurar IA");
  await click("Cadastrar credencial");
  const password = container.querySelector<HTMLInputElement>("input[type=password]")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(password, "synthetic-key-never-real");
    password.dispatchEvent(new Event("input", { bubbles: true }));
  });
  mocks.api.mockResolvedValueOnce({ factors: [{ id: "synthetic-factor", friendlyName: "TOTP" }] });
  await click("Salvar credencial");
  expect(container.querySelector("input[type=password]")).toBeNull();
  expect(mocks.api).toHaveBeenCalledExactlyOnceWith("ai-credentials");
  expect(container.querySelector("dialog")?.textContent).toContain("MFA");
  expect(container.textContent).not.toContain("synthetic-key-never-real");
  await act(async () => window.dispatchEvent(new Event("atendimento:private-cleared")));
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.querySelector("form")).toBeNull();
  expect(mocks.api).not.toHaveBeenCalledWith("ai-config", expect.objectContaining({ apiKey: expect.any(String) }));
});
