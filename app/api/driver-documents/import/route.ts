import { NextResponse } from "next/server";
import { assertDriverManagementTab, driverManagementBaseScope, accessErrorStatus } from "@/lib/access-control-server";
import { classifyPaymentArchive, extractArchiveFiles, MAX_ARCHIVE_COMPRESSED_SIZE, paymentArchiveContext, safeStorageName, type PaymentBaseReference } from "@/lib/driver-portal";
import { assertBaseAccess, jsonError, loadKnownDrivers, requirePortalProfile, textValue } from "@/lib/driver-portal-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const profile = await requirePortalProfile();
    assertDriverManagementTab(profile, "payments");
    const allowedBases = await driverManagementBaseScope(profile);
    if (allowedBases && allowedBases.length === 0) throw new Error("Seu usuário não possui bases designadas.");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Arquivo não enviado.");
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".zip") && !lower.endsWith(".rar")) throw new Error("Envie ZIP ou RAR.");
    if (file.size > MAX_ARCHIVE_COMPRESSED_SIZE) throw new Error(`Arquivo acima do limite de ${Math.round(MAX_ARCHIVE_COMPRESSED_SIZE / 1024 / 1024)}MB.`);

    const admin = createAdminClient();
    const archiveBytes = new Uint8Array(await file.arrayBuffer());
    const archiveType = lower.endsWith(".rar") ? "rar" : "zip";
    const batchId = crypto.randomUUID();
    const archivePath = `payment-imports/${batchId}/${safeStorageName(file.name)}`;
    const uploadArchive = await admin.storage.from("driver-payments").upload(archivePath, archiveBytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (uploadArchive.error) throw new Error(uploadArchive.error.message);

    let baseQuery = admin.from("operational_bases").select("base_key,base_name,sigla").eq("active", true);
    if (allowedBases) baseQuery = baseQuery.in("base_key", allowedBases.length ? allowedBases : ["__none__"]);
    const baseResult = await baseQuery.order("base_name", { ascending: true });
    if (baseResult.error) throw new Error(baseResult.error.message);
    const operationalBases: PaymentBaseReference[] = (baseResult.data ?? []).map((row) => ({
      baseKey: textValue(row.base_key),
      baseName: textValue(row.base_name) || textValue(row.base_key),
      sigla: textValue(row.sigla),
    }));

    const archiveContext = paymentArchiveContext(file.name, operationalBases);
    if (archiveContext?.baseKey) assertBaseAccess(archiveContext.baseKey, allowedBases);

    const driverScope = archiveContext?.baseKey ? [archiveContext.baseKey] : allowedBases;
    const knownDrivers = await loadKnownDrivers(driverScope);
    const hashes = await admin.from("driver_payment_document_versions").select("file_hash");
    if (hashes.error) throw new Error(hashes.error.message);
    const knownHashes = new Set((hashes.data ?? []).map((row) => textValue(row.file_hash)));
    const extracted = await extractArchiveFiles(file.name, archiveBytes);
    const classified = await classifyPaymentArchive(extracted, knownDrivers, knownHashes, { archiveName: file.name, bases: operationalBases });

    for (const item of classified) if (item.baseKey) assertBaseAccess(item.baseKey, allowedBases);

    const counts = {
      identified: classified.filter((item) => item.status === "identified").length,
      unidentified: classified.filter((item) => item.status === "unidentified").length,
      duplicate: classified.filter((item) => item.status === "duplicate").length,
      error: classified.filter((item) => item.status === "invalid" || item.status === "conflict").length,
    };
    const metadataFiles = classified.map((item) => ({
      path: item.path,
      originalName: item.originalName,
      safeName: item.safeName,
      baseKey: item.baseKey,
      baseName: item.baseName,
      sigla: item.sigla,
      driverCode: item.driverCode,
      driverName: item.driverName,
      period: item.period,
      documentDate: item.documentDate,
      status: item.status,
      issue: item.issue,
      fileHash: item.fileHash,
      fileSize: item.fileSize,
    }));
    const batchInsert = await admin.from("driver_payment_batches").insert({
      id: batchId,
      imported_by: profile.id,
      original_name: file.name,
      archive_type: archiveType,
      storage_path: archivePath,
      status: "review",
      total_files: classified.length,
      identified_count: counts.identified,
      unidentified_count: counts.unidentified,
      duplicate_count: counts.duplicate,
      error_count: counts.error,
      metadata: { files: metadataFiles, archiveContext },
    });
    if (batchInsert.error) throw new Error(batchInsert.error.message);

    const created = [];
    for (const item of classified) {
      if (item.status === "invalid") continue;
      const databaseStatus = item.status === "identified" ? "draft" : item.status === "conflict" ? "error" : item.status;
      const driver = knownDrivers.find((candidate) => candidate.driverCode === item.driverCode);
      const document = await admin.from("driver_payment_documents").insert({
        batch_id: batchId,
        driver_id: item.status === "identified" ? driver?.id : null,
        base_key: item.baseKey || null,
        period: item.period || null,
        document_date: item.documentDate,
        status: databaseStatus,
        title: item.originalName,
        issue: item.issue || null,
      }).select().single();
      if (document.error) throw new Error(document.error.message);

      let version = null;
      if (["identified", "unidentified", "conflict"].includes(item.status)) {
        const storagePath = `payment-documents/${batchId}/${document.data.id}-${safeStorageName(item.originalName)}`;
        const upload = await admin.storage.from("driver-payments").upload(storagePath, item.bytes, { contentType: "application/pdf", upsert: false });
        if (upload.error) throw new Error(upload.error.message);
        const versionInsert = await admin.from("driver_payment_document_versions").insert({
          document_id: document.data.id,
          version_number: 1,
          storage_path: storagePath,
          file_hash: item.fileHash,
          file_size: item.fileSize,
          original_name: item.originalName,
          published_by: profile.id,
          status: "draft",
        }).select().single();
        if (versionInsert.error) throw new Error(versionInsert.error.message);
        version = versionInsert.data;
      }
      created.push({ ...document.data, version, classification: item.status, issue: item.issue, driverName: item.driverName, driverCode: item.driverCode, sigla: item.sigla });
    }

    await admin.from("driver_portal_audit_events").insert({ actor_profile_id: profile.id, action: "payment_batch_review_created", entity_table: "driver_payment_batches", entity_id: batchId, after_data: { counts, originalName: file.name, archiveContext } });
    return NextResponse.json({ batchId, counts, archiveContext, documents: created });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao importar documentos.", accessErrorStatus(error, 400));
  }
}
