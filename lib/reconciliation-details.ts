import type { ScopedData } from "@/lib/metrics";
import type { ImportEntry, PnrRecord, PrefaturaRecord, RiskRecord } from "@/lib/types";

export type ReconciliationSource = "Pré-fatura" | "KPI PNR" | "Risco LM";

export interface ReconciliationOccurrence {
  source: ReconciliationSource;
  batchId: string;
  sourceFile: string;
  sourceSheet: string;
  rowNumber: number;
  date: string | null;
  status: string;
  value: number;
  current: boolean;
  importedAt: string;
}

export interface DetailedReconciliationRow {
  shipmentId: string;
  prefatura: number;
  pnr: number;
  risk: number;
  sources: number;
  occurrences: number;
  historicalOccurrences: number;
  status: "Conciliado" | "Duplicado" | "Isolado";
  latestStatus: string;
  latestSource: ReconciliationSource | "";
  value: number;
  history: ReconciliationOccurrence[];
}

type SourceRecord = PrefaturaRecord | PnrRecord | RiskRecord;

function importedAtMap(imports: ImportEntry[]) {
  return new Map(imports.map((entry) => [entry.batchId, entry.importedAt]));
}

function recordDate(record: SourceRecord) {
  if ("caseDate" in record) return record.caseDate;
  if ("routeDate" in record) return record.routeDate;
  return record.failureDate;
}

function recordValue(record: SourceRecord) {
  if ("purchaseValue" in record) return record.purchaseValue;
  if ("value" in record) return record.value;
  return record.gmvBrl;
}

function recordStatus(record: SourceRecord) {
  if ("status" in record) return record.status || "";
  if ("lastSubstatus" in record) return record.lastSubstatus || record.routeStatus || record.failureReason || "";
  return "";
}

function sortScore(record: SourceRecord, importedAt: Map<string, string>) {
  const importTime = Date.parse(importedAt.get(record.batchId) || "") || 0;
  const operationalTime = Date.parse(recordDate(record) || "") || 0;
  return importTime * 10_000 + Math.min(9_999, Math.max(0, operationalTime % 10_000));
}

function currentRows<T extends SourceRecord>(records: T[], importedAt: Map<string, string>) {
  if (!records.length) return [];
  const latest = [...records].sort((a, b) => sortScore(b, importedAt) - sortScore(a, importedAt))[0];
  return records.filter((record) => record.batchId === latest.batchId);
}

function sourceName(kind: "prefatura" | "pnr" | "risk"): ReconciliationSource {
  if (kind === "prefatura") return "Pré-fatura";
  if (kind === "pnr") return "KPI PNR";
  return "Risco LM";
}

export function detailedReconciliation(scoped: ScopedData, imports: ImportEntry[] = []): DetailedReconciliationRow[] {
  const importedAt = importedAtMap(imports);
  const groups = new Map<string, { prefatura: PrefaturaRecord[]; pnr: PnrRecord[]; risk: RiskRecord[] }>();

  const add = <T extends SourceRecord>(shipmentId: string, kind: "prefatura" | "pnr" | "risk", record: T) => {
    if (!shipmentId) return;
    const group = groups.get(shipmentId) ?? { prefatura: [], pnr: [], risk: [] };
    (group[kind] as SourceRecord[]).push(record);
    groups.set(shipmentId, group);
  };

  scoped.prefatura.forEach((row) => add(row.shipmentId, "prefatura", row));
  scoped.pnr.forEach((row) => add(row.shipmentId, "pnr", row));
  scoped.risk.forEach((row) => add(row.shipmentId, "risk", row));

  const output: DetailedReconciliationRow[] = [];
  for (const [shipmentId, group] of groups) {
    const currentPrefatura = currentRows(group.prefatura, importedAt);
    const currentPnr = currentRows(group.pnr, importedAt);
    const currentRisk = currentRows(group.risk, importedAt);
    const currentBatchIds = new Set([
      ...currentPrefatura.map((row) => `prefatura|${row.batchId}`),
      ...currentPnr.map((row) => `pnr|${row.batchId}`),
      ...currentRisk.map((row) => `risk|${row.batchId}`),
    ]);

    const history: ReconciliationOccurrence[] = [];
    const pushHistory = (kind: "prefatura" | "pnr" | "risk", records: SourceRecord[]) => {
      records.forEach((record) => history.push({
        source: sourceName(kind),
        batchId: record.batchId,
        sourceFile: record.sourceFile,
        sourceSheet: record.sourceSheet,
        rowNumber: record.rowNumber,
        date: recordDate(record),
        status: recordStatus(record),
        value: recordValue(record),
        current: currentBatchIds.has(`${kind}|${record.batchId}`),
        importedAt: importedAt.get(record.batchId) || "",
      }));
    };
    pushHistory("prefatura", group.prefatura);
    pushHistory("pnr", group.pnr);
    pushHistory("risk", group.risk);
    history.sort((a, b) => (Date.parse(b.importedAt) || Date.parse(b.date || "") || 0) - (Date.parse(a.importedAt) || Date.parse(a.date || "") || 0));

    const current = [...currentPrefatura, ...currentPnr, ...currentRisk];
    const latestWithStatus = history.find((item) => item.status.trim());
    const sources = [currentPrefatura.length, currentPnr.length, currentRisk.length].filter(Boolean).length;
    const occurrences = current.length;
    const duplicate = currentPrefatura.length > 1 || currentPnr.length > 1 || currentRisk.length > 1;

    output.push({
      shipmentId,
      prefatura: currentPrefatura.length,
      pnr: currentPnr.length,
      risk: currentRisk.length,
      sources,
      occurrences,
      historicalOccurrences: history.length,
      status: duplicate ? "Duplicado" : sources > 1 ? "Conciliado" : "Isolado",
      latestStatus: latestWithStatus?.status || "—",
      latestSource: latestWithStatus?.source || "",
      value: current.reduce((max, record) => Math.max(max, recordValue(record)), 0),
      history,
    });
  }

  return output.sort((a, b) => b.occurrences - a.occurrences || b.historicalOccurrences - a.historicalOccurrences || b.value - a.value);
}
