import "dotenv/config";
import chokidar from "chokidar";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const XLSX = require("../assets/vendor/xlsx.full.min.js");

const PRE_FATURA_FILE_TYPE = "PRE_FATURA";
const GESTAO_FILE_TYPE = "GESTAO_PACOTES";
const DEFAULT_DEBOUNCE_MS = 4500;
const STABILITY_CHECK_INTERVAL_MS = 1000;
const STABILITY_REQUIRED_CHECKS = 2;
const STABILITY_TIMEOUT_MS = 60000;
const PROCESSED_RECORDS_BATCH_SIZE = 500;

const MONTHS = [
  { number: "01", abbr: "Jan", aliases: ["janeiro", "jan"] },
  { number: "02", abbr: "Fev", aliases: ["fevereiro", "fev"] },
  { number: "03", abbr: "Mar", aliases: ["marco", "março", "mar"] },
  { number: "04", abbr: "Abr", aliases: ["abril", "abr"] },
  { number: "05", abbr: "Mai", aliases: ["maio", "mai"] },
  { number: "06", abbr: "Jun", aliases: ["junho", "jun"] },
  { number: "07", abbr: "Jul", aliases: ["julho", "jul"] },
  { number: "08", abbr: "Ago", aliases: ["agosto", "ago"] },
  { number: "09", abbr: "Set", aliases: ["setembro", "set"] },
  { number: "10", abbr: "Out", aliases: ["outubro", "out"] },
  { number: "11", abbr: "Nov", aliases: ["novembro", "nov"] },
  { number: "12", abbr: "Dez", aliases: ["dezembro", "dez"] },
];

const monthByNumber = new Map(MONTHS.map((month) => [month.number, month.abbr]));
const pendingTimers = new Map();
const runOnce = process.argv.includes("--once");
const syncDelete = parseBoolean(process.env.SYNC_DELETE, false);
const debounceMs = Number(process.env.SYNC_DEBOUNCE_MS || DEFAULT_DEBOUNCE_MS);

const categories = [
  {
    name: "Pré-Fatura",
    fileType: PRE_FATURA_FILE_TYPE,
    folder: process.env.PRE_FATURA_FOLDER,
    storagePrefix: "pre-fatura",
  },
  {
    name: "Gestão de Pacotes",
    fileType: GESTAO_FILE_TYPE,
    folder: process.env.GESTAO_FOLDER,
    storagePrefix: "gestao-pacotes",
  },
].filter((category) => Boolean(category.folder));

