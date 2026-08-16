import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminBaseScope, assertBaseAccess, jsonError, requirePortalProfile, textValue } from "@/lib/driver-portal-server";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

export async function POST(request: Request) {
  try {
    const profile = await requirePortalProfile();
    const allowedBases = await adminBaseScope(profile);
    const body = (await request.json()) as DbRow;
    const documentIds = Array.isArray(body.documentIds) ? body.documentIds.map(textValue).filter(Boolean) : [];
    const batchId = textValue(body.batchId);
    if (!documentIds.length && !batchId) throw new Error("Informe documentos ou lote para publicação.");

    const admin = createAdminClient();
    let query = admin
      .from("driver_payment_documents")
      .select("*,driver_payment_document_versions(*)")
      .eq("status", "draft");
    if (documentIds.length) query = query.in("id", documentIds);
    if (batchId) query = query.eq("batch_id", batchId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const docs = (data ?? []) as DbRow[];
    if (!docs.length) throw new Error("Nenhum documento em conferência encontrado para publicação.");

    for (const doc of docs) {
      const baseKey = textValue(doc.base_key);
      assertBaseAccess(baseKey, allowedBases);
      const versions = (doc.driver_payment_document_versions as DbRow[] | null) ?? [];
      const version = versions.find((item) => textValue(item.status) === "draft") ?? versions[0];
      if (!version) throw new Error(`${textValue(doc.title)}: versão do PDF não encontrada.`);
      const now = new Date().toISOString();
      await admin.from("driver_payment_document_versions").update({ status: "active", published_at: now, published_by: profile.id }).eq("id", textValue(version.id));
      await admin.from("driver_payment_documents").update({ status: "published", active_version_id: textValue(version.id), published_at: now }).eq("id", textValue(doc.id));
      if (doc.driver_id) {
        await admin.from("driver_notifications").insert({
          driver_id: textValue(doc.driver_id),
          title: "Novo PDF de pagamento",
          body: `${textValue(doc.title)} publicado para conferência.`,
          entity_table: "driver_payment_documents",
          entity_id: textValue(doc.id),
        });
      }
      await admin.from("driver_portal_audit_events").insert({ actor_profile_id: profile.id, action: "payment_document_published", entity_table: "driver_payment_documents", entity_id: textValue(doc.id), after_data: { versionId: textValue(version.id) } });
    }

    if (batchId) await admin.from("driver_payment_batches").update({ status: "published", published_at: new Date().toISOString() }).eq("id", batchId);
    return NextResponse.json({ ok: true, published: docs.length });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao publicar documentos.", 400);
  }
}
