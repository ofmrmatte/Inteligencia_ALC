import { describe, expect, it } from "vitest";
import { parseCompetence } from "@/lib/competence";

describe("competência canônica", () => {
  it.each([
    ["01Q072026", "01Q072026"],
    ["1Q072026", "01Q072026"],
    ["Q1 07/2026", "01Q072026"],
    ["1Q JULHO 26", "01Q072026"],
    ["Q1 JULHO 2026", "01Q072026"],
    ["PRE FATURA 1 Q JANEIRO 26.xlsx", "01Q012026"],
    ["PRÉ FATURA 2Q JUNHO 26.xlsx", "02Q062026"],
    ["PRE-FATURA 2 Q ABRIL 2026.xlsx", "02Q042026"],
    ["1ª quinzena julho 26", "01Q072026"],
    ["segunda quinzena jul 2026", "02Q072026"],
    ["202607Q1", "01Q072026"],
  ])("reconhece %s", (value, expected) => {
    expect(parseCompetence({ value, allowDateFallback: false })?.fortnight).toBe(expected);
  });

  it("combina coluna contendo só Q1 com mês e ano do arquivo", () => {
    expect(parseCompetence({ value: "Q1", sourceFile: "PRÉ FATURA JULHO 26.xlsx", allowDateFallback: false })?.fortnight).toBe("01Q072026");
  });

  it("prefere competência do arquivo à data da rota anterior", () => {
    expect(parseCompetence({ sourceFile: "PRE FATURA 2Q JULHO 26.xlsx", routeDate: "2026-06-18" })?.fortnight).toBe("02Q072026");
  });
});
