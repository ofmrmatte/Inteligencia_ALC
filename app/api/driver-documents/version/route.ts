import { NextResponse } from "next/server";
import { pdfLooksValid, safeStorageName, sha256Bytes } from "@/lib/driver-portal";
import { adminBaseScope, assertBaseAccess, jsonError, requirePortalProfile, textValue } from "@/lib/driver-portal-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const profile = await requirePortalProfile();
    const form = await request.formData();
    const documentId = textValue(form.get("documentId"));
    const disputeId = textValue(form.get("disputeId"));
    const notes = textValue(form.get("notes"));
    const file = form.get("file");
    if (!documentId || !(file instanceof File)) throw new Error("Informe documento e PDF corrigido.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!file.name.toLowerCase().endsWith(".pdf") || !pdfLooksValid(bytes)) throw new Error("Arquivo PDF inválido.");

    const admin = createAdminClient();
    const doc = await admin.from("driver_payment_documents").select("*,driver_payment_document_versions(*)").eq("id", documentId).single();
    if (doc.error) throw new Error(doc.error.message);
    const allowedBases = await adminBaseScope(profile);
    assertBaseAccess(textValue(doc.data.base_key), allowedBases);
    const versions = Array.isArray(doc.data.driver_payment_document_versions) ? doc.data.driver_payment_document_versions : [];
    const nextVersion = Math.max(0, ...versions.map((version: Record<string, unknown>) => Number(version.version_number) || 0)) + 1;
    const storagePath = `payment-documents/${documentId}/v${nextVersion}-${safeStorageName(file.name)}`;
    const upload = await admin.storage.from("driver-payments").upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (upload.error) throw new Error(upload.error.message);

    if (doc.data.active_version_id) await admin.from("driver_payment_document_versions").update({ status: "superseded" }).eq("id", doc.data.active_version_id);
    const version = await admin.from("driver_payment_document_versions").insert({
      document_id: documentId,
      version_number: nextVersion,
      storage_path: storagePath,
      file_hash: await sha256Bytes(bytes),
      file_size: file.size,
      original_name: file.name,
      published_by: profile.id,
      status: "active",
      notes,
      published_at: new Date().toISOString(),
    }).select().single();
    if (version.error) throw new Error(version.error.message);
    const updateDoc = await admin.from("driver_payment_documents").update({ active_version_id: version.data.id, status: "published", published_at: new Date().toISOString() }).eq("id", documentId);
    if (updateDoc.error) throw new Error(updateDoc.error.message);
    if (disputeId) {
      await admin.from("driver_disputes").update({ status: "concluida", decision: notes || "Nova versão corrigida publicada.", decided_by: profile.id, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", disputeId);
    }
    if (doc.data.driver_id) {
      await admin.from("driver_notifications").insert({
        driver_id: textValue(doc.data.driver_id),
        title: "PDF corrigido publicado",
        body: `${textValue(doc.data.title)} recebeu uma nova versão.`,
        entity_table: "driver_payment_documents",
        entity_id: documentId,
      });
    }
    await admin.from("driver_portal_audit_events").insert({ actor_profile_id: profile.id, action: "payment_document_version_published", entity_table: "driver_payment_document_versions", entity_id: version.data.id, after_data: version.data });
    return NextResponse.json({ version: version.data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao publicar nova versão.", 400);
  }
}
