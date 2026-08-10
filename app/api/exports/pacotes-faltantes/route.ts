import { buildXlsxResponse } from "@/lib/export/xlsx";
import { apiError } from "@/lib/server/api-response";
import { requireAuthenticated } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseMissingPackageFilters } from "@/features/pacotes-faltantes/data/queries";
import type { MissingPackageFilters, MissingPackageRecord } from "@/features/pacotes-faltantes/domain";

const MAX_EXPORT_ROWS = 100000;

function applyFilters<T extends { eq: (column: string, value: string) => T; or: (query: string) => T }>(
  query: T,
  filters: MissingPackageFilters,
) {
  let next = query;
  if (filters.base) next = next.eq("base", filters.base);
  if (filters.statusCaso) next = next.eq("status_caso", filters.statusCaso);
  if (filters.statusContato) next = next.eq("status_contato_meli", filters.statusContato);
  if (filters.prazo) next = next.eq("situacao_prazo", filters.prazo);
  if (filters.q) {
    const safe = filters.q.replace(/[%*,]/g, " ");
    next = next.or([
      `base.ilike.%${safe}%`,
      `tipo_base.ilike.%${safe}%`,
      `driver_nome.ilike.%${safe}%`,
      `id_envio.ilike.%${safe}%`,
      `caso.ilike.%${safe}%`,
      `motivo_original.ilike.%${safe}%`,
      `file_name.ilike.%${safe}%`,
    ].join(","));
  }
  return next;
}

export async function GET(request: Request) {
  const { response } = await requireAuthenticated();
  if (response) return response;

  const filters = parseMissingPackageFilters(Object.fromEntries(new URL(request.url).searchParams));
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("gestao_desvios_pacotes_faltantes")
    .select("id,data_fechamento,base,tipo_base,driver_nome,id_envio,caso,motivo_original,status_caso,status_contato_meli,prazo_tratativa,situacao_prazo,imported_at,imported_by,file_name")
    .limit(MAX_EXPORT_ROWS);
  query = applyFilters(query, filters);

  const { data, error } = await query.order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false });
  if (error) return apiError("Não foi possível exportar Pacotes Faltantes agora.", 400);

  return buildXlsxResponse<MissingPackageRecord>({
    fileName: "alc-pacotes-faltantes.xlsx",
    sheetName: "Pacotes Faltantes",
    rows: (data ?? []) as MissingPackageRecord[],
    columns: [
      { header: "Data fechamento", key: "data_fechamento", width: 18 },
      { header: "Base", key: "base", width: 18 },
      { header: "Tipo base", key: "tipo_base", width: 14 },
      { header: "Driver", key: "driver_nome", width: 32 },
      { header: "ID envio", key: "id_envio", width: 20 },
      { header: "Caso", key: "caso", width: 20 },
      { header: "Motivo original", key: "motivo_original", width: 24 },
      { header: "Status caso", key: "status_caso", width: 18 },
      { header: "Status MELI", key: "status_contato_meli", width: 20 },
      { header: "Prazo tratativa", key: "prazo_tratativa", width: 22 },
      { header: "Situação prazo", key: "situacao_prazo", width: 22 },
      { header: "Arquivo", key: "file_name", width: 34 },
    ],
  });
}
