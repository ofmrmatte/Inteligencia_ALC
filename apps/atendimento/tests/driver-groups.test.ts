import { describe, expect, it } from "vitest";
import { groupCasesByDriver, type DriverCaseRow } from "../lib/driver-groups";

function row(
  caseId: string,
  opts: Partial<DriverCaseRow["record"]> = {},
  classification = "aguardando_comprovante",
): DriverCaseRow {
  return {
    case_id: caseId,
    competence: "202610Q1",
    classification,
    record: {
      driverId: "",
      driverPhone: "",
      driverName: "",
      baseKey: "",
      sigla: "",
      ...opts,
    },
  };
}

describe("agrupamento de PNRs por motorista", () => {
  it("reúne PNRs do mesmo ID, mesmo que apareçam com bases diferentes", () => {
    const groups = groupCasesByDriver([
      row("a", { driverId: "driver-1", driverName: "Motorista Exemplo", baseKey: "Base A" }),
      row("b", { driverId: "driver-1", driverName: "Motorista Exemplo", baseKey: "Base B" }, "penalidade"),
      row("c", { driverId: "driver-2", driverName: "Outro Motorista", baseKey: "Base A" }),
    ]);
    expect(groups).toHaveLength(2);
    const group = groups.find((g) => g.key === "id:DRIVER-1");
    expect(group?.rows.map((r) => r.case_id)).toEqual(["a", "b"]);
    expect(group?.bases).toEqual(["Base A", "Base B"]);
    expect(group?.counts).toMatchObject({ aguardando_comprovante: 1, penalidade: 1 });
  });

  it("não mistura homônimos de bases diferentes quando o ID não existe", () => {
    const groups = groupCasesByDriver([
      row("a", { driverName: "José da Silva", baseKey: "Base A" }),
      row("b", { driverName: "JOSE DA SILVA", baseKey: "Base A" }),
      row("c", { driverName: "José da Silva", baseKey: "Base B" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.rows.length).sort()).toEqual([1, 2]);
  });

  it("usa telefone validado como alternativa ao ID e isola motorista sem identificação", () => {
    const groups = groupCasesByDriver([
      row("a", { driverPhone: "11 99999-1111", driverName: "Teste" }),
      row("b", { driverPhone: "5511999991111", driverName: "Teste" }),
      row("c"), row("d"),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.key === "phone:5511999991111")?.rows).toHaveLength(2);
    expect(groups.filter((g) => g.key.startsWith("unidentified:"))).toHaveLength(2);
  });

  it("mantém todas as PNRs de um motorista sem limitar a 500 por grupo", () => {
    const records = Array.from({ length: 620 }, (_, i) =>
      row(String(i), { driverId: "id-620", driverName: "Motorista Teste" }, i % 2 ? "encerrada" : "aberta"),
    );
    const groups = groupCasesByDriver(records);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(620);
    expect(groups[0].counts).toMatchObject({ aberta: 310, encerrada: 310 });
  });

  it("não altera registros originais ou a ordenação das PNRs dentro do motorista", () => {
    const records = [
      row("new", { driverId: "id1", driverName: "Zeta" }),
      row("old", { driverId: "id1", driverName: "Zeta" }),
      row("other", { driverId: "id2", driverName: "Alfa" }),
    ];
    const groups = groupCasesByDriver(records);
    expect(groups.map((g) => g.name)).toEqual(["Alfa", "Zeta"]);
    expect(groups[1].rows.map((r) => r.case_id)).toEqual(["new", "old"]);
    expect(records[0].case_id).toBe("new");
  });
});
