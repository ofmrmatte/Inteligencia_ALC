import { unzipSync } from "fflate";
import * as XLSX from "xlsx";
import { asDate, asId, asNumber, cleanText, headerKey, normalizeText, parseBase } from "@/lib/normalize";
import { parseCompetence } from "@/lib/competence";
import type {
  DriverRecord,
  HierarchyRecord,
  ImportEntry,
  Operation,
  ParsedBatch,
  PnrRecord,
  PrefaturaRecord,
  RiskRecord,
  SourceKind,
} from "@/lib/types";

type Matrix = unknown[][];
type RowMap = Record<string, unknown>;

const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
const SUPPORTED = /\.(xlsx|xlsm|xls|csv)$/i;

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function findHeader(matrix: Matrix, required: string[]): number {
  const targets = required.map(headerKey);
  return matrix.findIndex((row) => {
    const headers = new Set(row.map(headerKey));
    return targets.every((target) => headers.has(target));
  });
}

function rowsFrom(matrix: Matrix, headerIndex: number): Array<{ values: RowMap; rowNumber: number }> {
  if (headerIndex < 0) return [];
  const headers = matrix[headerIndex].map(headerKey);
  return matrix
    .slice(headerIndex + 1)
    .map((row, index) => {
      const values: RowMap = {};
      headers.forEach((header, column) => {
        if (header) values[header] = row[column];
      });
      return { values, rowNumber: headerIndex + index + 2 };
    })
    .filter(({ values }) => Object.values(values).some((value) => cleanText(value) !== ""));
}

function sheetMatrix(sheet: XLSX.WorkSheet): Matrix {
  if (!sheet["!ref"]) return [];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const matrix: Matrix = [];
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: unknown[] = [];
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
      if (!cell) {
        row.push(null);
        continue;
      }
      row.push(cell.t === "d" && typeof cell.w === "string" ? cell.w : cell.v ?? null);
    }
    matrix.push(row);
  }
  return matrix;
}

function trace(batchId: string, sourceFile: string, sourceSheet: string, rowNumber: number) {
  return { batchId, sourceFile, sourceSheet, rowNumber };
}

function operationFromSheet(sheetName: string): Operation | null {
  const normalized = normalizeText(sheetName);
  if (normalized.includes("SVC")) return "SVC";
  if (normalized.includes("XPT")) return "XPT";
  if (normalized === "PNR" || normalized.includes(" PNR")) return "PNR";
  return null;
}

function periodFromSource(sourceFile: string, sheetName: string, batchName: string, value: unknown, routeDate: string | null) {
  return parseCompetence({ value, sourceFile, sourceSheet: sheetName, batchName, routeDate })?.fortnight ?? "";
}

function firstId(values: RowMap, headers: string[]) {
  for (const header of headers) {
    const id = asId(values[headerKey(header)]);
    if (id) return id;
  }
  return "";
}

