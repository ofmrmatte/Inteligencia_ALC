import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

export const CANONICAL_MODULES = [
  {
    moduleKey: "pre_fatura",
    tableName: "pre_fatura_records",
    fileType: "PRE_FATURA",
    fileIdColumn: "file_id",
    storagePrefix: "processed-only/pre-fatura/",
  },
  {
    moduleKey: "gestao_pacotes",
    tableName: "gestao_pacotes_records",
    fileType: "GESTAO_PACOTES",
    fileIdColumn: "file_id",
    storagePrefix: "processed-only/gestao-pacotes/",
  },
  {
    moduleKey: "desvios_pnr",
    tableName: "desvios_pnr_records",
    fileType: "DESVIOS_PNR",
    fileIdColumn: "file_id",
    storagePrefix: "processed-only/gestao-desvios/pnrs/",
  },
  {
    moduleKey: "pacotes_faltantes",
    tableName: "gestao_desvios_pacotes_faltantes",
    fileType: "PACOTES_FALTANTES",
    fileIdColumn: "source_file_id",
    storagePrefix: "processed-only/gestao-desvios/pacotes-faltantes/",
  },
];

export const LEGACY_MODULE_KEY_MAP = {
  "pre-fatura": "pre_fatura",
  "gestao-pacotes": "gestao_pacotes",
  "gestao-desvios-pnr": "desvios_pnr",
  "desvios-pnr": "desvios_pnr",
  "pacotes-faltantes": "pacotes_faltantes",
};

export function getArgs() {
  return new Set(process.argv.slice(2));
}

export function createSql() {
  const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Configure SUPABASE_DB_URL ou DATABASE_URL.");
    process.exit(1);
  }
  return postgres(databaseUrl, {
    max: 1,
    ssl: "require",
  });
}

export async function collect(label, fn) {
  const startedAt = performance.now();
  try {
    const rows = await fn();
    return {
      label,
      ms: Math.round(performance.now() - startedAt),
      rows,
    };
  } catch (error) {
    return {
      label,
      ms: Math.round(performance.now() - startedAt),
      error: error.message,
      code: error.code,
      detail: error.detail,
    };
  }
}

export function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

export async function writeAuditReport(name, report) {
  const reportDir = path.resolve("scripts", "logs");
  await mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `${name}-${stamp}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, jsonReplacer, 2)}\n`, "utf8");
  return reportPath;
}

export function bytesToHuman(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function printSection(title) {
  console.log(`\n== ${title} ==`);
}
