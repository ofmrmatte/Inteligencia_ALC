import { describe, expect, it } from "vitest";
import { cleanText, normalizeText, repairTextEncoding } from "@/lib/normalize";

describe("normalização de encoding", () => {
  it("repara mojibake comum de UTF-8 interpretado como Latin-1", () => {
    expect(repairTextEncoding("Em revisÃ£o")).toBe("Em revisão");
    expect(cleanText("AbsorÃ§Ã£o mÃ¡xima")).toBe("Absorção máxima");
    expect(normalizeText("ComprovaÃ§Ã£o")).toBe("COMPROVACAO");
  });

  it("não altera acentos válidos", () => {
    expect(cleanText("CHAPADÃO DO SUL")).toBe("CHAPADÃO DO SUL");
    expect(cleanText("JOÃO PAULO GUIMARÃES")).toBe("JOÃO PAULO GUIMARÃES");
    expect(cleanText("Lâmpada de aquecimento")).toBe("Lâmpada de aquecimento");
  });
});
