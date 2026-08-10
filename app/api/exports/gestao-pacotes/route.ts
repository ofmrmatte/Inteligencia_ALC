import { buildXlsxResponse } from "@/lib/export/xlsx";
import { requireAuthenticated } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseGestaoPacotesFilters } from "@/features/gestao-pacotes/data/queries";
import type { GestaoPacotesFilters, GestaoPacotesRecord } from "@/features/gestao-pacotes/domain";

const MAX_EXPORT_ROWS = 100000;

function applyFilters<T extends { eq: (column: string, value: string) => T; or: (query: string) => T }>(
  query: T,
  filters: GestaoPacotesFilters,
) {
  let next = query;
  if (filters.competencia) next = next.eq("competencia", filters.competencia);
  if (filters.quinzena) next = next.eq("quinzena", filters.quinzena);
  if (filters.tipo) next = next.eq("tipo", filters.tipo);
  if (filters.desconto) next = next.eq("desconto", filters.desconto);
  if (filters.base) next = next.eq("codigo_base", filters.base);
  if (filters.q) {
    const safe = filters.q.replace(/[%*,]/g, " ");
    next = next.or([
      `base.ilike.%${safe}%`,
      `codigo_base.ilike.%${safe}%`,
      `driver.ilike.%${safe}%`,
      `id_envio.ilike.%${safe}%`,
      `rota.ilike.%${safe}%`,
      `decisao_adm.ilike.%${safe}%`,
      `observacao.ilike.%${safe}%`,
    ].join(","));
  }
  return next;
}

export async function GET(request: Request) {
  const { response } = await requireAuthenticated();
  if (response) return response;

  const filters = parseGestaoPacotesFilters(Object.fromEntries(new URL(request.url).searchParams));
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("gestao_pacotes_records")
    .select("id,competencia,quinzena,tipo,desconto,base,codigo_base,driver,data,id_envio,rota,valor,decisao_adm,observacao,aba_origem,file_id,created_at")
    .eq("module_key", "gestao_pacotes")
    .limit(MAX_EXPORT_ROWS);
  query = applyFilters(query, filters);

  const { data, error } = await query.order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  return buildXlsxResponse<GestaoPacotesRecord>({
    fileName: "alc-gestao-pacotes.xlsx",
    sheetName: "Gestao de Pacotes",
    rows: (data ?? []) as GestaoPacotesRecord[],
    columns: [
      { header: "Competencia", key: "competencia", width: 14 },
      { header: "Quinzena", key: "quinzena", width: 16 },
      { header: "Tipo", key: "tipo", width: 18 },
      { header: "Desconto", key: "desconto", width: 18 },
      { header: "Base", key: "base", width: 26 },
      { header: "Codigo base", key: "codigo_base", width: 14 },
      { header: "Driver", key: "driver", width: 32 },
      { header: "Data", key: "data", width: 14 },
      { header: "ID envio", key: "id_envio", width: 20 },
      { header: "Rota", key: "rota", width: 18 },
      { header: "Valor", key: "valor", width: 14 },
      { header: "Decisao ADM", key: "decisao_adm", width: 34 },
      { header: "Observacao", key: "observacao", width: 34 },
      { header: "Aba origem", key: "aba_origem", width: 18 },
    ],
  });
}
