import { buildXlsxResponse } from "@/lib/export/xlsx";
import { apiError } from "@/lib/server/api-response";
import { requireAuthenticated } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parsePreFaturaFilters } from "@/features/pre-fatura/data";
import type { PreFaturaFilters, PreFaturaRecord } from "@/features/pre-fatura/domain";

const MAX_EXPORT_ROWS = 100000;

function applyFilters<T extends { eq: (column: string, value: string) => T; or: (query: string) => T }>(
  query: T,
  filters: PreFaturaFilters,
) {
  let next = query;
  if (filters.competencia) next = next.eq("competencia", filters.competencia);
  if (filters.quinzena) next = next.eq("quinzena", filters.quinzena);
  if (filters.tipo) next = next.eq("tipo", filters.tipo);
  if (filters.base) next = next.eq("codigo_base", filters.base);
  if (filters.q) {
    const safe = filters.q.replace(/[%*,]/g, " ");
    next = next.or(`driver.ilike.%${safe}%,base.ilike.%${safe}%,codigo_base.ilike.%${safe}%,id_envio.ilike.%${safe}%,rota.ilike.%${safe}%,placa.ilike.%${safe}%`);
  }
  return next;
}

export async function GET(request: Request) {
  const { response } = await requireAuthenticated();
  if (response) return response;

  const filters = parsePreFaturaFilters(Object.fromEntries(new URL(request.url).searchParams));
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("pre_fatura_records")
    .select("id,competencia,quinzena,tipo,base,codigo_base,driver,placa,data,id_envio,rota,valor,aba_origem,file_id,created_at")
    .eq("module_key", "pre_fatura")
    .limit(MAX_EXPORT_ROWS);
  query = applyFilters(query, filters);

  const { data, error } = await query.order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false });
  if (error) return apiError("Não foi possível exportar a Pré-Fatura agora.", 400);

  return buildXlsxResponse<PreFaturaRecord>({
    fileName: "alc-pre-fatura.xlsx",
    sheetName: "Pré-Fatura",
    rows: (data ?? []) as PreFaturaRecord[],
    columns: [
      { header: "Competência", key: "competencia", width: 14 },
      { header: "Quinzena", key: "quinzena", width: 16 },
      { header: "Tipo", key: "tipo", width: 18 },
      { header: "Base", key: "base", width: 26 },
      { header: "Código base", key: "codigo_base", width: 14 },
      { header: "Driver", key: "driver", width: 32 },
      { header: "Placa", key: "placa", width: 14 },
      { header: "Data", key: "data", width: 14 },
      { header: "ID envio", key: "id_envio", width: 20 },
      { header: "Rota", key: "rota", width: 18 },
      { header: "Valor", key: "valor", width: 14 },
      { header: "Aba origem", key: "aba_origem", width: 18 },
    ],
  });
}
