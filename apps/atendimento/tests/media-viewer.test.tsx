import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MediaViewer } from "../components/media-viewer";
it.each(["image", "sticker", "video", "document"])(
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
        }}
      />,
    );
    expect(html).toContain("/api/media/synthetic-attachment");
    expect(html).toContain("download=true");
    expect(html).not.toContain("facebook");
    if (type === "video") expect(html).toContain("<video");
    if (type === "document") expect(html).toContain('sandbox=""');
  },
);
it.each(["ready", "pending", "quarantined", "rejected", "failed", "deleted"])(
  "does not expose historical audio bytes or controls in %s state",
  (status) => {
    for (const metadata of [
      { type: "audio" },
      { type: "document", mime: "audio/ogg" },
    ]) {
      const html = renderToStaticMarkup(
        <MediaViewer
          messageId="synthetic-audio"
          attachment={{
            internalId: "synthetic-attachment",
            status,
            ...metadata,
          }}
        />,
      );
      expect(html).toContain("Áudio não suportado");
      expect(html).not.toContain("/api/media");
      expect(html).not.toMatch(/<audio|<a\b|<select|<iframe|<video/);
    }
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

it("keeps the authenticated media ID on the image-dialog download", () => {
  const html = renderToStaticMarkup(
    <MediaViewer
      messageId="synthetic-message"
      attachment={{
        internalId: "synthetic-attachment",
        type: "image",
        mime: "image/png",
        status: "ready",
      }}
    />,
  );
  expect(html).toContain(
    'href="/api/media/synthetic-attachment?download=true"',
  );
});
