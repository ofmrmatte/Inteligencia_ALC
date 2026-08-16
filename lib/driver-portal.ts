import { unzipSync } from "fflate";
import { normalizeText } from "@/lib/normalize";

export const DRIVER_TICKET_TYPES = ["pacote_perdido", "pnr", "aguardando_comprovante", "com_penalidade", "pendente", "enviado_faturamento", "anulado", "resolvido"] as const;
export const DRIVER_DISPUTE_STATUSES = ["aberta", "em_analise", "aguardando_informacao", "deferida", "indeferida", "pdf_em_correcao", "concluida"] as const;

export type DriverTicketType = (typeof DRIVER_TICKET_TYPES)[number];
export type DriverDisputeStatus = (typeof DRIVER_DISPUTE_STATUSES)[number];

export interface DriverTicket {
  id: string;
  type: DriverTicketType;
  operationalId: string;
  routeId: string;
  baseKey: string;
  baseName: string;
  sigla: string;
  driverCode: string;
  driverName: string;
  date: string | null;
  value: number;
  status: DriverTicketType;
  lastUpdate: string;
  source: "prefatura" | "pnr" | "risk";
  history: Array<{ at: string; label: string; detail: string }>;
  isNew: boolean;
}

export interface ArchiveFile {
  path: string;
  bytes: Uint8Array;
  size: number;
}

export interface ClassifiedPaymentPdf {
  path: string;
  originalName: string;
  safeName: string;
  baseKey: string;
  baseName: string;
  driverCode: string;
  driverName: string;
  period: string;
  documentDate: string | null;
  status: "identified" | "unidentified" | "duplicate" | "invalid" | "conflict";
  issue: string;
  fileHash: string;
  fileSize: number;
  bytes: Uint8Array;
}

export const MAX_ARCHIVE_COMPRESSED_SIZE = 200 * 1024 * 1024;
export const MAX_ARCHIVE_UNCOMPRESSED_SIZE = 600 * 1024 * 1024;
export const MAX_ARCHIVE_FILES = 500;
export const MAX_PDF_SIZE = 25 * 1024 * 1024;
const EXECUTABLE_PATTERN = /\.(exe|bat|cmd|msi|ps1|sh|js|vbs|scr|com)$/i;

export function roleForDriverPortal(value: string) {
  return value === "driver" ? "driver" : value === "admin" ? "admin" : "super_admin";
}

export function normalizeDriverKey(value: unknown) {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, "");
}

export function safeStorageName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._/-]+/g, "-").replace(/\/+/g, "/").replace(/(^\/|\/$)/g, "") || "arquivo";
}

export function assertSafeArchivePath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized || normalized.includes("../") || normalized.startsWith("/") || /^[a-z]:/i.test(normalized)) {
    throw new Error(`${path}: caminho inválido no arquivo compactado.`);
  }
  if (EXECUTABLE_PATTERN.test(normalized)) throw new Error(`${path}: executáveis não são aceitos.`);
  return normalized;
}