function parseWorkbook(bytes: Uint8Array, sourceFile: string, batchName: string, batchId: string) {
  const isCsv = /\.csv$/i.test(sourceFile);
  // CSVs exportados pelo Mercado Livre usam ponto decimal (ex.: R$ 55.00).
  // Mantemos o CSV em modo raw para impedir que o SheetJS aplique inferência
  // regional e transforme 55.00 em 5500 antes da normalização pt-BR.
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, raw: isCsv });
  const hierarchy: HierarchyRecord[] = [];
  const prefatura: PrefaturaRecord[] = [];
  const pnr: PnrRecord[] = [];
  const risk: RiskRecord[] = [];
  const drivers: DriverRecord[] = [];
  const issues: string[] = [];
  const kinds = new Set<SourceKind>();

  for (const sheetName of workbook.SheetNames) {
    const matrix = sheetMatrix(workbook.Sheets[sheetName]);
    if (!matrix.length) continue;

    let headerIndex = findHeader(matrix, ["COORDENADOR", "SUPERVISOR", "SIGLA", "BASE"]);
    if (headerIndex >= 0) {
      for (const row of rowsFrom(matrix, headerIndex)) {
        const coordinator = cleanText(row.values.COORDENADOR);
        const supervisor = cleanText(row.values.SUPERVISOR);
        const sigla = normalizeText(row.values.SIGLA);
        const base = cleanText(row.values.BASE);
        if (!coordinator || !supervisor || (!sigla && !base)) continue;
        hierarchy.push({
          ...trace(batchId, sourceFile, sheetName, row.rowNumber),
          coordinator,
          supervisor,
          sigla,
          base,
          baseKey: normalizeText(base),
        });
      }
      kinds.add("hierarquia");
      continue;
    }

    headerIndex = findHeader(matrix, ["ID DO PACOTE", "VALOR"]);
    const operation = operationFromSheet(sheetName);
    if (headerIndex >= 0 && operation) {
      for (const row of rowsFrom(matrix, headerIndex)) {
        const shipmentId = asId(row.values["ID DO PACOTE"]);
        if (!shipmentId) continue;
        const base = parseBase(row.values.BASE);
        const routeDate = asDate(row.values["DATA DA ROTA"]);
        const period = periodFromSource(sourceFile, sheetName, batchName, row.values.QUINZENA, routeDate);
        if (!period) issues.push(`${sourceFile}/${sheetName}: competência não identificada na linha ${row.rowNumber}.`);
        prefatura.push({
          ...trace(batchId, sourceFile, sheetName, row.rowNumber),
          period,
          baseLabel: base.label,
          baseName: base.name,
          baseKey: base.baseKey,
          sigla: base.sigla,
          driverId: firstId(row.values, ["ID DO MOTORISTA", "ID MOTORISTA", "MOTORISTA ID", "DRIVER ID", "ID DO TRANSPORTADOR", "ID TRANSPORTADOR", "SHP LG DRIVER ID"]),
          driverName: cleanText(row.values.MOTORISTA),
          plate: cleanText(row.values.PLACA),
          description: cleanText(row.values.DESCRICAO),
          routeDate,
          shipmentId,
          routeId: asId(row.values["N ROTA"]),
          value: asNumber(row.values.VALOR),
          operation,
        });
      }
      kinds.add("pre-faturamento");
      continue;
    }

    headerIndex = findHeader(matrix, ["ID DE ENVIO", "ID DO MOTORISTA", "VALOR DA COMPRA"]);
    if (headerIndex >= 0) {
      for (const row of rowsFrom(matrix, headerIndex)) {
        const shipmentId = asId(row.values["ID DE ENVIO"]);
        if (!shipmentId) continue;
        const station = parseBase(row.values["ESTACAO DE ORIGEM"]);
        const caseDate = asDate(row.values["DATA DO CASO"]);
        pnr.push({
          ...trace(batchId, sourceFile, sheetName, row.rowNumber),
          caseDate,
          status: cleanText(row.values.STATUS),
          billingPeriod: periodFromSource(sourceFile, sheetName, batchName, row.values["PERIODO DE FATURAMENTO"], caseDate),
          shipmentId,
          products: cleanText(row.values.PRODUTOS),
          purchaseValue: asNumber(row.values["VALOR DA COMPRA"]),
          carrier: cleanText(row.values.TRANSPORTADORA),
          originStation: station.label,
          baseKey: station.baseKey,
          sigla: station.sigla || normalizeText(station.label),
          routeId: asId(row.values["ID DA ROTA"]),
          driverId: asId(row.values["ID DO MOTORISTA"]),
          custom: cleanText(row.values.ACAO ?? row.values.PERSONALIZAR),
        });
      }
      kinds.add("pnr");
      continue;
    }

    headerIndex = findHeader(matrix, ["SHP_SHIPMENT_ID", "SHP_LG_DRIVER_ID", "GMV_BRL"]);
    if (headerIndex >= 0) {
      for (const row of rowsFrom(matrix, headerIndex)) {
        const shipmentId = asId(row.values["SHP SHIPMENT ID"]);
        if (!shipmentId) continue;
        const facility = parseBase(row.values["SHP LG FACILITY ID"]);
        risk.push({
          ...trace(batchId, sourceFile, sheetName, row.rowNumber),
          failureDate: asDate(row.values["DATA INSUCESSO"]),
          shipmentId,
          itemDescription: cleanText(row.values["SHP ITEM DESC"]),
          driverId: asId(row.values["SHP LG DRIVER ID"]),
          facilityId: cleanText(row.values["SHP LG FACILITY ID"]),
          destinationType: cleanText(row.values["ROUTE DESTINATION FACILITY TYPE"]),
          carrierName: cleanText(row.values["SHP CARRIER NAME"]),
          failureReason: cleanText(row.values["SHP LG INSUCCESS REASON"]),
          lastSubstatus: cleanText(row.values["SHP LG LAST SUBSTATUS"]),
          routeId: asId(row.values["SHP LG ROUTE ID"]),
          routeStatus: cleanText(row.values["SHP LG ROUTE STATUS"]),
          destinationFacilityId: cleanText(row.values["ROUTE DESTINATION FACILTY ID"]),
          vehicleType: cleanText(row.values["ROUTE VEHICLE TYPE"]),
          quantity: asNumber(row.values["SHP QUANTITY"]),
          stoppedDays: asNumber(row.values["DIAS PARADO"]),
          gmvUsd: asNumber(row.values["GMV USD"]),
          gmvBrl: asNumber(row.values["GMV BRL"]),
          baseKey: facility.baseKey,
          sigla: facility.sigla || normalizeText(facility.label),
        });
      }
      kinds.add("risco-lm");
      continue;
    }

    headerIndex = findHeader(matrix, ["ID DO TRANSPORTADOR", "NOME DO TRANSPORTADOR"]);
    if (headerIndex >= 0) {
      for (const row of rowsFrom(matrix, headerIndex)) {
        const driverId = asId(row.values["ID DO TRANSPORTADOR"]);
        const name = cleanText(row.values["NOME DO TRANSPORTADOR"]);
        if (!driverId || !name) continue;
        drivers.push({
          ...trace(batchId, sourceFile, sheetName, row.rowNumber),
          driverId,
          name,
          experience: cleanText(row.values.EXPERIENCIA),
          incidents: asNumber(row.values.INCIDENTES),
          lastUpdated: asDate(row.values["ULTIMA ATUALIZACAO"]),
          state: cleanText(row.values.ESTADO),
          shipped: asNumber(row.values["PACOTES EXPEDIDOS"]),
          delivered: asNumber(row.values["ENTREGAS COM SUCESSO"]),
          undelivered: asNumber(row.values["PACOTES NAO ENTREGUES"]),
          unvisited: asNumber(row.values["NAO VISITADOS"]),
          penalized: asNumber(row.values["PACOTES COM PENALIDADES"]),
          contradictoryPnr: asNumber(row.values["PNR CONTRADITORIO"]),
          emptyBoxes: asNumber(row.values["CAIXAS VAZIAS"]),
          lost: asNumber(row.values.PERDIDOS),
          stolen: asNumber(row.values.ROUBADOS),
        });
      }
      kinds.add("motoristas");
    }
  }

  if (![hierarchy.length, prefatura.length, pnr.length, risk.length, drivers.length].some(Boolean)) {
    issues.push(`${sourceFile}: nenhuma estrutura reconhecida.`);
  }

  return { hierarchy, prefatura, pnr, risk, drivers, issues, kinds, workbookCount: 1 };
}

