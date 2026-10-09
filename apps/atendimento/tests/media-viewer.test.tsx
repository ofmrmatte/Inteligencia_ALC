import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MediaViewer } from "../components/media-viewer";
it.each(["image", "sticker", "audio", "video", "document"])(
  "renders private %s without provider URLs",
  (type) => {
    const html = renderToStaticMarkup(
      <MediaViewer
        messageId="synthetic-message"
        attachment={{
          internalId: "synthetic-attachment",
          type,
          mime: type === "document" ? "application/pdf" : "image/png",
          status: "ready",
          filename: "synthetic",
          size: 1024,
          voice: type === "audio",
        }}
      />,
    );
    expect(html).toContain("/api/media/synthetic-attachment");
    expect(html).toContain("download=true");
    expect(html).not.toContain("facebook");
    if (type === "audio") {
      expect(html).toContain("<audio");
      expect(html).toContain("Velocidade");
      expect(html).toContain("Mensagem de voz");
    }
    if (type === "video") expect(html).toContain("<video");
    if (type === "document") expect(html).toContain('sandbox=""');
  },
);
it.each(["pending", "quarantined", "rejected", "failed", "deleted"])(
  "never emits a playable/downloadable URL for %s media",
  (status) => {
    const html = renderToStaticMarkup(
      <MediaViewer
        messageId="synthetic-message"
        attachment={{ internalId: "synthetic-attachment", status }}
      />,
    );
    expect(html).not.toContain("/api/media");
    expect(html).toContain('role="status"');
  },
);
