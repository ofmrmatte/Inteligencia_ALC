import { describe, expect, it } from "vitest";
import { parseFile } from "@/lib/parser";

describe("importação CSV do Mercado Livre", () => {
  it("preserva centavos quando VALOR DA COMPRA usa ponto decimal", async () => {
    const csv = [
      "ID DE ENVIO,ID DO MOTORISTA,VALOR DA COMPRA,ESTAÇÃO DE ORIGEM,DATA DO CASO,PERÍODO DE FATURAMENTO",
      "47086532633,4496523,R$ 55.00,SMG13,2026-06-01T18:19:20,202607Q1",
      "47273233355,3417874,R$ 23.90,SGO3,2026-06-17T11:08:59,202607Q1",
      "47300000001,3417875,R$ 152.26,SGO3,2026-06-18T11:08:59,202607Q1",
    ].join("\n");

    const file = new File([csv], "LOGISTICS_PNR - 202607Q1.csv", { type: "text/csv" });
    const parsed = await parseFile(file);

    expect(parsed.pnr).toHaveLength(3);
    expect(parsed.pnr.map((row) => row.purchaseValue)).toEqual([55, 23.9, 152.26]);
  });

  it("preserva UTF-8 e acentos de status e produtos", async () => {
    const csv = [
      "ID DE ENVIO,ID DO MOTORISTA,VALOR DA COMPRA,ESTAÇÃO DE ORIGEM,DATA DO CASO,PERÍODO DE FATURAMENTO,STATUS,PRODUTOS",
      "47086532634,4496523,R$ 89.90,SMG13,2026-08-17T09:00:00,202608Q2,Em revisão,Toalha absorção máxima",
    ].join("\n");

    const file = new File([csv], "LOGISTICS_PNR - 202608Q2.csv", { type: "text/csv" });
    const parsed = await parseFile(file);

    expect(parsed.pnr).toHaveLength(1);
    expect(parsed.pnr[0].status).toBe("Em revisão");
    expect(parsed.pnr[0].products).toBe("Toalha absorção máxima");
    expect(parsed.pnr[0].purchaseValue).toBe(89.9);
  });
});