export async function parseFile(file: File): Promise<ParsedBatch> {
  const batchId = makeId();
  const importedAt = new Date().toISOString();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error(`${file.name}: arquivo maior que 80 MB.`);

  const workbooks: Array<{ name: string; bytes: Uint8Array }> = [];
  const issues: string[] = [];
  if (/\.zip$/i.test(file.name)) {
    const entries = unzipSync(bytes);
    for (const [name, content] of Object.entries(entries)) {
      if (SUPPORTED.test(name) && !name.includes("__MACOSX") && !name.split("/").at(-1)?.startsWith("~$")) {
        workbooks.push({ name, bytes: content });
      }
    }
    if (!workbooks.length) issues.push("O ZIP não contém planilhas compatíveis.");
  } else if (SUPPORTED.test(file.name)) {
    workbooks.push({ name: file.name, bytes });
  } else {
    throw new Error(`${file.name}: formato não suportado.`);
  }

  const merged = {
    hierarchy: [] as HierarchyRecord[],
    prefatura: [] as PrefaturaRecord[],
    pnr: [] as PnrRecord[],
    risk: [] as RiskRecord[],
    drivers: [] as DriverRecord[],
  };
  const kinds = new Set<SourceKind>();

  for (const workbook of workbooks) {
    try {
      const parsed = parseWorkbook(workbook.bytes, workbook.name, file.name, batchId);
      merged.hierarchy.push(...parsed.hierarchy);
      merged.prefatura.push(...parsed.prefatura);
      merged.pnr.push(...parsed.pnr);
      merged.risk.push(...parsed.risk);
      merged.drivers.push(...parsed.drivers);
      parsed.issues.forEach((issue) => issues.push(issue));
      parsed.kinds.forEach((kind) => kinds.add(kind));
    } catch (error) {
      issues.push(`${workbook.name}: ${error instanceof Error ? error.message : "erro de leitura"}`);
    }
  }

  const rowCount = Object.values(merged).reduce((total, records) => total + records.length, 0);
  const entry: ImportEntry = {
    id: makeId(),
    batchId,
    name: file.name,
    importedAt,
    size: file.size,
    status: rowCount === 0 ? "erro" : issues.length ? "com-alertas" : "concluído",
    kinds: [...kinds],
    workbookCount: workbooks.length,
    rowCount,
    issues,
  };

  return { ...merged, entry };
}

export async function parseFiles(files: File[]): Promise<ParsedBatch[]> {
  const results: ParsedBatch[] = [];
  for (const file of files) results.push(await parseFile(file));
  return results;
}
