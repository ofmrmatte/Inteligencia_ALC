import { NextResponse } from "next/server";
import { assertDriverManagementTab, driverManagementBaseScope, accessErrorStatus } from "@/lib/access-control-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertBaseAccess, jsonError, requirePortalProfile, textValue } from "@/lib/driver-portal-server";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

export async function POST(request: Request) {
  try {
    const profile = await requirePortalProfile();
    assertDriverManagementTab(profile, "payments");
    const allowedBases = await driverManagementBaseScope(profile);
    const body = (await request.json()) as DbRow;
    const documentIds = Array.isArray(body.documentIds) ? body.documentIds.map(textValue).filter(Boolean) : [];
    const batchId = textValue(body.batchId);
    if (!documentIds.length && !batchId) throw new Error("Informe documentos ou lote para publicação.");

    const admin = createAdminClient();
    let query = admin
      .from("driver_payment_documents")
      .select("*,driver_payment_document_versions:driver_payment_document_versions!driver_payment_document_versions_document_id_fkey(*)")
      .eq("status", "draft")
      .not("driver_id", "is", null);
    if (documentIds.length) query = query.in("id", documentIds);
    if (batchId) query = query.eq("batch_id", batchId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const docs = (data ?? []) as DbRow[];
    if (!docs.length) throw new Error("Nenhum documento identificado em conferência encontrado para publicação.");

    for (const doc of docs) {
      const baseKey = textValue(doc.base_key);
      assertBaseAccess(baseKey, allowedBases);
      const versions = (doc.driver_payment_document_versions as DbRow[] | null) ?? [];
      const version = versions.find((item) => textValue(item.status) === "draft") ?? versions[0];
      if (!version) throw new Error(`${textValue(doc.title)}: versão do PDF não encontrada.`);
      const now = new Date().toISOString();
      const versionUpdate = await admin.from("driver_payment_document_versions").update({ status: "active", published_at: now, published_by: profile.id }).eq("id", textValue(version.id));
      if (versionUpdate.error) throw new Error(versionUpdate.error.message);
      const documentUpdate = await admin.from("driver_payment_documents").update({ status: "published", active_version_id: textValue(version.id), published_at: now }).eq("id", textValue(doc.id));
      if (documentUpdate.error) throw new Error(documentUpdate.error.message);
      if (doc.driver_id) {
        const notification = await admin.from("driver_notifications").insert({
          driver_id: textValue(doc.driver_id),
          title: "Novo PDF de pagamento",
          body: `${textValue(doc.title)} publicado para conferência.`,
          entity_table: "driver_payment_documents",
          entity_id: textValue(doc.id),
        });
        if (notification.error) throw new Error(notification.error.message);
      }
      await admin.from("driver_portal_audit_events").insert({ actor_profile_id: profile.id, action: "payment_document_published", entity_table: "driver_payment_documents", entity_id: textValue(doc.id), after_data: { versionId: textValue(version.id) } });
    }

    const affectedBatches = [...new Set(docs.map((doc) => textValue(doc.batch_id)).filter(Boolean))];
    for (const id of affectedBatches) {
      const { count: pendingCount, error: pendingError } = await admin
        .from("driver_payment_documents")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", id)
        .in("status", ["draft", "unidentified", "error"]);
      if (pendingError) throw new Error(pendingError.message);
      await admin.from("driver_payment_batches").update({
        status: (pendingCount ?? 0) === 0 ? "published" : "review",
        published_at: (pendingCount ?? 0) === 0 ? new Date().toISOString() : null,
      }).eq("id", id);
    }

    return NextResponse.json({ ok: true, published: docs.length });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao publicar documentos.", accessErrorStatus(error, 400));
  }
}
