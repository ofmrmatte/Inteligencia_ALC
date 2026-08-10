import { buildXlsxResponse } from "@/lib/export/xlsx";
import { requireAuthenticated } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parsePnrFilters } from "@/features/desvios-pnr/data/queries";
import type { PnrFilters, PnrRecord } from "@/features/desvios-pnr/domain";

const MAX_EXPORT_ROWS = 100000;

function applyFilters<T extends { eq: (column: string, value: string) => T; or: (query: string) => T }>(
  query: T,
  filters: PnrFilters,
) {
  let next = query;
  if (filters.mes) next = next.eq("month_key", filters.mes);
  if (filters.quinzena) next = next.eq("quinzena_key", filters.quinzena);
  if (filters.status) next = next.eq("status_normalizado", filters.status);
  if (filters.tipo) next = next.eq("tipo_base", filters.tipo);
  if (filters.estacao) next = next.eq("estacao_origem", filters.estacao);
  if (filters.statusMotorista) next = next.eq("status_motorista", filters.statusMotorista);
  if (filters.fonte) next = next.eq("fonte_cruzamento", filters.fonte);
  if (filters.motorista) next = next.eq("motorista_display", filters.motorista);
  if (filters.rota) next = next.eq("id_rota", filters.rota);
  if (filters.q) {
    const safe = filters.q.replace(/[%*,]/g, " ");
    next = next.or([
      `competencia.ilike.%${safe}%`,
      `status_normalizado.ilike.%${safe}%`,
      `tipo_base.ilike.%${safe}%`,
      `tipo_operacional.ilike.%${safe}%`,
      `estacao_origem.ilike.%${safe}%`,
      `status_motorista.ilike.%${safe}%`,
      `fonte_cruzamento.ilike.%${safe}%`,
      `id_envio.ilike.%${safe}%`,
      `id_motorista.ilike.%${safe}%`,
      `id_rota.ilike.%${safe}%`,
      `id_reclamacao.ilike.%${safe}%`,
      `nome_motorista.ilike.%${safe}%`,
      `motorista_display.ilike.%${safe}%`,
    ].join(","));
  }
  return next;
}

function orderColumn(filters: PnrFilters) {
  if (filters.sort === "valorCompraNumerico") return "valor_compra";
  if (filters.sort === "statusNormalizado") return "status_normalizado";
  if (filters.sort === "estacaoOrigem") return "estacao_origem";
  return "month_key";
}

export async function GET(request: Request) {
  const { response } = await requireAuthenticated();
  if (response) return response;

  const filters = parsePnrFilters(Object.fromEntries(new URL(request.url).searchParams));
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("desvios_pnr_records")
    .select("id,file_id,dedupe_key,competencia,quinzena,tipo,status_original,status_normalizado,periodo_faturamento,month_key,quinzena_key,periodo_label,source_file_name,data_encerramento_caso,id_envio,produtos,valor_compra,estacao_origem,tipo_base,tipo_operacional,id_rota,id_motorista,nome_motorista,motorista_display,status_motorista,fonte_cruzamento,data_caso,data_entrega,id_reclamacao")
    .eq("module_key", "desvios_pnr")
    .limit(MAX_EXPORT_ROWS);
  query = applyFilters(query, filters);

  const { data, error } = await query.order(orderColumn(filters), { ascending: filters.dir === "asc", nullsFirst: false });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  return buildXlsxResponse<PnrRecord>({
    fileName: "alc-desvios-pnr.xlsx",
    sheetName: "Desvios PNR",
    rows: (data ?? []) as PnrRecord[],
    columns: [
      { header: "Competencia", key: "competencia", width: 14 },
      { header: "Quinzena", key: "quinzena", width: 16 },
      { header: "Month key", key: "month_key", width: 14 },
      { header: "Status", key: "status_normalizado", width: 24 },
      { header: "Status original", key: "status_original", width: 24 },
      { header: "ID envio", key: "id_envio", width: 20 },
      { header: "Produto", key: "produtos", width: 30 },
      { header: "Valor compra", key: "valor_compra", width: 16 },
      { header: "Estacao", key: "estacao_origem", width: 16 },
      { header: "Tipo base", key: "tipo_base", width: 16 },
      { header: "Tipo operacional", key: "tipo_operacional", width: 20 },
      { header: "Rota", key: "id_rota", width: 18 },
      { header: "ID motorista", key: "id_motorista", width: 18 },
      { header: "Motorista", key: "motorista_display", width: 32 },
      { header: "Status motorista", key: "status_motorista", width: 20 },
      { header: "Fonte cruzamento", key: "fonte_cruzamento", width: 20 },
      { header: "Data caso", key: "data_caso", width: 14 },
      { header: "Data entrega", key: "data_entrega", width: 14 },
      { header: "ID reclamacao", key: "id_reclamacao", width: 22 },
      { header: "Arquivo origem", key: "source_file_name", width: 34 },
    ],
  });
}
