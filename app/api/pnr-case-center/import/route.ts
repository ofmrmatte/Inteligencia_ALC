import { NextResponse } from "next/server";
import { canAccessSection } from "@/lib/access-control";
import { canManageImports } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/auth-server";
import {
  caseCenterImportSchema,
  caseCenterPnrDatabaseRows,
  mergeCaseCenterCase,
} from "@/lib/pnr-case-center-import";
import { parseCaseCenterCompetence } from "@/lib/pnr-case-center";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function errorStatus(message: string) {
  if (message.includes("Sessão")) return 401;
  if (message.includes("permissão")) return 403;
  if (message.includes("SERVICE_ROLE")) return 503;
  return 400;
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) throw new Error("Sessão expirada. Entre novamente.");
    if (!canAccessSection(profile, "gestao-pnr") || !canManageImports(profile)) {
      throw new Error("Seu perfil não possui permissão para importar PNR.");
    }

    const parsed = caseCenterImportSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Payload Case Center inválido.", issues: parsed.error.issues }, 400);
    const payload = parsed.data;
    const competence = parseCaseCenterCompetence(payload.competence);
    if (!competence) return json({ error: "Competência inválida." }, 400);

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { error: batchInsertError } = await admin.from("import_batches").upsert({
      id: payload.syncId,
      imported_by: profile.id,
      name: `Bandeja PNR — ${payload.competence}`,
      module: "case_center_pnr",
      competence: payload.competence,
      fortnight: competence.fortnight,
      month: competence.month,
      fortnights: [competence.fortnight],
      months: [competence.month],
      analysis_excluded: false,
      status: "processando",
      row_count: payload.totalElements,
      valid_count: 0,
      persisted_count: 0,
      ignored_count: 0,
      error_count: payload.errorCount,
      started_at: now,
      metadata: { source: "case_center", sourceCompetence: payload.competence, lastProgressAt: now },
    }, { onConflict: "id", ignoreDuplicates: true });
    if (batchInsertError) throw new Error(`import_batches: ${batchInsertError.message}`);

    const { data: currentBatch, error: batchReadError } = await admin
      .from("import_batches")
      .select("id,imported_by,module,competence,started_at,finished_at,status")
      .eq("id", payload.syncId)
      .single();
    if (batchReadError) throw new Error(`import_batches: ${batchReadError.message}`);
    const batch = currentBatch as DbRow;
    if (text(batch.imported_by) !== profile.id || text(batch.module) !== "case_center_pnr" || text(batch.competence) !== payload.competence) {
      throw new Error("O identificador de sincronização já pertence a outro lote.");
    }
    if (batch.finished_at && !payload.completed) throw new Error("Este lote já foi concluído.");

    const records = caseCenterPnrDatabaseRows(payload);
    const caseIds = records.map((record) => record.case_id);
    const shipmentIds = [...new Set(records.map((record) => record.shipment_id).filter(Boolean))];
    const existingCases = new Map<string, DbRow>();
    const existingSnapshots = new Map<string, string>();
    const legacyShipments = new Set<string>();
    if (caseIds.length) {
      const [{ data: caseData, error: caseReadError }, { data: snapshotData, error: snapshotReadError }, { data: legacyData, error: legacyReadError }] = await Promise.all([
        admin.from("pnr_case_center_cases").select("*").in("case_id", caseIds),
        admin.from("pnr_records").select("case_id,capture_change").eq("batch_id", payload.syncId).in("case_id", caseIds),
        admin.from("pnr_records").select("shipment_id").in("shipment_id", shipmentIds).or("source_system.is.null,source_system.eq.spreadsheet"),
      ]);
      if (caseReadError) throw new Error(`pnr_case_center_cases: ${caseReadError.message}`);
      if (snapshotReadError) throw new Error(`pnr_records: ${snapshotReadError.message}`);
      if (legacyReadError) throw new Error(`pnr_records: ${legacyReadError.message}`);
      for (const row of (caseData ?? []) as DbRow[]) existingCases.set(text(row.case_id), row);
      for (const row of (snapshotData ?? []) as DbRow[]) existingSnapshots.set(text(row.case_id), text(row.capture_change));
      for (const row of (legacyData ?? []) as DbRow[]) legacyShipments.add(text(row.shipment_id));
    }

    const sourceRecords = [...new Map(payload.records.map((record) => [record.caseId, record])).values()];
    const merged = sourceRecords.map((record) => {
      const result = mergeCaseCenterCase(existingCases.get(record.caseId) ?? null, record, {
        batchId: payload.syncId,
        competence: payload.competence,
        capturedAt: now,
      });
      return {
        ...result,
        row: {
          ...result.row,
          raw_snapshot_jsonb: {
            ...result.row.raw_snapshot_jsonb,
            originalSource: legacyShipments.has(record.shipmentId) ? "spreadsheet" : "case_center",
            currentSource: "case_center",
          },
        },
        change: legacyShipments.has(record.shipmentId)
          ? "updated"
          : existingSnapshots.get(record.caseId) || result.change,
      };
    });
    const changes = new Map(merged.map((result) => [result.row.case_id, result.change]));
    const snapshotRows = records.map((record) => ({
      ...record,
      capture_change: changes.get(record.case_id) ?? "unchanged",
      original_payload: {
        ...record.original_payload,
        originalSource: legacyShipments.has(record.shipment_id) ? "spreadsheet" : "case_center",
        currentSource: "case_center",
      },
    }));

    if (snapshotRows.length) {
      const { error: upsertError } = await admin
        .from("pnr_records")
        .upsert(snapshotRows, { onConflict: "batch_id,case_id" });
      if (upsertError) throw new Error(`pnr_records: ${upsertError.message}`);

      const { error: durableUpsertError } = await admin
        .from("pnr_case_center_cases")
        .upsert(merged.map((result) => result.row), { onConflict: "case_id" });
      if (durableUpsertError) throw new Error(`pnr_case_center_cases: ${durableUpsertError.message}`);
    }

    const [allCount, reconciledCount, newCount, updatedCount, unchangedCount] = await Promise.all([
      admin.from("pnr_records").select("id", { count: "exact", head: true }).eq("batch_id", payload.syncId),
      admin.from("pnr_records").select("id", { count: "exact", head: true }).eq("batch_id", payload.syncId).contains("original_payload", { originalSource: "spreadsheet" }),
      admin.from("pnr_records").select("id", { count: "exact", head: true }).eq("batch_id", payload.syncId).eq("capture_change", "new"),
      admin.from("pnr_records").select("id", { count: "exact", head: true }).eq("batch_id", payload.syncId).eq("capture_change", "updated"),
      admin.from("pnr_records").select("id", { count: "exact", head: true }).eq("batch_id", payload.syncId).eq("capture_change", "unchanged"),
    ]);
    const countError = allCount.error || reconciledCount.error || newCount.error || updatedCount.error || unchangedCount.error;
    if (countError) throw new Error(`pnr_records: ${countError.message}`);
    const persisted = allCount.count ?? 0;
    const reconciled = reconciledCount.count ?? 0;
    const created = newCount.count ?? 0;
    const updated = Math.max(0, (updatedCount.count ?? 0) - reconciled);
    const unchanged = unchangedCount.count ?? 0;
    const status = payload.completed ? (payload.errorCount ? "com-alertas" : "concluído") : "processando";
    const issues = payload.errorCount ? [`${payload.errorCount} registro(s) descartado(s) por contrato inválido.`] : [];
    const entry = {
      id: payload.syncId,
      batchId: payload.syncId,
      name: `Bandeja PNR — ${payload.competence}`,
      importedAt: text(batch.started_at) || now,
      fortnight: competence.fortnight,
      month: competence.month,
      fortnights: [competence.fortnight],
      months: [competence.month],
      analysisExcluded: false,
      duplicateOf: null,
      size: 0,
      status,
      kinds: ["pnr"],
      workbookCount: 0,
      rowCount: payload.totalElements,
      issues,
    };

    const { error: batchUpdateError } = await admin.from("import_batches").update({
      status,
      row_count: payload.totalElements,
      valid_count: persisted,
      persisted_count: persisted,
      error_count: payload.errorCount,
      finished_at: payload.completed ? now : null,
      metadata: {
        source: "case_center",
        sourceCompetence: payload.competence,
        page: payload.page,
        totalPages: payload.totalPages,
        totalElements: payload.totalElements,
        processed: payload.processed,
        persisted,
        newCount: created,
        updatedCount: updated,
        unchangedCount: unchanged,
        reconciledCount: reconciled,
        deletedCount: 0,
        errorCount: payload.errorCount,
        lastProgressAt: now,
        entry,
      },
    }).eq("id", payload.syncId);
    if (batchUpdateError) throw new Error(`import_batches: ${batchUpdateError.message}`);

    if (payload.completed) {
      const { error: auditError } = await admin.from("audit_events").insert({
        actor_id: profile.id,
        action: "case_center_pnr_import_completed",
        entity_table: "import_batches",
        entity_id: payload.syncId,
        after_data: {
          competence: payload.competence,
          totalReceived: payload.totalElements,
          totalPersisted: persisted,
          newCount: created,
          updatedCount: updated,
          unchangedCount: unchanged,
          reconciledCount: reconciled,
          deletedCount: 0,
          errorCount: payload.errorCount,
          source: "case_center",
        },
      });
      if (auditError) throw new Error(`audit_events: ${auditError.message}`);
    }

    return json({
      batchId: payload.syncId,
      received: snapshotRows.length,
      processed: payload.processed,
      persisted,
      newCount: created,
      updatedCount: updated,
      unchangedCount: unchanged,
      reconciledCount: reconciled,
      deletedCount: 0,
      errors: payload.errorCount,
      completed: payload.completed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao importar a Bandeja PNR.";
    return json({ error: message }, errorStatus(message));
  }
}
