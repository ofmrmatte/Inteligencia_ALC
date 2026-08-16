import fs from "fs";
import pg from "pg";
import * as XLSX from "xlsx";

const { Client } = pg;

const [, , filePath, batchId, period = "01Q012026"] = process.argv;
if (!filePath || !batchId) {
  console.error("Uso: node scripts/recover-prefatura-local.mjs <arquivo.xlsx> <batch-id> [periodo]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Defina DATABASE_URL para executar a recuperação.");
  process.exit(1);
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function headerKey(value) {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, " ").trim();
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function asId(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return cleanText(value).replace(/\.0$/, "");
}

function asNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = cleanText(value);
  if (!text) return 0;
  const parsed = Number(text.replace(/R\$|US\$/gi, "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = cleanText(value);
  const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseBase(value) {
  const label = cleanText(value);
  const parts = label.split(/\s+-\s+/);
  const sigla = parts.length > 1 ? cleanText(parts.at(-1)) : "";
  const name = parts.length > 1 ? parts.slice(0, -1).join(" - ") : label;
  return { label, name, sigla: normalizeText(sigla), baseKey: normalizeText(name) };
}

function operationFromSheet(sheetName) {
  const name = normalizeText(sheetName);
  if (name.includes("XPT")) return "XPT";
  if (name.includes("PNR")) return "PNR";
  if (name.includes("SVC")) return "SVC";
  return null;
}

function monthFromFortnight(value) {
  const match = /^(0[12])Q(\d{2})(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}` : "";
}

function rowObjects(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const header = rows[0] ?? [];
  const keys = header.map(headerKey);
  return rows.slice(1).map((values, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(keys.map((key, keyIndex) => [key, values[keyIndex]])),
  }));
}

const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: true });
const sourceFile = filePath.split(/[\\/]/).at(-1) ?? filePath;
const month = monthFromFortnight(period);
const rows = [];

for (const sheetName of workbook.SheetNames) {
  const operation = operationFromSheet(sheetName);
  if (!operation) continue;
  for (const row of rowObjects(workbook.Sheets[sheetName])) {
    const shipmentId = asId(row.values["ID DO PACOTE"]);
    if (!shipmentId) continue;
    const base = parseBase(row.values.BASE);
    const routeDate = asDate(row.values["DATA DA ROTA"] || row.values.DATA);
    const description = cleanText(row.values.DESCRICAO || row.values["DESCONTO PACOTE PERDIDO"] || row.values["DESCONTO PNR"]);
    rows.push({
      batch_id: batchId,
      shipment_id: shipmentId,
      route_id: asId(row.values["N ROTA"]),
      operation,
      period,
      fortnight: period,
      month,
      route_date: routeDate,
      base_label: base.label,
      base_name: base.name,
      base_key: base.baseKey,
      sigla: base.sigla,
      driver_name: cleanText(row.values.MOTORISTA),
      plate: cleanText(row.values.PLACA),
      description,
      value: asNumber(row.values.VALOR),
      source_file: sourceFile,
      source_sheet: sheetName,
      source_row: row.rowNumber,
      original_payload: {
        sourceFile,
        sourceSheet: sheetName,
        rowNumber: row.rowNumber,
        period,
        routeDate,
        shipmentId,
        value: asNumber(row.values.VALOR),
      },
    });
  }
}

console.log(JSON.stringify({ filePath, batchId, period, month, rows: rows.length }, null, 2));

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("begin");
try {
  await client.query("delete from public.prefatura_records where batch_id = $1", [batchId]);
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    await client.query(
      `insert into public.prefatura_records (
        batch_id, shipment_id, route_id, operation, period, fortnight, month, route_date,
        base_label, base_name, base_key, sigla, driver_name, plate, description, value,
        source_file, source_sheet, source_row, original_payload
      )
      select * from jsonb_to_recordset($1::jsonb) as x(
        batch_id uuid, shipment_id text, route_id text, operation text, period text, fortnight text,
        month text, route_date date, base_label text, base_name text, base_key text, sigla text,
        driver_name text, plate text, description text, value numeric, source_file text,
        source_sheet text, source_row integer, original_payload jsonb
      )`,
      [JSON.stringify(chunk)],
    );
  }
  await client.query(
    `update public.import_batches
     set competence = $2, fortnight = $3, month = $2, fortnights = array[$3]::text[], months = array[$2]::text[],
         valid_count = $4, persisted_count = $4, status = 'concluído'
     where id = $1`,
    [batchId, month, period, rows.length],
  );
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
