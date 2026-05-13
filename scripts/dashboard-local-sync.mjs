import "dotenv/config";
import chokidar from "chokidar";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

const PRE_FATURA_FILE_TYPE = "PRE_FATURA";
const GESTAO_FILE_TYPE = "GESTAO_PACOTES";
const DEFAULT_DEBOUNCE_MS = 4500;
const STABILITY_CHECK_INTERVAL_MS = 1000;
const STABILITY_REQUIRED_CHECKS = 2;
const STABILITY_TIMEOUT_MS = 60000;

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