function log(message) {
  const time = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  console.log(`[${time}] ${message}`);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-/.]+/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function normalizeBase(value) {
  return normalizeText(value)
    .replace(/\bBASE\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDriverName(value) {
  return normalizeText(value);
}

function formatDriverName(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const connectors = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);
  return normalized
    .toLowerCase()
    .split(/\s+/)
    .map((part, index) => (index > 0 && connectors.has(part.toUpperCase()) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "")
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const number = Number(text);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

function normalizarValorGestao(value) {
  return Math.abs(parseMoney(value));
}

function excelSerialToDate(value) {
  const utcDays = Math.floor(Number(value) - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000);
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = excelSerialToDate(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const text = String(value || "").trim();
  if (!text) return null;
  const br = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${String(br[2]).padStart(2, "0")}-${String(br[1]).padStart(2, "0")}`;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function findHeaderIndex(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (let index = 0; index < headers.length; index += 1) {
    const header = normalizeHeader(headers[index]);
    if (normalizedAliases.includes(header)) return index;
  }
  for (let index = 0; index < headers.length; index += 1) {
    const header = normalizeHeader(headers[index]);
    if (normalizedAliases.some((alias) => header.includes(alias))) return index;
  }
  return -1;
}

function readCell(row, index) {
  return index >= 0 ? row[index] ?? "" : "";
}

function formatId(value) {
  return String(value ?? "").trim();
}

function normalizeSheetLabel(value, type = "") {
  const raw = normalizeText(`${value || ""} ${type || ""}`);
  if ((raw.includes("SVC") || raw.includes("SERVICE") || raw.includes("SERVICO")) && raw.includes("PERDID")) return "SVC PERDIDOS";
  if (raw.includes("XPT") && raw.includes("PERDID")) return "XPT PERDIDOS";
  if (raw.includes("PNR")) return "PNR";
  return String(value || "").trim() || "Sem aba";
}

function splitBase(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/(.+?)\s*[-–]\s*([A-Z]{1,4}\d{0,3})$/i);
  return {
    cidade_base: match ? match[1].trim() : raw,
    sigla_base: match ? match[2].trim().toUpperCase() : normalizeBase(raw),
  };
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "y"].includes(String(value).trim().toLowerCase());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExcelFile(filePath) {
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  return (ext === ".xlsx" || ext === ".xls") && !fileName.startsWith("~$");
}

function safeStorageName(fileName) {
  return String(fileName || "arquivo.xlsx")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_");
}

function getContentType(filePath) {
  return path.extname(filePath).toLowerCase() === ".xls"
    ? "application/vnd.ms-excel"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function detectYear(text) {
  const fullYear = String(text || "").match(/\b(20\d{2}|19\d{2})\b/);
  if (fullYear) return fullYear[1];
  const shortYear = String(text || "").match(/\b(\d{2})\b/);
  return shortYear ? `20${shortYear[1]}` : String(new Date().getFullYear());
}

function detectMonthInfo(text) {
  const normalized = normalize(text);
  for (const month of MONTHS) {
    if (month.aliases.some((alias) => normalized.includes(normalize(alias)))) {
      return { number: month.number, abbr: month.abbr };
    }
  }
  const numeric = normalized.match(/\b(0?[1-9]|1[0-2])\b/);
  if (numeric) {
    const number = String(Number(numeric[1])).padStart(2, "0");
    return { number, abbr: monthByNumber.get(number) || "" };
  }
  return { number: "01", abbr: "Jan" };
}

function detectPeriodInfo(text) {
  const normalized = normalize(text);
  if (/(^|\s)(1\s*q|1q|1a quinzena|primeira quinzena)(\s|$)/i.test(normalized)) {
    return { type: "q1", label: "1ª quinzena", display: "1ª Quinzena" };
  }
  if (/(^|\s)(2\s*q|2q|2a quinzena|segunda quinzena)(\s|$)/i.test(normalized)) {
    return { type: "q2", label: "2ª quinzena", display: "2ª Quinzena" };
  }
  return { type: "month", label: "Mês completo", display: "Mês Completo" };
}

function extractFileMetadata(filePath, category) {
  const originalName = path.basename(filePath);
  const year = detectYear(originalName);
  const month = detectMonthInfo(originalName);
  const period = detectPeriodInfo(originalName);
  const competencia = `${month.abbr}/${String(year).slice(-2)}`;
  const displayName = `${category.name} · ${period.display} · ${competencia}`;
  return {
    ano: year,
    mes: month.abbr,
    competencia,
    quinzena: period.label,
    display_name: displayName,
    original_name: originalName,
    file_type: category.fileType,
    reference_month: month.number,
    reference_year: year,
    period_label: period.label,
    period_type: period.type,
  };
}

function getProcessedTable(category) {
  return category.fileType === GESTAO_FILE_TYPE ? "gestao_pacotes_records" : "pre_fatura_records";
}

function getPeriodTypeFromLabel(label) {
  const text = normalizeText(label);
  if (text.includes("1")) return "q1";
  if (text.includes("2")) return "q2";
  return "month";
}

function identificarAbaGestao(sheetName) {
  const sheet = normalizeText(sheetName);
  if (sheet.includes("ALINHAMENTO")) return "ALINHAMENTO";
  if (sheet.includes("ABSORVID") || /\bALC\b/.test(sheet)) return "ALC";
  if (sheet.includes("MERCADO LIVRE") || sheet.includes("MELI") || /\bML\b/.test(sheet)) return "MERCADO_LIVRE";
  return null;
}

function classifyPackageDecision(value, sheetType) {
  if (sheetType === "ALC") return "ALC";
  if (sheetType === "MERCADO_LIVRE") return "MERCADO_LIVRE";
  const text = normalizeText(value);
  if (text.includes("DISPATCHER")) return "DISPATCHER";
  if (text.includes("DRIVER") || text.includes("MOTORISTA")) return "DRIVER";
  return "INDEFINIDO";
}

function findPackageHeaderRow(matrix) {
  const limit = Math.min(matrix.length, 12);
  for (let index = 0; index < limit; index += 1) {
    const rowText = normalizeText((matrix[index] || []).join(" "));
    if ((rowText.includes("VALOR") || rowText.includes("DESCONTO")) && (rowText.includes("BASE") || rowText.includes("MOTORISTA") || rowText.includes("DRIVER"))) {
      return index;
    }
  }
  return 0;
}

function isPackageTotalRow(row) {
  const text = normalizeText((row || []).join(" "));
  return /\b(TOTAL|TOTAIS|TOTAL GERAL|SUBTOTAL|SOMA|SOMATORIA|RESUMO|VALOR TOTAL|TOTAL DESCONTOS|TOTAL DRIVER|TOTAL DISPATCHER|TOTAL MERCADO LIVRE|QTD TOTAL|QUANTIDADE TOTAL)\b/.test(text);
}

function identifyTypeByBase(base) {
  const code = normalizeBase(base);
  if (code.startsWith("S")) return "SVC";
  if (code.startsWith("E")) return "XPT";
  return "";
}

function parsePreFaturaWorkbook(filePath, fileRecord, metadata) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const rows = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    if (!matrix.length) return;
    const headers = (matrix[0] || []).map((value) => String(value || "").trim());
    const idx = {
      base: findHeaderIndex(headers, ["BASE"]),
      motorista: findHeaderIndex(headers, ["MOTORISTA", "DRIVER"]),
      placa: findHeaderIndex(headers, ["PLACA"]),
      tipo: findHeaderIndex(headers, ["DESCONTO PACOTE PERDIDO", "DESCONTO PNR"]),
      data: findHeaderIndex(headers, ["DATA DA ROTA", "DATA"]),
      pacote: findHeaderIndex(headers, ["ID DO PACOTE", "ID DE ENVIO", "ID PACOTE"]),
      rota: findHeaderIndex(headers, ["Nº ROTA", "N° ROTA", "NRO ROTA", "NUMERO ROTA", "ROTA"]),
      valor: findHeaderIndex(headers, ["VALOR"]),
      descricao: findHeaderIndex(headers, ["DESCRIÇÃO", "DESCRICAO"]),
    };
    for (let index = 1; index < matrix.length; index += 1) {
      const row = matrix[index];
      if (!row || row.every((cell) => cell == null || String(cell).trim() === "")) continue;
      const base = readCell(row, idx.base);
      if (!base || normalize(base) === "total") continue;
      const tipoDesc = readCell(row, idx.tipo) || (normalizeText(sheetName).includes("PNR") ? "DESCONTO PNR" : "DESCONTO PACOTE PERDIDO");
      const abaOrigem = normalizeSheetLabel(sheetName, tipoDesc);
      const tipo = abaOrigem === "PNR" ? "PNR" : abaOrigem.includes("XPT") ? "XPT" : "SVC";
      const baseParts = splitBase(base);
      const driver = formatDriverName(readCell(row, idx.motorista));
      const rawData = {
        file_category: PRE_FATURA_FILE_TYPE,
        arquivo_origem: metadata.original_name,
        competencia: metadata.competencia,
        quinzena: metadata.quinzena,
        aba_origem: abaOrigem,
        divisao: abaOrigem,
        tipo_desconto: tipoDesc,
        tipo_registro: abaOrigem === "PNR" ? "PNR" : "PACOTE PERDIDO",
        base,
        cidade_base: baseParts.cidade_base,
        sigla_base: baseParts.sigla_base,
        base_normalizada: normalizeBase(base),
        motorista: driver,
        placa: readCell(row, idx.placa) || "",
        descricao: readCell(row, idx.descricao) || "",
        data_normalizada: parseDateValue(readCell(row, idx.data)),
        id_pacote: formatId(readCell(row, idx.pacote)),
        n_rota: formatId(readCell(row, idx.rota)),
        valor_numerico: parseMoney(readCell(row, idx.valor)),
        ocorrencias: 1,
      };
      rows.push({
        file_id: fileRecord.id,
        competencia: metadata.competencia,
        quinzena: metadata.quinzena,
        tipo,
        base,
        codigo_base: normalizeBase(base),
        driver,
        driver_normalizado: normalizeDriverName(driver),
        placa: rawData.placa,
        data: rawData.data_normalizada,
        id_envio: rawData.id_pacote,
        rota: rawData.n_rota,
        valor: rawData.valor_numerico,
        aba_origem: abaOrigem,
        raw_data: rawData,
      });
    }
  });
  return rows;
}

function parseGestaoWorkbook(filePath, fileRecord, metadata) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const rows = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheetType = identificarAbaGestao(sheetName);
    if (!sheetType) return;
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    if (!matrix.length) return;
    const headerIndex = findPackageHeaderRow(matrix);
    const headers = (matrix[headerIndex] || []).map((value) => String(value || "").trim());
    const idx = {
      base: findHeaderIndex(headers, ["BASE", "SVC", "ESTACAO", "ESTAÇÃO", "UNIDADE"]),
      motorista: findHeaderIndex(headers, ["MOTORISTA", "DRIVER", "NOME MOTORISTA", "NOME DO MOTORISTA"]),
      valor: findHeaderIndex(headers, ["VALOR", "VALOR DESCONTO", "DESCONTO"]),
      data: findHeaderIndex(headers, ["DATA", "DATA DA ROTA"]),
      rota: findHeaderIndex(headers, ["ROTA", "N ROTA", "Nº ROTA", "NRO ROTA", "NUMERO ROTA", "NÚMERO ROTA"]),
      id: findHeaderIndex(headers, ["ID CASO", "ID", "ID DO PACOTE", "ID PACOTE", "CASO", "ID DE ENVIO"]),
      decisao: findHeaderIndex(headers, ["DECISAO", "DECISÃO", "ADM", "RETORNO", "ACAO", "AÇÃO"]),
      evidencia1: findHeaderIndex(headers, ["EVIDENCIA 1", "EVIDÊNCIA 1", "EVIDENCIA", "EVIDÊNCIA"]),
      evidencia2: findHeaderIndex(headers, ["EVIDENCIA 2", "EVIDÊNCIA 2"]),
    };
    for (let index = headerIndex + 1; index < matrix.length; index += 1) {
      const row = matrix[index];
      if (!row || row.every((cell) => cell == null || String(cell).trim() === "") || isPackageTotalRow(row)) continue;
      const valor = normalizarValorGestao(readCell(row, idx.valor));
      if (!valor) continue;
      const base = readCell(row, idx.base);
      const driver = formatDriverName(readCell(row, idx.motorista));
      const decisao = readCell(row, idx.decisao);
      const desconto = classifyPackageDecision(decisao, sheetType);
      const idEnvio = formatId(readCell(row, idx.id));
      const rawData = {
        file_category: GESTAO_FILE_TYPE,
        arquivo_origem: metadata.original_name,
        competencia: metadata.competencia,
        quinzena: metadata.quinzena,
        aba_origem: "Gestão de Pacotes",
        divisao: "Gestão de Pacotes",
        aba_gestao: sheetType,
        aba_gestao_label: sheetName,
        tipo_registro: "GESTAO_PACOTES",
        tipo_desconto: desconto,
        categoria_final: desconto,
        base: base || "",
        base_normalizada: normalizeBase(base),
        motorista: driver,
        driver,
        valor_numerico: valor,
        data_normalizada: parseDateValue(readCell(row, idx.data)),
        n_rota: formatId(readCell(row, idx.rota)),
        id_caso: idEnvio,
        id_pacote: idEnvio,
        evidencia_1: readCell(row, idx.evidencia1),
        evidencia_2: readCell(row, idx.evidencia2),
        decisao_adm: decisao || "",
        mes: metadata.mes,
        ano: metadata.ano,
        reference_month: metadata.reference_month,
        reference_year: metadata.reference_year,
        period_type: metadata.period_type,
        ocorrencias: 1,
      };
      rows.push({
        file_id: fileRecord.id,
        competencia: metadata.competencia,
        quinzena: metadata.quinzena,
        tipo: identifyTypeByBase(base),
        desconto,
        base: base || "",
        codigo_base: normalizeBase(base),
        driver,
        driver_normalizado: normalizeDriverName(driver),
        data: rawData.data_normalizada,
        id_envio: idEnvio,
        rota: rawData.n_rota,
        valor,
        decisao_adm: decisao || "",
        observacao: [rawData.evidencia_1, rawData.evidencia_2].filter(Boolean).join(" | "),
        aba_origem: sheetType,
        raw_data: rawData,
      });
    }
  });
  return rows;
}

function parseProcessedRows(filePath, category, fileRecord, metadata) {
  return category.fileType === GESTAO_FILE_TYPE
    ? parseGestaoWorkbook(filePath, fileRecord, metadata)
    : parsePreFaturaWorkbook(filePath, fileRecord, metadata);
}

async function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function waitForStableFile(filePath) {
  const startedAt = Date.now();
  let lastSignature = "";
  let stableChecks = 0;

  while (Date.now() - startedAt < STABILITY_TIMEOUT_MS) {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error("O caminho detectado não é um arquivo.");
    if (stat.size <= 0) throw new Error("Arquivo vazio ignorado.");

    const signature = `${stat.size}:${stat.mtimeMs}`;
    if (signature === lastSignature) stableChecks += 1;
    else stableChecks = 0;

    if (stableChecks >= STABILITY_REQUIRED_CHECKS) return stat;
    lastSignature = signature;
    await delay(STABILITY_CHECK_INTERVAL_MS);
  }

  throw new Error("Tempo limite aguardando o arquivo estabilizar.");
}

function findCategoryForPath(filePath) {
  const resolved = path.resolve(filePath).toLowerCase();
  return categories.find((category) => resolved.startsWith(path.resolve(category.folder).toLowerCase()));
}

async function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;

  if (!url || !key) {
    throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY no .env.");
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let user = {
    id: process.env.SUPABASE_SYNC_USER_ID || null,
    email: process.env.SUPABASE_SYNC_USER_EMAIL || "sincronizador.local@alc.local",
  };

  if (!serviceKey && process.env.SUPABASE_EMAIL && process.env.SUPABASE_PASSWORD) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: process.env.SUPABASE_EMAIL,
      password: process.env.SUPABASE_PASSWORD,
    });
    if (error) throw error;
    user = {
      id: data.user?.id || user.id,
      email: data.user?.email || user.email,
    };
  }

  return { supabase, user };
}

async function findFilesByMetadata(supabase, category, metadata) {
  const { data, error } = await supabase
    .from("dashboard_files")
    .select("id,file_name,storage_path,file_type,is_active,status,reference_month,reference_year,period_label,period_type,metadata")
    .eq("file_type", category.fileType)
    .contains("metadata", {
      original_name: metadata.original_name,
      competencia: metadata.competencia,
      quinzena: metadata.quinzena,
    });

  if (error) throw error;
  if (Array.isArray(data) && data.length) return data;

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("dashboard_files")
    .select("id,file_name,storage_path,file_type,is_active,status,reference_month,reference_year,period_label,period_type,metadata")
    .eq("file_type", category.fileType)
    .eq("file_name", metadata.original_name);

  if (fallbackError) throw fallbackError;
  return (Array.isArray(fallbackData) ? fallbackData : []).filter((record) => {
    const recordMetadata = record.metadata || {};
    return (
      (record.reference_month === metadata.reference_month || recordMetadata.reference_month === metadata.reference_month || recordMetadata.mes === metadata.mes) &&
      (String(record.reference_year || "") === String(metadata.reference_year || "") || String(recordMetadata.reference_year || "") === String(metadata.reference_year || "") || String(recordMetadata.ano || "") === String(metadata.ano || "")) &&
      (record.period_type === metadata.period_type || recordMetadata.period_type === metadata.period_type || recordMetadata.quinzena === metadata.quinzena)
    );
  });
}

async function findFilesForLocalDeletion(supabase, category, metadata) {
  const byMetadata = await findFilesByMetadata(supabase, category, metadata);
  if (byMetadata.length) return byMetadata;

  const { data, error } = await supabase
    .from("dashboard_files")
    .select("id,file_name,storage_path,file_type,is_active,status,reference_month,reference_year,period_label,period_type,metadata")
    .eq("file_type", category.fileType)
    .eq("file_name", metadata.original_name);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function findSyncedFilesByCategory(supabase, category) {
  const { data, error } = await supabase
    .from("dashboard_files")
    .select("id,file_name,storage_path,file_type,is_active,status,reference_month,reference_year,period_label,period_type,metadata")
    .eq("file_type", category.fileType)
    .contains("metadata", { sync_source: "local-folder" });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function findFileByHash(supabase, category, fileHash) {
  const { data, error } = await supabase
    .from("dashboard_files")
    .select("id,file_name,storage_path,file_type,is_active,status,reference_month,reference_year,period_label,period_type,metadata")
    .eq("file_type", category.fileType)
    .contains("metadata", { file_hash: fileHash })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

function needsPeriodMetadataUpdate(record, metadata, category) {
  const current = record || {};
  const currentMetadata = current.metadata || {};
  return (
    current.file_type !== category.fileType ||
    current.status !== "loaded" ||
    current.reference_month !== metadata.reference_month ||
    String(current.reference_year || "") !== String(metadata.reference_year || "") ||
    current.period_label !== metadata.period_label ||
    current.period_type !== metadata.period_type ||
    currentMetadata.reference_month !== metadata.reference_month ||
    String(currentMetadata.reference_year || "") !== String(metadata.reference_year || "") ||
    currentMetadata.period_label !== metadata.period_label ||
    currentMetadata.period_type !== metadata.period_type ||
    currentMetadata.competencia !== metadata.competencia ||
    currentMetadata.mes !== metadata.mes ||
    currentMetadata.ano !== metadata.ano ||
    currentMetadata.quinzena !== metadata.quinzena ||
    currentMetadata.display_name !== metadata.display_name ||
    currentMetadata.original_name !== metadata.original_name
  );
}

async function ensureRemotePeriodMetadata(supabase, record, metadata, category) {
  if (!record?.id || !needsPeriodMetadataUpdate(record, metadata, category)) return false;

  const nextMetadata = {
    ...(record.metadata || {}),
    ...metadata,
    file_category: category.fileType,
    semantic_file_type: category.fileType,
    file_type: category.fileType,
  };

  const { error } = await supabase
    .from("dashboard_files")
    .update({
      file_type: category.fileType,
      reference_month: metadata.reference_month,
      reference_year: metadata.reference_year,
      period_label: metadata.period_label,
      period_type: metadata.period_type,
      status: "loaded",
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", record.id);

  if (error) throw error;
  log(`Metadados corrigidos: ${metadata.original_name} -> ${metadata.competencia} (${metadata.quinzena})`);
  return true;
}

async function deactivatePreviousRecords(supabase, records, exceptId = "") {
  const ids = records.map((record) => record.id).filter((id) => id && id !== exceptId);
  if (!ids.length) return;
  const { error } = await supabase
    .from("dashboard_files")
    .update({
      is_active: false,
      status: "superseded",
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) throw error;
}

async function deactivateOtherActivePreFaturaRecords(supabase, activeRecordId) {
  if (!activeRecordId) return;
  const { error } = await supabase
    .from("dashboard_files")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("file_type", PRE_FATURA_FILE_TYPE)
    .eq("is_active", true)
    .neq("id", activeRecordId);
  if (error) throw error;
}

async function deleteRemoteRecords(records, contextLabel) {
  const bucket = process.env.DASHBOARD_BUCKET || "dashboard-files";
  const unique = new Map();
  records.forEach((record) => {
    if (record?.id) unique.set(record.id, record);
  });
  const safeRecords = Array.from(unique.values());
  if (!safeRecords.length) return;

  const storagePaths = safeRecords.map((record) => record.storage_path).filter(Boolean);
  if (storagePaths.length) {
    const { error: storageError } = await syncContext.supabase.storage.from(bucket).remove(storagePaths);
    if (storageError) {
      log(`Erro ao remover do Storage (${contextLabel}); removendo registros do painel mesmo assim: ${storageError.message || storageError}`);
    } else {
      log(`Storage removido (${contextLabel}): ${storagePaths.length} arquivo${storagePaths.length === 1 ? "" : "s"}.`);
    }
  }

  const ids = safeRecords.map((record) => record.id).filter(Boolean);
  if (ids.length) {
    const { error: dbError } = await syncContext.supabase.from("dashboard_files").delete().in("id", ids);
    if (dbError) throw dbError;
    log(`Registro removido do painel (${contextLabel}): ${ids.length} arquivo${ids.length === 1 ? "" : "s"}.`);
  }
}

async function deleteRemoteRecordsForLocalPath(filePath) {
  if (!isExcelFile(filePath)) return;
  const category = findCategoryForPath(filePath);
  if (!category) return;

  const metadata = extractFileMetadata(filePath, category);
  log(`Exclusão local detectada: ${metadata.original_name}`);

  try {
    const records = await findFilesForLocalDeletion(syncContext.supabase, category, metadata);
    if (!records.length) {
      log(`Nenhum registro correspondente encontrado no Supabase para ${metadata.original_name}.`);
      return;
    }
    await deleteRemoteRecords(records, metadata.original_name);
  } catch (error) {
    log(`Erro ao excluir ${metadata.original_name} do Supabase: ${error.message || error}`);
  }
}

async function reconcileDeletedLocalFiles() {
  if (!syncDelete) return;
  log("Verificando arquivos locais removidos anteriormente...");

  for (const category of categories) {
    const records = await findSyncedFilesByCategory(syncContext.supabase, category);
    const missingRecords = [];
    for (const record of records) {
      const originalName = record.metadata?.original_name || record.file_name;
      if (!originalName) continue;
      const localPath = path.join(category.folder, originalName);
      try {
        await fs.access(localPath);
      } catch {
        missingRecords.push(record);
      }
    }
    if (missingRecords.length) {
      log(`${category.name}: ${missingRecords.length} arquivo${missingRecords.length === 1 ? "" : "s"} removido${missingRecords.length === 1 ? "" : "s"} localmente serão excluídos do Supabase.`);
      await deleteRemoteRecords(missingRecords, `${category.name} sem arquivo local`);
    }
  }
}

async function uploadAndRegisterFile({ supabase, user, filePath, category, stat, fileHash, metadata }) {
  const bucket = process.env.DASHBOARD_BUCKET || "dashboard-files";
  const storagePath = `${category.storagePrefix}/${metadata.reference_year}/${metadata.reference_month}/${Date.now()}_${safeStorageName(metadata.original_name)}`;
  const fileBuffer = await fs.readFile(filePath);

  log(`Upload iniciado: ${metadata.original_name}`);
  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, fileBuffer, {
    cacheControl: "3600",
    contentType: getContentType(filePath),
    upsert: false,
  });

  if (uploadError) throw uploadError;
  log(`Upload concluído em ${storagePath}`);

  const now = new Date().toISOString();
  const insertPayload = {
    file_name: metadata.original_name,
    storage_path: storagePath,
    file_type: category.fileType,
    file_size: stat.size,
    uploaded_by: user.id,
    uploaded_by_email: user.email,
    reference_month: metadata.reference_month,
    reference_year: metadata.reference_year,
    period_label: metadata.period_label,
    period_type: metadata.period_type,
    is_active: category.fileType === PRE_FATURA_FILE_TYPE,
    status: "loaded",
    metadata: {
      ...metadata,
      file_category: category.fileType,
      semantic_file_type: category.fileType,
      mime_type: getContentType(filePath),
      file_hash: fileHash,
      size_bytes: stat.size,
      last_modified_local: stat.mtime.toISOString(),
      synced_at: now,
      sync_source: "local-folder",
      parsed_rows: 0,
    },
  };

  const { data, error } = await supabase
    .from("dashboard_files")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    await supabase.storage.from(bucket).remove([storagePath]);
    throw error;
  }

  log(`Registro atualizado no Supabase: ${data.id}`);
  return data;
}

function isMissingProcessedTableError(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;
  return /42P01|PGRST205|does not exist|schema cache|Could not find the table/i.test(text);
}

async function saveProcessedRowsForFile({ supabase, filePath, category, fileRecord, metadata }) {
  const tableName = getProcessedTable(category);
  try {
    const { error: tableError } = await supabase.from(tableName).select("id", { head: true }).limit(1);
    if (tableError) throw tableError;
    const rows = parseProcessedRows(filePath, category, fileRecord, metadata);
    await supabase.from(tableName).delete().eq("file_id", fileRecord.id);
    for (let index = 0; index < rows.length; index += PROCESSED_RECORDS_BATCH_SIZE) {
      const batch = rows.slice(index, index + PROCESSED_RECORDS_BATCH_SIZE);
      if (!batch.length) continue;
      const { error } = await supabase.from(tableName).insert(batch);
      if (error) throw error;
    }

    const nextMetadata = {
      ...(fileRecord.metadata || {}),
      parsed_rows: rows.length,
      record_count: rows.length,
      processed_at: new Date().toISOString(),
      processed_source: "local-sync",
    };
    const { error } = await supabase
      .from("dashboard_files")
      .update({
        status: "processed",
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileRecord.id);
    if (error) throw error;
    log(`Registros processados salvos: ${rows.length} linha${rows.length === 1 ? "" : "s"} em ${tableName}.`);
  } catch (error) {
    if (isMissingProcessedTableError(error)) {
      log(`Tabela processada ainda não existe (${tableName}); arquivo ficará disponível pelo fallback XLSX até aplicar a migração.`);
      return;
    }
    log(`Erro ao salvar registros processados de ${metadata.original_name}: ${error.message || error}`);
  }
}

async function syncFile(filePath, eventName = "change") {
  if (!isExcelFile(filePath)) return;
  const category = findCategoryForPath(filePath);
  if (!category) return;

  try {
    log(`Detectado: ${path.basename(filePath)} (${eventName})`);
    log("Aguardando arquivo estabilizar...");
    const stat = await waitForStableFile(filePath);
    const metadata = extractFileMetadata(filePath, category);
    const fileHash = await calculateSha256(filePath);
    log(`Hash calculado: ${fileHash.slice(0, 12)}...`);

    const duplicated = await findFileByHash(syncContext.supabase, category, fileHash);
    if (duplicated) {
      await ensureRemotePeriodMetadata(syncContext.supabase, duplicated, metadata, category);
      const previousRecords = await findFilesByMetadata(syncContext.supabase, category, metadata);
      await deactivatePreviousRecords(syncContext.supabase, previousRecords, duplicated.id);
      await saveProcessedRowsForFile({
        supabase: syncContext.supabase,
        filePath,
        category,
        fileRecord: duplicated,
        metadata,
      });
      log(`Ignorado por duplicidade: ${metadata.original_name}`);
      return;
    }

    const previousRecords = await findFilesByMetadata(syncContext.supabase, category, metadata);
    if (previousRecords.length) {
      log(`Versão anterior encontrada (${previousRecords.length}). Será inativada após registrar a nova versão.`);
    }

    const newRecord = await uploadAndRegisterFile({
      supabase: syncContext.supabase,
      user: syncContext.user,
      filePath,
      category,
      stat,
      fileHash,
      metadata,
    });
    if (previousRecords.length) {
      await deactivatePreviousRecords(syncContext.supabase, previousRecords);
    }
    if (category.fileType === PRE_FATURA_FILE_TYPE) {
      await deactivateOtherActivePreFaturaRecords(syncContext.supabase, newRecord.id);
    }
    await saveProcessedRowsForFile({
      supabase: syncContext.supabase,
      filePath,
      category,
      fileRecord: newRecord,
      metadata,
    });
  } catch (error) {
    log(`Erro ao sincronizar ${path.basename(filePath)}: ${error.message || error}`);
  }
}

function scheduleSync(filePath, eventName) {
  if (!isExcelFile(filePath)) return;
  const key = path.resolve(filePath);
  windowClearTimeoutCompat(pendingTimers.get(key));
  pendingTimers.set(
    key,
    setTimeout(() => {
      pendingTimers.delete(key);
      void syncFile(filePath, eventName);
    }, debounceMs),
  );
}

function windowClearTimeoutCompat(timer) {
  if (timer) clearTimeout(timer);
}

async function listExcelFiles(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(folder, entry.name))
    .filter(isExcelFile);
}

async function validateFolders() {
  if (!categories.length) {
    throw new Error("Configure PRE_FATURA_FOLDER e GESTAO_FOLDER no .env.");
  }
  for (const category of categories) {
    await fs.mkdir(category.folder, { recursive: true });
    log(`${category.name}: ${category.folder}`);
  }
}

async function runOneShotSync() {
  for (const category of categories) {
    const files = await listExcelFiles(category.folder);
    for (const filePath of files) {
      await syncFile(filePath, "scan");
    }
  }
}

async function watchFolders() {
  const watcher = chokidar.watch(categories.map((category) => category.folder), {
    awaitWriteFinish: {
      stabilityThreshold: debounceMs,
      pollInterval: 500,
    },
    depth: 0,
    ignoreInitial: false,
    ignored: (targetPath) => path.basename(targetPath).startsWith("~$"),
  });

  watcher
    .on("add", (filePath) => scheduleSync(filePath, "novo arquivo"))
    .on("change", (filePath) => scheduleSync(filePath, "alterado"))
    .on("unlink", (filePath) => {
      if (syncDelete) {
        void deleteRemoteRecordsForLocalPath(filePath);
      } else {
        log(`Remoção local ignorada por segurança: ${path.basename(filePath)}`);
      }
    })
    .on("error", (error) => log(`Erro no watcher: ${error.message || error}`));

  log("Sincronização ativa. Pressione Ctrl+C para encerrar.");
}

let syncContext = null;

async function main() {
  await validateFolders();
  syncContext = await createSupabaseClient();
  log(`Supabase conectado. Bucket: ${process.env.DASHBOARD_BUCKET || "dashboard-files"}`);
  await reconcileDeletedLocalFiles();

  if (runOnce) {
    await runOneShotSync();
    log("Sincronização pontual concluída.");
    return;
  }

  await watchFolders();
}

main().catch((error) => {
  log(`Falha ao iniciar sincronizador: ${error.message || error}`);
  process.exitCode = 1;
});
