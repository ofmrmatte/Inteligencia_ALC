import { describe, expect, it } from "vitest";
import { partitionCollectorCases } from "../../../extensions/pnr-connector/src/case-center.js";

const records = [
  { caseId: "10001", shipmentId: "90001", mainStatus: "NEW", subStatus: "" },
  { caseId: "10002", shipmentId: "90002", mainStatus: "CLOSED", subStatus: "" },
  { caseId: "10003", shipmentId: "90003", mainStatus: "NEW", subStatus: "" },
];

describe("seleção econômica de casos pelo conector", () => {
  it("enriquece somente novos, atualiza status nas duplicadas e ignora idênticas", () => {
    const result = partitionCollectorCases(records, [
      { caseId: "10002", action: "status" },
      { caseId: "10001", action: "full" },
      { caseId: "10003", action: "skip" },
    ]);
    expect(result.fullRecords).toEqual([records[0]]);
    expect(result.statusRecords).toEqual([{ ...records[1], statusOnly: true }]);
    expect(result.skippedCaseIds).toEqual(["10003"]);
    expect(records[1]).not.toHaveProperty("statusOnly");
  });
  it("interrompe a coleta se o backend omite casos, repete IDs ou informa uma ação desconhecida", () => {
    expect(() => partitionCollectorCases(records, [{ caseId: "10001", action: "full" }])).toThrow("deduplicação");
    expect(() => partitionCollectorCases(records, [
      { caseId: "10001", action: "full" },
      { caseId: "10001", action: "skip" },
      { caseId: "10003", action: "status" },
    ])).toThrow("deduplicação");
    expect(() => partitionCollectorCases(records, [
      { caseId: "10001", action: "full" },
      { caseId: "10002", action: "unknown" },
      { caseId: "10003", action: "skip" },
    ])).toThrow("Resposta inválida");
  });
});
