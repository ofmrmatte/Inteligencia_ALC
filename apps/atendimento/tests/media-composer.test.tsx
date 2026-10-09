// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => vi.fn());
vi.mock("../components/data", () => ({ api }));
import { MediaComposer } from "../components/media-composer";
let root: Root, container: HTMLDivElement;
const uploads: Upload[] = [];
class Upload {
  upload = {
    onprogress: null as
      | null
      | ((event: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void),
  };
  status = 200;
  responseText = "";
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  abort = vi.fn();
  constructor() {
    uploads.push(this);
  }
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("XMLHttpRequest", Upload);
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:synthetic"),
      revokeObjectURL: vi.fn(),
    }),
  );
  uploads.length = 0;
  api.mockReset().mockResolvedValue({});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function select(size = 1) {
  const input = container.querySelector("input[type=file]")!;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [
      new File([new Uint8Array(size)], "synthetic.png", { type: "image/png" }),
    ],
  });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  )!;
  await act(async () => button.click());
}
it("uploads with progress then queues only the validated media ID", async () => {
  const done = vi.fn();
  await act(async () =>
    root.render(
      <MediaComposer
        conversationId="synthetic-conversation"
        disabled={false}
        onQueued={done}
      />,
    ),
  );
  await select();
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "blob:synthetic",
  );
  await click("Enviar anexo");
  const xhr = uploads[0];
  expect(xhr.open).toHaveBeenCalledWith(
    "POST",
    expect.stringContaining("conversationId=synthetic-conversation"),
  );
  await act(async () =>
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 }),
  );
  expect(container.querySelector("progress")?.value).toBe(50);
  xhr.responseText = JSON.stringify({
    id: "synthetic-media",
    type: "image",
    status: "ready",
  });
  await act(async () => xhr.onload?.());
  expect(api).toHaveBeenCalledExactlyOnceWith("conversation", {
    id: "synthetic-conversation",
    action: "attachment",
    mediaId: "synthetic-media",
  });
  expect(done).toHaveBeenCalledOnce();
});
it("keeps quarantined uploads out of the WhatsApp queue", async () => {
  await act(async () =>
    root.render(
      <MediaComposer
        conversationId="synthetic-conversation"
        disabled={false}
        onQueued={async () => {}}
      />,
    ),
  );
  await select();
  await click("Enviar anexo");
  uploads[0].responseText = JSON.stringify({
    id: "synthetic-media",
    type: "image",
    status: "quarantined",
  });
  await act(async () => uploads[0].onload?.());
  expect(api).not.toHaveBeenCalled();
  expect(container.textContent).toContain("quarentena");
});
it("rejects oversized files before attempting upload", async () => {
  await act(async () =>
    root.render(
      <MediaComposer
        conversationId="synthetic-conversation"
        disabled={false}
        onQueued={async () => {}}
      />,
    ),
  );
  await select(25 * 1024 * 1024 + 1);
  expect(container.textContent).toContain("até 25 MB");
  expect(uploads).toHaveLength(0);
  expect(api).not.toHaveBeenCalled();
});
