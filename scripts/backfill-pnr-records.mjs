import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("../assets/vendor/xlsx.full.min.js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kvgddwmdamnkygyarafy.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_pZtgtlrQgL13gP-cEVKzDA_hJuYBfqk";
const EMAIL = process.env.SUPABASE_TEST_EMAIL || process.env.TEST_EMAIL;
const PASSWORD = process.env.SUPABASE_TEST_PASSWORD || process.env.TEST_PASSWORD;
const BATCH_SIZE = Number(process.env.PNR_BACKFILL_BATCH_SIZE || 500);

const MONTHS = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

if (!EMAIL || !PASSWORD) {
  console.error("Configure SUPABASE_TEST_EMAIL e SUPABASE_TEST_PASSWORD para executar o backfill.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

function formatId(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return String(value).replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\.0+$/, "").trim();
}

function parseMoney(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return Number(value.toFixed(2));
  let raw = String(value).replace(/[^\d,.-]/g, "").trim();
  if (!raw) return 0;
  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.lastIndexOf(".") > raw.lastIndexOf(",")
      ? raw.replace(/,/g, "")
      : raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(",")) {
    raw = raw.replace(",", ".");
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
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

function normalizeStatus(value) {
  const text = String(value || "").trim();
  const normalized = normalizeText(text);
  if (!normalized) return "";
  if (normalized.includes("ANULADO")) return "Anulado";
  if (normalized.includes("ENVIADO") && normalized.includes("FATURAMENTO")) return "Enviado para faturamento";
  if (normalized.includes("FATURADO")) return "Faturado";
  if (normalized.includes("ANALISE") || normalized.includes("ANALISA")) return "Em análise";
  if (normalized.includes("ABERTO")) return "Aberto";
  return text.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function baseCode(value) {
  const text = normalizeText(value);
  const match = text.match(/\b[A-Z]{2,4}\d{1,3}\b/);
  return match ? match[0] : text;
}

function baseType(value) {
  const code = baseCode(value);
  if (code.startsWith("S")) return "SVC";
  if (code.startsWith("E")) return "XPT";
  return "Não identificada";
}

function periodFromBilling(value, fallbackDate) {
  const compact = normalizeText(value).replace(/\s+/g, "");
  const match = compact.match(/(20\d{2})(0[1-9]|1[0-2])Q([12])/);
  if (match) {
    const year = match[1];
    const month = match[2];
    const quarter = match[3];
    const monthIndex = Number(month) - 1;
    return {
      ano: year,
      mes: month,
      competencia: `${MONTH_ABBR[monthIndex]}/${String(year).slice(2)}`,
      quinzena: quarter === "2" ? "2ª Quinzena" : "1ª Quinzena",
      quinzenaRef: `${quarter === "2" ? "16 a 31" : "01 a 15"} ${MONTHS[monthIndex]}`,
      periodoLabel: `${quarter === "2" ? "2ª Quinzena" : "1ª Quinzena"} · ${MONTHS[monthIndex]}/${year}`,
    };
  }
  const dateIso = parseDate(fallbackDate);
  const date = dateIso ? new Date(`${dateIso}T00:00:00Z`) : new Date();
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const quarter = date.getUTCDate() > 15 ? "2" : "1";
  const monthIndex = Number(month) - 1;
  return {
    ano: year,
    mes: month,
    competencia: `${MONTH_ABBR[monthIndex]}/${String(year).slice(2)}`,
    quinzena: quarter === "2" ? "2ª Quinzena" : "1ª Quinzena",
    quinzenaRef: `${quarter === "2" ? "16 a 31" : "01 a 15"} ${MONTHS[monthIndex]}`,
    periodoLabel: `${quarter === "2" ? "2ª Quinzena" : "1ª Quinzena"} · ${MONTHS[monthIndex]}/${year}`,
  };
}

function dedupeKey(row) {
  const idCaso = formatId(row.idCaso);
  const idEnvio = formatId(row.idEnvio);
  const idReclamacao = formatId(row.idReclamacao);
  const periodo = formatId(row.periodoFaturamentoOriginal || row.periodoFaturamento);
  if (!idCaso) return "";
  if (idEnvio && idReclamacao && periodo) return `${idCaso}|${idEnvio}|${idReclamacao}|${periodo}`;
  if (idEnvio && periodo) return `${idCaso}|${idEnvio}|${periodo}`;
  if (periodo) return `${idCaso}|${periodo}`;
  if (idEnvio && idReclamacao) return `${idCaso}|${idEnvio}|${idReclamacao}`;
  if (idEnvio) return `${idCaso}|${idEnvio}`;
  return idCaso;
}

function cell(row, headerIndex, aliases) {
  for (const alias of aliases) {
    const index = headerIndex.get(normalizeHeader(alias));
    if (index != null) return row[index] ?? "";
  }
  return "";
}

function buildRecords(fileRecord, workbook) {
  const records = [];
  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "" });
    if (!matrix.length) continue;
    const headers = matrix[0].map(normalizeHeader);
    const headerIndex = new Map(headers.map((header, index) => [header, index]));
    if (!headerIndex.has("ID DO CASO") || !headerIndex.has("ID DE ENVIO")) continue;
    for (const row of matrix.slice(1)) {
      const idCaso = formatId(cell(row, headerIndex, ["ID DO CASO"]));
      if (!idCaso) continue;
      const periodoOriginal = String(cell(row, headerIndex, ["PERÍODO DE FATURAMENTO", "PERIODO DE FATURAMENTO"]) || "").trim();
      const dataCaso = parseDate(cell(row, headerIndex, ["DATA DO CASO"]));
      const period = periodFromBilling(periodoOriginal, dataCaso);
      const estacaoOrigem = formatId(cell(row, headerIndex, ["ESTAÇÃO DE ORIGEM", "ESTACAO DE ORIGEM"]));
      const baseIdentificada = baseCode(estacaoOrigem);
      const tipoBase = baseType(baseIdentificada);
      const idMotorista = formatId(cell(row, headerIndex, ["ID DO MOTORISTA", "ID MOTORISTA"]));
      const idRota = formatId(cell(row, headerIndex, ["ID DA ROTA", "ID ROTA"]));
      const idEnvio = formatId(cell(row, headerIndex, ["ID DE ENVIO", "ID ENVIO"]));
      const idReclamacao = formatId(cell(row, headerIndex, ["ID DA RECLAMAÇÃO", "ID DA RECLAMACAO", "ID RECLAMAÇÃO", "ID RECLAMACAO"]));
      const valorCompra = parseMoney(cell(row, headerIndex, ["VAl. COMPRA", "VAL. COMPRA", "VALOR DA COMPRA"]));
      const statusOriginal = String(cell(row, headerIndex, ["STATUS"]) || "").trim();
      const raw = {
        idCaso,
        dataCaso,
        statusOriginal,
        statusNormalizado: normalizeStatus(statusOriginal),
        periodoFaturamento: periodoOriginal,
        periodoFaturamentoOriginal: periodoOriginal,
        sourcePeriodo: periodoOriginal,
        sourceFileName: fileRecord.file_name,
        dataPedidoRevisao: parseDate(cell(row, headerIndex, ["DATA DO PEDIDO DE REVISÃO", "DATA DO PEDIDO DE REVISAO"])),
        pedidoRevisao: String(cell(row, headerIndex, ["PEDIDO DE REVISÃO", "PEDIDO DE REVISAO"]) || "").trim(),
        dataEncerramentoCaso: parseDate(cell(row, headerIndex, ["DATA DE ENCERRAMENTO DO CASO"])),
        repAssistente: String(cell(row, headerIndex, ["REP - ASSISTENTE", "REP ASSISTENTE"]) || "").trim(),
        comentarioEncerramento: String(cell(row, headerIndex, ["COMENTARIO DE ENCERRAMENTO", "COMENTÁRIO DE ENCERRAMENTO"]) || "").trim(),
        numeroPreFatura: formatId(cell(row, headerIndex, ["N° DA PRÉ-FATURA", "Nº DA PRÉ-FATURA", "N DA PRE FATURA"])),
        idEnvio,
        produtos: String(cell(row, headerIndex, ["PRODUTOS"]) || "").trim(),
        valorCompraNumerico: valorCompra,
        repTransportadora: String(cell(row, headerIndex, ["REP TRANSPORTADORA"]) || "").trim(),
        idTransportadora: formatId(cell(row, headerIndex, ["ID DA TRANSPORTADORA"])),
        transportadora: String(cell(row, headerIndex, ["TRANSPORTADORA"]) || "").trim(),
        estacaoOrigem,
        tipoOcorrencia: "PNR",
        tipoBase,
        tipoOperacional: tipoBase,
        baseIdentificada,
        nomeBaseOperacao: estacaoOrigem,
        idRota,
        idMotorista,
        nomeMotorista: "",
        motoristaDisplay: idMotorista ? `ID ${idMotorista}` : "",
        statusMotorista: idMotorista ? "Driver possivelmente desligado" : "ID não informado",
        fonteCruzamento: baseIdentificada ? "Gestão de Desvios" : "Não identificado",
        observacaoCruzamento: baseIdentificada ? "Identificado pela estação de origem do arquivo PNR" : "ID do motorista não informado",
        motoristaMatchSource: baseIdentificada ? "Gestão de Desvios" : "Não identificado",
        dataEntrega: parseDate(cell(row, headerIndex, ["DATA DE ENTREGA"])),
        idReclamacao,
        dataReclamacao: parseDate(cell(row, headerIndex, ["DATA DA RECLAMAÇÃO", "DATA DA RECLAMACAO"])),
        mes: period.mes,
        ano: period.ano,
        competencia: period.competencia,
        quinzena: period.quinzena,
        quinzenaRef: period.quinzenaRef,
        periodoLabel: period.periodoLabel,
        file_category: "DESVIOS_PNR",
        tipo_registro: "DESVIOS_PNR",
        arquivo_origem: fileRecord.file_name,
      };
      const key = dedupeKey(raw);
      if (!key) continue;
      records.push({
        file_id: fileRecord.id,
        dedupe_key: key,
        competencia: raw.competencia,
        quinzena: raw.quinzena,
        tipo: String(cell(row, headerIndex, ["TIPO"]) || "").trim(),
        status_original: raw.statusOriginal,
        status_normalizado: raw.statusNormalizado,
        periodo_faturamento: raw.periodoFaturamento,
        periodo_faturamento_original: raw.periodoFaturamentoOriginal,
        mes: raw.mes,
        ano: raw.ano,
        quinzena_ref: raw.quinzenaRef,
        periodo_label: raw.periodoLabel,
        source_file_name: raw.sourceFileName,
        source_periodo: raw.sourcePeriodo,
        data_pedido_revisao: raw.dataPedidoRevisao,
        pedido_revisao: raw.pedidoRevisao,
        data_encerramento_caso: raw.dataEncerramentoCaso,
        rep_assistente: raw.repAssistente,
        comentario_encerramento: raw.comentarioEncerramento,
        numero_pre_fatura: raw.numeroPreFatura,
        id_envio: raw.idEnvio,
        produtos: raw.produtos,
        valor_compra: raw.valorCompraNumerico,
        rep_transportadora: raw.repTransportadora,
        id_transportadora: raw.idTransportadora,
        transportadora: raw.transportadora,
        estacao_origem: raw.estacaoOrigem,
        tipo_ocorrencia: "PNR",
        tipo_base: raw.tipoBase,
        base_identificada: raw.baseIdentificada,
        nome_base_operacao: raw.nomeBaseOperacao,
        tipo_operacional: raw.tipoOperacional,
        id_rota: raw.idRota,
        id_motorista: raw.idMotorista,
        nome_motorista: raw.nomeMotorista,
        motorista_display: raw.motoristaDisplay,
        status_motorista: raw.statusMotorista,
        fonte_cruzamento: raw.fonteCruzamento,
        observacao_cruzamento: raw.observacaoCruzamento,
        motorista_match_source: raw.motoristaMatchSource,
        data_caso: raw.dataCaso,
        data_entrega: raw.dataEntrega,
        id_reclamacao: raw.idReclamacao,
        data_reclamacao: raw.dataReclamacao,
        raw_data: raw,
      });
    }
  }
  return records;
}

function isPnrFile(record) {
  const metadata = record?.metadata || {};
  const type = normalizeText(record?.file_type || metadata.file_category || metadata.semantic_file_type || metadata.file_type);
  const name = normalizeText(metadata.original_name || record?.file_name);
  return type === "DESVIOS_PNR" || name.includes("PNR");
}

async function main() {
  const { error: authError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authError) throw authError;

  const { data: files, error: filesError } = await supabase
    .from("dashboard_files")
    .select("*")
    .order("created_at", { ascending: false });
  if (filesError) throw filesError;

  const pnrFiles = (files || []).filter(isPnrFile).filter((file) => file.status !== "missing_storage");
  console.log(`[PNR Backfill] arquivos PNR encontrados: ${pnrFiles.length}`);

  for (const file of pnrFiles) {
    const { count, error: countError } = await supabase
      .from("desvios_pnr_records")
      .select("id", { count: "exact", head: true })
      .eq("file_id", file.id);
    if (countError) throw countError;
    if (count > 0 && process.env.PNR_BACKFILL_FORCE !== "1") {
      console.log(`[PNR Backfill] pulando ${file.file_name}: ${count} registros já persistidos`);
      continue;
    }

    console.log(`[PNR Backfill] baixando ${file.file_name}`);
    const { data: blob, error: downloadError } = await supabase.storage.from("dashboard-files").download(file.storage_path);
    if (downloadError) throw downloadError;
    const workbook = XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: "buffer", cellDates: true });
    const records = buildRecords(file, workbook);
    console.log(`[PNR Backfill] ${file.file_name}: ${records.length} registros normalizados`);
    if (!records.length) continue;

    const { error: deleteError } = await supabase.from("desvios_pnr_records").delete().eq("file_id", file.id);
    if (deleteError) throw deleteError;
    for (let index = 0; index < records.length; index += BATCH_SIZE) {
      const batch = records.slice(index, index + BATCH_SIZE);
      const { error: insertError } = await supabase.from("desvios_pnr_records").insert(batch);
      if (insertError) throw insertError;
      console.log(`[PNR Backfill] inseridos ${Math.min(index + BATCH_SIZE, records.length)} de ${records.length}`);
    }

    const metadata = {
      ...(file.metadata || {}),
      file_category: "DESVIOS_PNR",
      semantic_file_type: "DESVIOS_PNR",
      processed_at: new Date().toISOString(),
      processed_source: "pnr_backfill",
      record_count: records.length,
      parsed_rows: records.length,
    };
    await supabase
      .from("dashboard_files")
      .update({ status: "processed", metadata, updated_at: new Date().toISOString() })
      .eq("id", file.id);
    if (metadata.file_hash) {
      await supabase.from("processed_dashboard_files").upsert({
        module_key: "gestao-desvios-pnr",
        file_name: file.file_name,
        file_hash: metadata.file_hash,
        file_size: file.file_size || metadata.size_bytes || null,
        last_modified: metadata.last_modified_local || file.updated_at || "",
        competencia: metadata.competencia || "",
        row_count: records.length,
        status: "processed",
        processed_at: new Date().toISOString(),
        metadata,
      }, { onConflict: "module_key,file_hash" });
    }
    const { data: metricGroups, error: metricsError } = await supabase
      .rpc("refresh_desvios_pnr_metrics_summary", { p_file_ids: [file.id] });
    if (metricsError) throw metricsError;
    console.log(`[PNR Backfill] agregados atualizados: ${metricGroups || 0} grupos`);
  }
}

main().catch((error) => {
  console.error("[PNR Backfill] falha", error);
  process.exit(1);
});
