import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const fixturePath = process.argv[2] || path.resolve("scripts/fixtures/pacotes-faltantes-validacao.csv");
const shouldCleanup = !process.argv.includes("--keep");

if (!databaseUrl) {
  console.error("[Pacotes Faltantes Validation] Configure SUPABASE_DB_URL ou DATABASE_URL.");
  process.exit(1);
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeDriverName(value = "") {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.length <= 2 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseCsvLine(line = "") {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseDate(value = "") {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return text || new Date().toISOString().slice(0, 10);
}

function dedupeKey(record) {
  return [
    "pacotes_faltantes",
    normalizeText(record.data_fechamento),
    normalizeText(record.base),
    normalizeText(record.driver_nome),
    normalizeText(record.id_envio),
    normalizeText(record.caso),
  ].join("|");
}

const csv = await readFile(fixturePath, "utf8");
const lines = csv.split(/\r?\n/).filter((line) => line.trim());
const headers = parseCsvLine(lines[0]).map(normalizeText);
const indexOf = (...names) => names.map(normalizeText).map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
const indexes = {
  data: indexOf("data", "data do caso", "data do fechamento"),
  base: indexOf("base", "estacao", "unidade"),
  driver: indexOf("driver", "motorista", "nome do motorista"),
  id: indexOf("id do pacote envio", "id pacote envio", "id do pacote/envio", "id envio", "pacote", "envio"),
  motivo: indexOf("motivo", "ocorrencia", "descricao", "caso"),
};

const records = [];
let ignored = 0;
for (const line of lines.slice(1)) {
  const row = parseCsvLine(line);
  const motivo = row[indexes.motivo] || "";
  if (!/\bfaltante\b/i.test(normalizeText(motivo))) {
    ignored += 1;
    continue;
  }
  const importedAt = new Date();
  const record = {
    data_fechamento: parseDate(row[indexes.data]),
    base: row[indexes.base] || "",
    tipo_base: "XPT",
    driver_nome: normalizeDriverName(row[indexes.driver] || ""),
    id_envio: String(row[indexes.id] || "").trim(),
    caso: "Pacote faltante",
    motivo_original: motivo || "Faltante",
    status_caso: "Pendente",
    status_contato_meli: "E-mail Enviado",
    prazo_tratativa: new Date(importedAt.getTime() + 48 * 60 * 60 * 1000).toISOString(),
    situacao_prazo: "Dentro do prazo",
    imported_at: importedAt.toISOString(),
    source_file_id: null,
    file_name: path.basename(fixturePath),
    module_key: "pacotes_faltantes",
    raw_data: {},
  };
  record.dedupe_key = dedupeKey(record);
  records.push(record);
}

const fileHash = createHash("sha256").update(csv).digest("hex");
const sql = postgres(databaseUrl, { max: 1, ssl: "require" });
let processedId = null;

try {
  await sql.begin(async (tx) => {
    const [dashboardFile] = await tx`
      insert into public.dashboard_files (file_name, storage_path, file_type, file_size, status, is_active, metadata)
      values (${path.basename(fixturePath)}, ${`processed-only/pacotes_faltantes/${fileHash}.csv`}, 'PACOTES_FALTANTES', ${Buffer.byteLength(csv)}, 'processed', true, ${tx.json({
        module_key: "pacotes_faltantes",
        dashboard_module_key: "pacotes_faltantes",
        file_category: "PACOTES_FALTANTES",
        file_hash: fileHash,
        validation_fixture: true,
      })})
      returning id
    `;
    const [processedFile] = await tx`
      insert into public.processed_dashboard_files (module_key, file_name, file_hash, file_size, row_count, status, processed_at, raw_file_deleted, metadata)
      values ('pacotes_faltantes', ${path.basename(fixturePath)}, ${fileHash}, ${Buffer.byteLength(csv)}, ${records.length}, 'processed', now(), true, ${tx.json({
        module_key: "pacotes_faltantes",
        dashboard_file_id: dashboardFile.id,
        validation_fixture: true,
        ignored_non_missing: ignored,
      })})
      on conflict (module_key, file_hash) do update set
        row_count = excluded.row_count,
        status = 'processed',
        processed_at = now(),
        raw_file_deleted = true,
        metadata = excluded.metadata
      returning id
    `;
    processedId = processedFile.id;
    for (const record of records) {
      record.source_file_id = processedId;
    }
    await tx`delete from public.gestao_desvios_pacotes_faltantes where source_file_id = ${processedId}`;
    for (const record of records) {
      await tx`
        insert into public.gestao_desvios_pacotes_faltantes ${tx(record)}
        on conflict (dedupe_key) do nothing
      `;
    }
  });

  const rows = await sql`
    select id, data_fechamento, base, driver_nome, id_envio, status_caso, status_contato_meli, prazo_tratativa, situacao_prazo
    from public.gestao_desvios_pacotes_faltantes
    where source_file_id = ${processedId}
    order by id_envio
  `;

  const [statusUpdate] = await sql`
    update public.gestao_desvios_pacotes_faltantes
       set status_caso = 'Em rota',
           status_contato_meli = 'Aguardando MELI',
           updated_at = now(),
           status_updated_at = now(),
           contato_updated_at = now()
     where source_file_id = ${processedId}
     returning status_caso, status_contato_meli
  `;

  const summary = {
    fixture: fixturePath,
    linesRead: lines.length - 1,
    missingExtracted: records.length,
    ignoredNonMissing: ignored,
    persistedRows: rows.length,
    statusEditPersisted: statusUpdate?.status_caso === "Em rota" && statusUpdate?.status_contato_meli === "Aguardando MELI",
    importedIds: rows.map((row) => row.id_envio),
    cleanup: shouldCleanup ? "enabled" : "disabled",
  };
  console.log(JSON.stringify(summary, null, 2));

  if (rows.length !== 5) throw new Error(`Esperava 5 registros persistidos, recebeu ${rows.length}.`);
  if (!summary.statusEditPersisted) throw new Error("Edição de status/contato não persistiu.");
} finally {
  if (shouldCleanup && processedId) {
    await sql`delete from public.gestao_desvios_pacotes_faltantes where source_file_id = ${processedId}`;
    await sql`delete from public.processed_dashboard_files where id = ${processedId}`;
    await sql`
      delete from public.dashboard_files
      where metadata->>'file_hash' = ${fileHash}
        and file_type = 'PACOTES_FALTANTES'
        and metadata->>'validation_fixture' = 'true'
    `;
  }
  await sql.end();
}
