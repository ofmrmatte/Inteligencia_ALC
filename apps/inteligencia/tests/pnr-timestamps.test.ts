import { describe, expect, it } from "vitest";
import { pnrTimestampIso } from "@/lib/pnr-timestamps";

describe("datas históricas do Sync PNR no PostgreSQL Railway", () => {
  it("converte exatamente o Date retornado pelo node-postgres que interrompeu a fila", () => {
    const date = new Date("2026-09-18T01:17:56.000Z");
    expect(date.toString()).toContain("2026");
    expect(pnrTimestampIso(date)).toBe("2026-09-18T01:17:56.000Z");
  });

  it("converte o formato textual informado no erro real e mantém o mesmo instante", () => {
    const rejectedByPg = "Fri Sep 18 2026 01:17:56 GMT+0000 (Coordinated Universal Time)";
    expect(pnrTimestampIso(rejectedByPg)).toBe("2026-09-18T01:17:56.000Z");
  });

  it("preserva ISO com offset, incluindo data de um outro fuso", () => {
    expect(pnrTimestampIso("2026-09-17T22:17:56-03:00"))
      .toBe("2026-09-18T01:17:56.000Z");
    expect(pnrTimestampIso("2026-09-18T01:17:56.000Z"))
      .toBe("2026-09-18T01:17:56.000Z");
  });

  it("rejeita valores inválidos em vez de sobrescrever a primeira captura", () => {
    for (const value of [null, undefined, "", "not a date", new Date(Number.NaN), {}, 123]) {
      expect(() => pnrTimestampIso(value)).toThrow();
    }
  });
});