export async function sha256Bytes(bytes: Uint8Array) {
  const input = new Uint8Array(bytes);
  const hash = await crypto.subtle.digest("SHA-256", input.buffer);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function pdfLooksValid(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export async function extractArchiveFiles(fileName: string, bytes: Uint8Array): Promise<ArchiveFile[]> {
  if (bytes.byteLength > MAX_ARCHIVE_COMPRESSED_SIZE) {
    throw new Error(`Arquivo compactado acima do limite de ${Math.round(MAX_ARCHIVE_COMPRESSED_SIZE / 1024 / 1024)} MB.`);
  }

  const lower = fileName.toLowerCase();
  let files: ArchiveFile[];
  if (lower.endsWith(".zip")) {
    const entries = unzipSync(bytes);
    files = Object.entries(entries).map(([path, content]) => ({ path: assertSafeArchivePath(path), bytes: content, size: content.byteLength }));
  } else if (lower.endsWith(".rar")) {
    const { createExtractorFromData } = await import("node-unrar-js");
    const data = new Uint8Array(bytes);
    const extractor = await createExtractorFromData({ data: data.buffer });
    const extracted = extractor.extract();
    files = [...extracted.files]
      .filter((entry) => !entry.fileHeader.flags.directory && entry.extraction)
      .map((entry) => ({
        path: assertSafeArchivePath(entry.fileHeader.name),
        bytes: entry.extraction as Uint8Array,
        size: entry.fileHeader.unpSize,
      }));
  } else {
    throw new Error("Envie um arquivo ZIP ou RAR.");
  }

  if (files.length > MAX_ARCHIVE_FILES) throw new Error(`Arquivo com ${files.length} itens. Limite operacional: ${MAX_ARCHIVE_FILES}.`);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_ARCHIVE_UNCOMPRESSED_SIZE) {
    throw new Error(`Conteúdo descompactado acima do limite de ${Math.round(MAX_ARCHIVE_UNCOMPRESSED_SIZE / 1024 / 1024)} MB.`);
  }
  return files;
}

function matchPeriod(text: string) {
  const normalized = normalizeText(text);
  const direct = /20\d{2}[-_/ ]?(0[1-9]|1[0-2])/.exec(normalized);
  if (direct) return `${direct[0].slice(0, 4)}-${direct[1]}`;
  const monthYear = /(JAN|JANEIRO|FEV|FEVEREIRO|MAR|MARCO|ABR|ABRIL|MAI|MAIO|JUN|JUNHO|JUL|JULHO|AGO|AGOSTO|SET|SETEMBRO|OUT|OUTUBRO|NOV|NOVEMBRO|DEZ|DEZEMBRO)[^\d]*(\d{2,4})/.exec(normalized);
  if (!monthYear) return "";
  const months: Record<string, string> = { JAN: "01", JANEIRO: "01", FEV: "02", FEVEREIRO: "02", MAR: "03", MARCO: "03", ABR: "04", ABRIL: "04", MAI: "05", MAIO: "05", JUN: "06", JUNHO: "06", JUL: "07", JULHO: "07", AGO: "08", AGOSTO: "08", SET: "09", SETEMBRO: "09", OUT: "10", OUTUBRO: "10", NOV: "11", NOVEMBRO: "11", DEZ: "12", DEZEMBRO: "12" };
  const year = monthYear[2].length === 2 ? `20${monthYear[2]}` : monthYear[2];
  return `${year}-${months[monthYear[1]]}`;
}

function matchDate(text: string) {
  const match = /(\d{2})[-_/](\d{2})[-_/](20\d{2}|\d{2})/.exec(text);
  if (!match) return null;
  return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2]}-${match[1]}`;
}

export async function classifyPaymentArchive(files: ArchiveFile[], knownDrivers: Array<{ id: string; driverCode: string; fullName: string; baseKey: string; baseName?: string }>, knownHashes: Set<string>) {
  if (files.length > MAX_ARCHIVE_FILES) throw new Error(`Arquivo com ${files.length} itens. Limite operacional: ${MAX_ARCHIVE_FILES}.`);
  const driverByCode = new Map(knownDrivers.map((driver) => [normalizeDriverKey(driver.driverCode), driver]));
  const seen = new Set<string>();
  const output: ClassifiedPaymentPdf[] = [];

  for (const file of files) {
    const path = file.path;
    const safeName = safeStorageName(path);
    const originalName = path.split("/").at(-1) ?? path;
    const hash = await sha256Bytes(file.bytes);
    const pdf = path.toLowerCase().endsWith(".pdf");
    const parts = path.split("/").map((part) => part.replace(/\.[^.]+$/, ""));
    const text = normalizeText(parts.join(" "));
    const codeMatches = [...driverByCode.values()].filter((candidate) => text.includes(normalizeDriverKey(candidate.driverCode)));
    const matchedIds = new Set(codeMatches.map((candidate) => candidate.id));
    const driver = matchedIds.size === 1 ? codeMatches[0] : undefined;
    const period = matchPeriod(path);
    const documentDate = matchDate(path);
    let status: ClassifiedPaymentPdf["status"] = "identified";
    let issue = "";

    if (!pdf || !pdfLooksValid(file.bytes) || file.size > MAX_PDF_SIZE) {
      status = "invalid";
      issue = !pdf ? "Arquivo não é PDF." : file.size > MAX_PDF_SIZE ? "PDF acima do limite." : "Assinatura PDF inválida.";
    } else if (matchedIds.size > 1) {
      status = "conflict";
      issue = "Mais de um ID de motorista possível no caminho/nome do arquivo.";
    } else if (!driver || !period) {
      status = "unidentified";
      issue = !driver ? "ID do motorista não identificado com confiança no caminho/nome do arquivo." : "Período não identificado.";
    } else if (knownHashes.has(hash) || seen.has(hash)) {
      status = "duplicate";
      issue = "PDF já existe no histórico ou no mesmo lote.";
    }

    seen.add(hash);
    output.push({
      path,
      originalName,
      safeName,
      baseKey: driver?.baseKey ?? "",
      baseName: driver?.baseName ?? driver?.baseKey ?? "",
      driverCode: driver?.driverCode ?? "",
      driverName: driver?.fullName ?? "",
      period,
      documentDate,
      status,
      issue,
      fileHash: hash,
      fileSize: file.size,
      bytes: file.bytes,
    });
  }

  return output;
}

export function pnrStatusToTicket(status: string): DriverTicketType {
  const normalized = normalizeText(status);
  if (normalized.includes("AGUARDANDO")) return "aguardando_comprovante";
  if (normalized.includes("PENAL")) return "com_penalidade";
  if (normalized.includes("FATUR")) return "enviado_faturamento";
  if (normalized.includes("ANUL")) return "anulado";
  if (normalized.includes("RESOL") || normalized.includes("CONCL")) return "resolvido";
  return "pendente";
}
