import { NextResponse } from "next/server";
import { assertDriverManagementTab, driverManagementBaseScope, accessErrorStatus } from "@/lib/access-control-server";
import { extractArchiveFiles, safeStorageName, sha256Bytes } from "@/lib/driver-portal";
import { assertBaseAccess, jsonError, requirePortalProfile, textValue } from "@/lib/driver-portal-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

function basename(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? path;
}

export async function POST(request: Request) {
  try {
    const profile = await requirePortalProfile();
    assertDriverManagementTab(profile, "payments");
    const allowedBases = await driverManagementBaseScope(profile);
    const body = (await request.json()) as DbRow;
    const documentId = textValue(body.documentId);
    const driverId = textValue(body.driverId);
    if (!documentId || !driverId) throw new Error("Informe documento e motorista.");

    const admin = createAdminClient();
    const { data: document, error: documentError } = await admin
      .from("driver_payment_documents")
      .select("*,driver_payment_document_versions:driver_payment_document_versions!driver_payment_document_versions_document_id_fkey(*)")
      .eq("id", documentId)
      .single();
    if (documentError) throw new Error(documentError.message);
    const doc = document as DbRow;
    if (!["unidentified", "error"].includes(textValue(doc.status))) throw new Error("Este documento não está pendente de identificação.");
    const baseKey = textValue(doc.base_key);
    assertBaseAccess(baseKey, allowedBases);

    const { data: driver, error: driverError } = await admin
      .from("alc_drivers")
      .select("id,driver_code,full_name,base_key,sigla")
      .eq("id", driverId)
      .single();
    if (driverError) throw new Error(driverError.message);
    const driverCode = textValue(driver.driver_code);
    if (!/^\d+$/.test(driverCode)) throw new Error("O motorista selecionado não possui ID numérico canônico.");
    if (baseKey && textValue(driver.base_key) !== baseKey) throw new Error("O motorista selecionado pertence a outra base.");

    let versions = (doc.driver_payment_document_versions as DbRow[] | null) ?? [];
    if (!versions.length) {
      const batchId = textValue(doc.batch_id);
      if (!batchId) throw new Error("Lote original não encontrado para recuperar o PDF.");
      const { data: batch, error: batchError } = await admin.from("driver_payment_batches").select("original_name,storage_path,metadata").eq("id", batchId).single();
      if (batchError) throw new Error(batchError.message);
      const archivePath = textValue(batch.storage_path);
      const download = await admin.storage.from("driver-payments").download(archivePath);
      if (download.error) throw new Error(download.error.message);
      const archiveBytes = new Uint8Array(await download.data.arrayBuffer());
      const extracted = await extractArchiveFiles(textValue(batch.original_name), archiveBytes);
      const metadata = (batch.metadata ?? {}) as DbRow;
      const files = Array.isArray(metadata.files) ? metadata.files as DbRow[] : [];
      const metadataMatch = files.find((item) => textValue(item.originalName) === textValue(doc.title));
      const wantedPath = textValue(metadataMatch?.path);
      const candidates = extracted.filter((item) => wantedPath ? item.path === wantedPath : basename(item.path) === textValue(doc.title));
      if (candidates.length !== 1) throw new Error("Não foi possível localizar com segurança o PDF dentro do lote original.");
      const file = candidates[0];
      const storagePath = `payment-documents/${batchId}/${documentId}-${safeStorageName(textValue(doc.title))}`;
      const upload = await admin.storage.from("driver-payments").upload(storagePath, file.bytes, { contentType: "application/pdf", upsert: false });
      if (upload.error) throw new Error(upload.error.message);
      const fileHash = await sha256Bytes(file.bytes);
      const versionInsert = await admin.from("driver_payment_document_versions").insert({
        document_id: documentId,
        version_number: 1,
        storage_path: storagePath,
        file_hash: fileHash,
        file_size: file.size,
        original_name: textValue(doc.title),
        published_by: profile.id,
        status: "draft",
        notes: "PDF recuperado do lote para identificação manual.",
      }).select().single();
      if (versionInsert.error) throw new Error(versionInsert.error.message);
      versions = [versionInsert.data as DbRow];
    }

    const { data: updated, error: updateError } = await admin.from("driver_payment_documents").update({
      driver_id: driverId,
      base_key: textValue(driver.base_key) || baseKey,
      status: "draft",
      issue: null,
    }).eq("id", documentId).select().single();
    if (updateError) throw new Error(updateError.message);

    const batchId = textValue(doc.batch_id);
    if (batchId) {
      const { data: batchDocs, error: batchDocsError } = await admin.from("driver_payment_documents").select("status").eq("batch_id", batchId);
      if (batchDocsError) throw new Error(batchDocsError.message);
      const rows = (batchDocs ?? []) as DbRow[];
      await admin.from("driver_payment_batches").update({
        identified_count: rows.filter((row) => textValue(row.status) === "draft" || textValue(row.status) === "published").length,
        unidentified_count: rows.filter((row) => textValue(row.status) === "unidentified").length,
        duplicate_count: rows.filter((row) => textValue(row.status) === "duplicate").length,
        error_count: rows.filter((row) => textValue(row.status) === "error").length,
        status: rows.some((row) => ["draft", "unidentified", "error"].includes(textValue(row.status))) ? "review" : "published",
      }).eq("id", batchId);
    }

    await admin.from("driver_portal_audit_events").insert({
      actor_profile_id: profile.id,
      action: "payment_document_driver_identified",
      entity_table: "driver_payment_documents",
      entity_id: documentId,
      before_data: { driver_id: doc.driver_id, status: doc.status, issue: doc.issue },
      after_data: { driver_id: driverId, driver_code: driverCode, driver_name: textValue(driver.full_name), status: "draft", version_id: textValue(versions[0]?.id) },
    });

    return NextResponse.json({ ok: true, document: updated, driver: { id: driverId, driverCode, fullName: textValue(driver.full_name), baseKey: textValue(driver.base_key), sigla: textValue(driver.sigla) } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao identificar motorista.", accessErrorStatus(error, 400));
  }
}
