import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSecullum } from "@/lib/hr/secullum-parser";

function csv(value: string) { return new TextEncoder().encode(value).buffer; }
describe("Secullum daily import", () => {
  it("detecta aliases e normaliza jornada sem inferir saldo", () => {
    const result = parseSecullum(csv("Matricula;Data;Trabalhadas;Previstas;Entrada;Saida;Atraso;Extras;Falta\nSYNTH-1;07/10/2026;08:00;08:00;08:15;17:15;00:15;00:30;Nao"), "secullum.csv");
    expect(result.missing).toEqual([]);
    expect(result.rows[0].error).toBeNull();
    expect(result.rows[0].entry).toMatchObject({ employee_code: "SYNTH-1", attendance_date: "2026-10-07", worked_minutes: 480, expected_minutes: 480, late_minutes: 15, extra_minutes: 30, absence: false });
    expect(result.rows[0].raw).toHaveProperty("Matricula");
  });
  it("permite remapeamento explícito e mostra colunas desconhecidas", () => {
    const bytes = csv("Pessoa;DiaRegistro;TotalMinutos\nSYNTH-1;2026-10-07;480");
    expect(parseSecullum(bytes, "ponto.csv").missing).toEqual(["employee_code", "date", "worked_minutes"]);
    const result = parseSecullum(bytes, "ponto.csv", { employee_code: "Pessoa", date: "DiaRegistro", worked_minutes: "TotalMinutos" });
    expect(result.columns).toEqual(["Pessoa", "DiaRegistro", "TotalMinutos"]);
    expect(result.rows[0].error).toBeNull();
  });
  it("rejeita arquivo inválido, cabeçalhos duplicados e mapping repetido", () => {
    expect(() => parseSecullum(csv("invalid"), "ponto.pdf")).toThrow(/CSV ou XLSX/);
    expect(() => parseSecullum(csv(""), "ponto.csv")).toThrow();
    expect(() => parseSecullum(csv("Matricula;Matricula\n1;2"), "ponto.csv")).toThrow(/repetidos/);
    expect(() => parseSecullum(csv("Pessoa;Data\n1;2026-10-07"), "ponto.csv", { employee_code: "Pessoa", worked_minutes: "Pessoa" })).toThrow(/dois campos/);
  });
  it("não importa duas linhas do mesmo colaborador/data nem soma duplicidades", () => {
    const result = parseSecullum(csv("Matricula;Data;Trabalhadas\nSYNTH-1;2026-10-07;480\nSYNTH-1;2026-10-07;360"), "ponto.csv");
    expect(result.rows.every((r) => r.error?.includes("repetida"))).toBe(true);
  });
  it.each(["31/02/2026;480", "2026-10-07;-10", "2026-10-07;25:00", "2026-10-07;8,5"])("rejeita data ou duração ambígua %s", (row) => {
    const result = parseSecullum(csv(`Matricula;Data;Trabalhadas\nSYNTH-1;${row}`), "ponto.csv");
    expect(result.rows[0].error).toBeTruthy();
  });
  it("importa XLSX com data e hora Excel e preserva raw_payload", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["employee_code", "date", "worked_minutes", "first_entry", "last_exit"], ["SYNTH-1", 46302, 480, .375, .75]]), "Jornada");
    const result = parseSecullum(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), "ponto.xlsx");
    expect(result.rows[0].entry).toMatchObject({ worked_minutes: 480, first_entry: "09:00", last_exit: "18:00" });
    expect(result.rows[0].raw.employee_code).toBe("SYNTH-1");
  });
  it("falta e trabalho não podem ser aceitos simultaneamente", () => {
    const result = parseSecullum(csv("Matricula;Data;Trabalhadas;Falta\nSYNTH-1;2026-10-07;480;Sim"), "ponto.csv");
    expect(result.rows[0].error).toContain("incompatível");
  });
});
