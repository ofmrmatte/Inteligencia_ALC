import { NextResponse, type NextRequest } from "next/server";
import { recordAuditLog } from "@/lib/server/audit";
import { apiError, isUuid } from "@/lib/server/api-response";
import { requireAdmin } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const payload = await request.json().catch(() => null) as {
    key?: string;
    monthly_goal?: number;
    annual_goal?: number;
  } | null;

  if (payload?.key !== "pnr_goal") {
    return apiError("Configuração inválida.", 400);
  }

  const monthlyGoal = Number(payload.monthly_goal);
  const annualGoal = Number(payload.annual_goal);
  if (!Number.isFinite(monthlyGoal) || monthlyGoal < 0 || !Number.isFinite(annualGoal) || annualGoal < 0) {
    return apiError("Metas precisam ser números positivos.", 400);
  }

  const supabase = await createServerSupabaseClient();
  const value = {
    monthly_goal: monthlyGoal,
    annual_goal: annualGoal,
    currency: "BRL",
    goal_type: "loss_limit",
  };

  const { data, error } = await supabase
    .from("dashboard_settings")
    .upsert({
      key: "pnr_goal",
      value,
      updated_by: session.user.id,
      updated_by_email: session.profile?.email || session.user.email || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" })
    .select("key,value,updated_by_email,updated_at")
    .single();
  if (error) return apiError("Não foi possível atualizar as metas agora.", 400);

  await recordAuditLog({
    userId: session.user.id,
    profile: session.profile,
    action: "update_goal_settings",
    entityType: "dashboard_settings",
    entityId: "pnr_goal",
    details: { value },
  });

  return NextResponse.json({ setting: data });
}

type ProcessedFileDeleteRow = {
  id: string;
  module_key: string | null;
  file_name: string | null;
  storage_path: string | null;
  metadata: Record<string, unknown> | null;
};

function dashboardFileId(row: ProcessedFileDeleteRow) {
  const metadata = row.metadata || {};
  const value = metadata.dashboard_file_id || metadata.file_id;
  return typeof value === "string" && isUuid(value) ? value : null;
}

export async function DELETE(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const payload = await request.json().catch(() => null) as {
    processedFileIds?: unknown[];
  } | null;

  const rawIds = Array.isArray(payload?.processedFileIds) ? payload.processedFileIds : [];
  const ids = [...new Set(rawIds.filter(isUuid) as string[])];

  if (!ids.length || ids.length !== rawIds.length) {
    return apiError("Seleção de arquivos inválida.", 400);
  }
  if (ids.length > 50) {
    return apiError("Exclua no máximo 50 arquivos por operação.", 400);
  }

  const supabase = await createServerSupabaseClient();
  const { data: selectedData, error: selectedError } = await supabase
    .from("processed_dashboard_files")
    .select("id,module_key,file_name,storage_path,metadata")
    .in("id", ids);

  if (selectedError) return apiError("Não foi possível validar os arquivos selecionados.", 400);

  const selected = (selectedData ?? []) as ProcessedFileDeleteRow[];
  if (selected.length !== ids.length) {
    return apiError("Um ou mais arquivos selecionados não foram encontrados.", 404);
  }

  const dashboardIds = new Set<string>();
  const dashboardIdByProcessedId = new Map<string, string>();
  const unresolvedPaths = new Set<string>();

  selected.forEach((row) => {
    const id = dashboardFileId(row);
    if (id) {
      dashboardIds.add(id);
      dashboardIdByProcessedId.set(row.id, id);
      return;
    }
    if (row.storage_path) unresolvedPaths.add(row.storage_path);
  });

  if (unresolvedPaths.size) {
    const { data: matchedDashboardFiles, error: matchError } = await supabase
      .from("dashboard_files")
      .select("id,storage_path")
      .in("storage_path", [...unresolvedPaths]);
    if (matchError) return apiError("Não foi possível relacionar os arquivos selecionados à base.", 400);

    const dashboardIdByStoragePath = new Map<string, string>();
    (matchedDashboardFiles ?? []).forEach((row) => {
      if (isUuid(row.id) && typeof row.storage_path === "string") {
        dashboardIds.add(row.id);
        dashboardIdByStoragePath.set(row.storage_path, row.id);
      }
    });

    selected.forEach((row) => {
      if (!row.storage_path || dashboardIdByProcessedId.has(row.id)) return;
      const dashboardId = dashboardIdByStoragePath.get(row.storage_path);
      if (dashboardId) dashboardIdByProcessedId.set(row.id, dashboardId);
    });
  }

  const hasLegacyMissingPackagesLink = selected.some((row) => row.module_key === "pacotes_faltantes");
  if (!dashboardIds.size && !hasLegacyMissingPackagesLink) {
    return apiError("Os arquivos selecionados não possuem vínculo válido com os registros importados.", 400);
  }

  const byModule = new Map<string, string[]>();
  const processedIdsByModule = new Map<string, string[]>();
  selected.forEach((row) => {
    if (!row.module_key) return;

    const currentProcessedIds = processedIdsByModule.get(row.module_key) || [];
    currentProcessedIds.push(row.id);
    processedIdsByModule.set(row.module_key, currentProcessedIds);

    const id = dashboardIdByProcessedId.get(row.id);
    if (!id) return;
    const currentDashboardIds = byModule.get(row.module_key) || [];
    currentDashboardIds.push(id);
    byModule.set(row.module_key, currentDashboardIds);
  });

  let deletedRows = 0;

  async function deleteRows(table: string, column: string, fileIds: string[]) {
    if (!fileIds.length) return null;
    const { data, error } = await supabase
      .from(table)
      .delete()
      .in(column, fileIds)
      .select("id");
    if (error) return error;
    deletedRows += data?.length || 0;
    return null;
  }

  const preFaturaError = await deleteRows("pre_fatura_records", "file_id", byModule.get("pre_fatura") || []);
  if (preFaturaError) return apiError("Falha ao remover os registros de Pré-Fatura.", 400);

  const gestaoError = await deleteRows("gestao_pacotes_records", "file_id", byModule.get("gestao_pacotes") || []);
  if (gestaoError) return apiError("Falha ao remover os registros de Gestão de Pacotes.", 400);

  const pnrIds = byModule.get("desvios_pnr") || [];
  if (pnrIds.length) {
    const { error: metricsError } = await supabase
      .from("desvios_pnr_metrics_summary")
      .delete()
      .in("file_id", pnrIds);
    if (metricsError) return apiError("Falha ao remover os agregados dos Desvios PNR.", 400);

    const pnrError = await deleteRows("desvios_pnr_records", "file_id", pnrIds);
    if (pnrError) return apiError("Falha ao remover os registros de Desvios PNR.", 400);
  }

  const missingIds = [...new Set([
    ...(byModule.get("pacotes_faltantes") || []),
    ...(processedIdsByModule.get("pacotes_faltantes") || []),
  ])];
  const missingError = await deleteRows("gestao_desvios_pacotes_faltantes", "source_file_id", missingIds);
  if (missingError) return apiError("Falha ao remover os registros de Pacotes Faltantes.", 400);

  const { error: processedError } = await supabase
    .from("processed_dashboard_files")
    .delete()
    .in("id", ids);
  if (processedError) return apiError("Falha ao remover o histórico dos arquivos processados.", 400);

  const dashboardIdList = [...dashboardIds];
  if (dashboardIdList.length) {
    const { error: dashboardError } = await supabase
      .from("dashboard_files")
      .delete()
      .in("id", dashboardIdList);
    if (dashboardError) return apiError("Os registros foram removidos, mas houve falha ao excluir o cadastro dos arquivos.", 400);
  }

  await recordAuditLog({
    userId: session.user.id,
    profile: session.profile,
    action: "delete_processed_files_with_data",
    entityType: "processed_dashboard_files",
    entityId: ids.length === 1 ? ids[0] : undefined,
    details: {
      processed_file_ids: ids,
      dashboard_file_ids: dashboardIdList,
      file_names: selected.map((file) => file.file_name),
      modules: [...new Set(selected.map((file) => file.module_key).filter(Boolean))],
      deleted_rows: deletedRows,
      deleted_files: selected.length,
      storage_note: "Metadados e dados removidos da base; arquivos físicos já marcados como processed-only/raw_file_deleted são tratados pelo fluxo de armazenamento existente.",
    },
  });

  return NextResponse.json({
    deletedFiles: selected.length,
    deletedRows,
    modules: [...new Set(selected.map((file) => file.module_key).filter(Boolean))],
  });
}
