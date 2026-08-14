import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import * as XLSX from "xlsx";
import { parseFile } from "@/lib/parser";

function workbookBytes(sheets: Record<string, unknown[][]>) {
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name));
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

describe("detecção de planilhas", () => {
  it("normaliza a hierarquia e preserva supervisores múltiplos", async () => {
    const bytes = workbookBytes({ Coordenadores: [
      ["COORDENADOR", "SUPERVISOR", "SIGLA", "BASE"],
      [" Bruno Hungria ", " Supervisor A ", " SMG5 ", " Guaxupé "],
      ["Bruno Hungria", "Supervisor B", "SMG5", "Guaxupé"],
    ] });
    const parsed = await parseFile(new File([bytes], "Coordenadores.xlsx"));
    expect(parsed.hierarchy).toHaveLength(2);
    expect(parsed.hierarchy[0].sigla).toBe("SMG5");
    expect(parsed.hierarchy[0].baseKey).toBe("GUAXUPE");
    expect(new Set(parsed.hierarchy.map((row) => row.supervisor)).size).toBe(2);
  });

  it("lê abas de pré-fatura dentro do mesmo ZIP sem fundir suas ocorrências", async () => {
    const bytes = workbookBytes({
      "PERDIDOS SVC": [
        ["Quinzena", "BASE", "MOTORISTA", "PLACA", "DESCRIÇÃO", "DATA DA ROTA", "ID DO PACOTE", "Nº ROTA", "VALOR"],
        ["01Q082026", "GUAXUPÉ - SMG5", "Motorista A", "ABC1D23", "DESCONTO SVC", "12/08/2026", 100, 900, 45],
      ],
      "PERDIDOS XPT": [
        ["Quinzena", "BASE", "MOTORISTA", "PLACA", "DESCRIÇÃO", "DATA DA ROTA", "ID DO PACOTE", "Nº ROTA", "VALOR"],
        ["01Q082026", "GUAXUPÉ - SMG5", "Motorista A", "ABC1D23", "DESCONTO XPT", "12/08/2026", 100, 900, 45],
      ],
    });
    const zip = zipSync({ "PRE-FATURA.xlsx": bytes });
    const parsed = await parseFile(new File([zip], "PREFATURAS.zip"));
    expect(parsed.prefatura).toHaveLength(2);
    expect(parsed.prefatura.map((row) => row.operation)).toEqual(["SVC", "XPT"]);
    expect(new Set(parsed.prefatura.map((row) => row.batchId)).size).toBe(1);
    expect(parsed.entry.rowCount).toBe(2);
  });

  it("extrai quinzena de abas PNR no formato AAAAMMQ e preserva ação operacional", async () => {
    const bytes = workbookBytes({
      "LOGISTICS_PNR - 202608Q1": [
        ["ID DO CASO", "DATA DO CASO", "TIPO", "STATUS", "ID DE ENVIO", "PRODUTOS", "VALOR DA COMPRA", "TRANSPORTADORA", "ESTAÇÃO DE ORIGEM", "ID DA ROTA", "ID DO MOTORISTA", "Ação"],
        [1, "02/08/2026", "PNR", "Aguardando comprovante", 4800001, "Produto", 125.5, "ALC", "GUAXUPÉ - SMG5", 9001, 7001, "Cobrar comprovante"],
      ],
    });
    const parsed = await parseFile(new File([bytes], "LOGISTICS_PNR.xlsx"));
    expect(parsed.pnr).toHaveLength(1);
    expect(parsed.pnr[0].billingPeriod).toBe("01Q082026");
    expect(parsed.pnr[0].custom).toBe("Cobrar comprovante");
    expect(parsed.pnr[0].sigla).toBe("SMG5");
  });
});
