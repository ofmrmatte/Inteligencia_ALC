// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { clearPrivateContent, PRIVATE_CONTENT_CLEARED_EVENT } from "../components/data";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

it("limpa o conteúdo persistido e avisa todas as abas do Atendimento", () => {
  localStorage.setItem("private-cache", "conversation");
  sessionStorage.setItem("private-draft", "message");
  const notified = vi.fn();
  window.addEventListener(PRIVATE_CONTENT_CLEARED_EVENT, notified);

  clearPrivateContent();

  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(notified).toHaveBeenCalledOnce();
  window.removeEventListener(PRIVATE_CONTENT_CLEARED_EVENT, notified);
});
