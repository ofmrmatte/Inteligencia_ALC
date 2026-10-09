// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TemplateContractReview, TemplateContractPreview } from "../lib/template-contract-config";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../components/data", () => ({ api: mocks.api, labels: {}, useData: vi.fn() }));
import { TemplateContractEditor } from "../components/template-contracts";
const review: TemplateContractReview = { channel: "driver", revision: 1, sender: { phoneId: "***1234", wabaId: "***5678" },
  contract: { channel: "driver", name: "pnraberta", language: "pt_BR", category: "UTILITY",
    headerText: "Olá {{nome_motorista}}", bodyText: "Aviso para {{nome_motorista}}", footerText: null,
    buttons: [], parameters: { header: ["nome_motorista"], body: ["nome_motorista"] }, contentVersion: "a".repeat(64) } };
const preview: TemplateContractPreview = { expectedRevision: 1, fingerprint: "b".repeat(64),
  contract: { ...review.contract!, sender: { phoneId: "synthetic", wabaId: "synthetic" } } };
let root: Root, container: HTMLDivElement;
const refresh = vi.fn(async () => {});
beforeEach(async () => {
  vi.resetAllMocks();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<TemplateContractEditor review={review} refresh={refresh} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const submit = async () => act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
it("requires a successful comparison and explicit human review before saving the exact snapshot", async () => {
  expect(container.textContent).not.toContain("Salvar contrato revisado");
  mocks.api.mockResolvedValueOnce(preview);
  await submit();
  const save = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Salvar contrato revisado"))!;
  expect(save.disabled).toBe(true);
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(save.disabled).toBe(false);
  mocks.api.mockResolvedValueOnce({ revision: 2 });
  await act(async () => save.click());
  expect(mocks.api).toHaveBeenLastCalledWith("template-contracts", { kind: "save", ...preview, reviewed: true });
  expect(refresh).toHaveBeenCalledOnce();
});
it("removes approval controls after a mismatch and never saves", async () => {
  mocks.api.mockRejectedValueOnce(new Error("Rodapé divergente."));
  await submit();
  expect(container.textContent).toContain("Rodapé divergente.");
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  expect(mocks.api).toHaveBeenCalledTimes(1);
});
it("invalidates a previously checked preview when the draft changes", async () => {
  mocks.api.mockResolvedValueOnce(preview);
  await submit();
  await act(async () => {
    const add = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Adicionar botão"))!;
    add.click();
  });
  expect(container.textContent).not.toContain("Salvar contrato revisado");
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
});
