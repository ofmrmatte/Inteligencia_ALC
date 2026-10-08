import { describe, expect, it } from "vitest";
import { asNumber } from "@/lib/normalize";

describe("normalização numérica", () => {
  it("converte valores do Mercado Livre com ponto decimal sem multiplicar por 100", () => {
    expect(asNumber("R$ 55.00")).toBe(55);
    expect(asNumber("R$ 23.90")).toBe(23.9);
    expect(asNumber("R$ 152.26")).toBe(152.26);
    expect(asNumber("R$ 678.00")).toBe(678);
  });

  it("aceita padrão brasileiro e americano com separador de milhar", () => {
    expect(asNumber("R$ 1.234,56")).toBe(1234.56);
    expect(asNumber("R$ 1,234.56")).toBe(1234.56);
    expect(asNumber("R$ 55,00")).toBe(55);
  });

  it("mantém números já tipados como número", () => {
    expect(asNumber(55.25)).toBe(55.25);
    expect(asNumber(0)).toBe(0);
  });
});
