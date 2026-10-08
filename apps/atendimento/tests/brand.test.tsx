import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Brand } from "../../../packages/ui/brand";
import { readFileSync } from "node:fs";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    width,
    height,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
  }) => React.createElement("img", { src, alt, width, height }),
}));

describe("Shared brand with independent application assets", () => {
  it("matches the Inteligencia global font families, weights and 13px body size", () => {
    const layout = readFileSync(
      new URL("../app/layout.tsx", import.meta.url),
      "utf8",
    );
    const intelligenceLayout = readFileSync(
      new URL("../../inteligencia/app/layout.tsx", import.meta.url),
      "utf8",
    );
    for (const source of [layout, intelligenceLayout]) {
      expect(source).toMatch(
        /Montserrat\(\{\s*subsets:\s*\["latin"\],\s*variable:\s*"--font-heading"/,
      );
      expect(source).toMatch(
        /Poppins\(\{\s*subsets:\s*\["latin"\],\s*weight:\s*\["400",\s*"500",\s*"600"\],\s*variable:\s*"--font-body"/,
      );
    }
    for (const app of ["atendimento", "inteligencia"]) {
      const css = readFileSync(
        new URL(`../../${app}/app/globals.css`, import.meta.url),
        "utf8",
      );
      expect(css).toMatch(
        /body\s*\{[^}]*font-family:\s*var\(--font-body\),\s*"Poppins",\s*Arial,\s*sans-serif;\s*font-size:\s*13px;/,
      );
    }
  });
  it("preserves the default Inteligencia symbol and name", () => {
    const markup = renderToStaticMarkup(<Brand />);
    expect(markup).toContain("/brand/alc-symbol.png");
    expect(markup).toContain('aria-label="Inteligência ALC"');
    expect(markup).not.toContain("atendimento-horizontal");
  });
  it.each([false, true])(
    "renders the supplied Atendimento asset, compact=%s",
    (compact) => {
      const markup = renderToStaticMarkup(
        <Brand application="atendimento" compact={compact} />,
      );
      const asset = compact
        ? "atendimento-icon.png"
        : "atendimento-horizontal-dark.png";
      expect(markup).toContain(`/brand/${asset}`);
      expect(markup).toContain('aria-label="ALC Atendimento"');
      expect(
        readFileSync(new URL(`../public/brand/${asset}`, import.meta.url))
          .subarray(0, 8)
          .toString("hex"),
      ).toBe("89504e470d0a1a0a");
    },
  );
  it("uses standalone provided favicon and Apple icon assets without active SVG content", () => {
    const svg = readFileSync(
      new URL("../app/icon.svg", import.meta.url),
      "utf8",
    );
    expect(svg).toContain("Favicon ALC Atendimento");
    expect(svg).not.toMatch(
      /<script|<foreignObject|\son\w+=|(?:href|src)=["'](?:https?:|data:text\/html)/i,
    );
    expect(
      readFileSync(new URL("../app/apple-icon.png", import.meta.url))
        .subarray(0, 8)
        .toString("hex"),
    ).toBe("89504e470d0a1a0a");
    expect(
      readFileSync(new URL("../app/favicon.ico", import.meta.url))
        .subarray(0, 4)
        .toString("hex"),
    ).toBe("00000100");
  });
});
