// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("../components/data", () => ({ api }));

import {
  ChannelCredentialStepUp,
  type ChannelCredentialPayload,
} from "../components/channel-credential-step-up";

let root: Root;
let container: HTMLDivElement;
let showModal: typeof HTMLDialogElement.prototype.showModal;
let close: typeof HTMLDialogElement.prototype.close;

const payload: ChannelCredentialPayload = {
  operation: "change_webhook_critical",
  channel: "client",
  phoneId: "12345",
  wabaId: "67890",
  number: "+55 (11) 99999-9999",
  token: "combined-access-token",
  appSecret: "0123456789abcdef0123456789abcdef",
};
const factor = { id: "33333333-3333-4333-8333-333333333333", friendlyName: "Authenticator" };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  showModal = HTMLDialogElement.prototype.showModal;
  close = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  api.mockReset().mockResolvedValue({});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
  container.remove();
  vi.unstubAllGlobals();
});

async function mount(onComplete = vi.fn(), onCancel = vi.fn()) {
  api.mockResolvedValueOnce({ factors: [factor] });
  await act(async () => {
    root.render(
      <ChannelCredentialStepUp
        payload={payload}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    );
    await Promise.resolve();
  });
  return { onComplete, onCancel };
}

function inputCode(value: string) {
  const input = container.querySelector<HTMLInputElement>("input")!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return input;
}

async function submit() {
  await act(async () => {
    container.querySelector<HTMLFormElement>("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it("opens a native modal, focuses the code, and restores the previous focus", async () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  await mount();
  expect(container.querySelector("dialog")?.open).toBe(true);
  expect(document.activeElement).toBe(container.querySelector("input"));
  await act(async () => root.unmount());
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

it("keeps cancellation available while factors load and handles Escape when idle", async () => {
  const onCancel = vi.fn();
  api.mockImplementationOnce(() => new Promise(() => {}));
  await act(async () => root.render(
    <ChannelCredentialStepUp payload={payload} onComplete={vi.fn()} onCancel={onCancel} />,
  ));
  const cancel = [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancelar")!;
  expect(cancel.disabled).toBe(false);
  await act(async () => cancel.click());
  expect(onCancel).toHaveBeenCalledOnce();

  const dialog = container.querySelector<HTMLDialogElement>("dialog")!;
  const event = new Event("cancel", { bubbles: true, cancelable: true });
  dialog.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

it("disables every step-up control and refuses Escape while busy", async () => {
  let resolveChallenge!: (value: unknown) => void;
  await mount();
  api.mockImplementationOnce(() => new Promise((resolve) => { resolveChallenge = resolve; }));
  inputCode("123456");
  await submit();
  expect([...container.querySelectorAll("select,input,button")].every((control) => (control as HTMLInputElement).disabled)).toBe(true);
  const dialog = container.querySelector<HTMLDialogElement>("dialog")!;
  const event = new Event("cancel", { bubbles: true, cancelable: true });
  dialog.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  resolveChallenge({ challengeId: "44444444-4444-4444-8444-444444444444", factorId: factor.id, nonce: "nonce" });
});

it("passes the combined token payload and clears the OTP after success", async () => {
  const onComplete = vi.fn();
  await mount(onComplete);
  api
    .mockResolvedValueOnce({ challengeId: "44444444-4444-4444-8444-444444444444", factorId: factor.id, nonce: "nonce" })
    .mockResolvedValueOnce({ proofId: "55555555-5555-4555-8555-555555555555" })
    .mockResolvedValueOnce({ ok: true });
  const input = inputCode("123456");
  await submit();
  expect(api).toHaveBeenCalledWith("channel-credentials", expect.objectContaining({ action: "challenge", payload }));
  expect(api).toHaveBeenCalledWith("channel-credentials", expect.objectContaining({ action: "verify", payload }));
  expect(api).toHaveBeenCalledWith("channel-credentials", expect.objectContaining({ action: "execute", payload }));
  expect(input.value).toBe("");
  expect(onComplete).toHaveBeenCalledWith({ ok: true });
});

it("clears the OTP after a failed step-up", async () => {
  await mount();
  api.mockRejectedValueOnce(new Error("Codigo MFA invalido ou expirado."));
  const input = inputCode("654321");
  await submit();
  expect(input.value).toBe("");
  expect(container.textContent).toContain("Codigo MFA invalido ou expirado.");
});
