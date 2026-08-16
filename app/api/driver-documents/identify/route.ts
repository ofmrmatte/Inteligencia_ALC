import { NextResponse } from "next/server";
import { accessErrorStatus, assertDriverManagementTab, driverManagementBaseScope } from "@/lib/access-control-server";
import {
  ensurePaymentDocumentDraftVersion,
  paymentDriverMatchesBase,
  paymentDriverNameKeyFromTitle,
  paymentNameKey,
  type PaymentBaseRef,
} from "@/lib/payment-document-server";
import { assertBaseAccess, jsonError, requirePortalProfile, textValue } from "@/lib/driver-portal-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

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
    if (!["unidentified", "error"].includes(textValue(doc.status))) {
      throw new Error("Este documento não está pendente de identificação.");
    }

    const baseKey = textValue(doc.base_key);
    assertBaseAccess(baseKey, allowedBases);

    const [{ data: driver, error: driverError }, { data: baseRows, error: basesError }] = await Promise.all([
      admin.from("alc_drivers").select("id,driver_code,full_name,base_key,sigla").eq("id", driverId).single(),
      admin.from("operational_bases").select("base_key,base_name,sigla").eq("active", true),
    ]);
    if (driverError) throw new Error(driverError.message);
    if (basesError) throw new Error(basesError.message);

    const driverCode = textValue(driver.driver_code);
    if (!/^\d+$/.test(driverCode)) throw new Error("O motorista selecionado não possui ID numérico canônico.");

    const bases: PaymentBaseRef[] = (baseRows ?? []).map((row) => ({
      baseKey: textValue(row.base_key),
      baseName: textValue(row.base_name),
      sigla: textValue(row.sigla),
    }));
    const driverRef = {
      baseKey: textValue(driver.base_key),
      sigla: textValue(driver.sigla),
    };

    const baseCompatible = paymentDriverMatchesBase(baseKey, driverRef, bases, true);
    if (!baseCompatible) throw new Error("O motorista selecionado pertence a outra base/operação.");

    if (!driverRef.baseKey && !driverRef.sigla) {
      const expected = paymentDriverNameKeyFromTitle(textValue(doc.title));
      if (!expected || paymentNameKey(driver.full_name) !== expected) {
        throw new Error("Motorista sem base só pode ser vinculado quando o nome do PDF corresponde exatamente ao cadastro canônico.");
      }
    }

    const version = await ensurePaymentDocumentDraftVersion(admin, doc, profile.id);

    const { data: updated, error: updateError } = await admin.from("driver_payment_documents").update({
      driver_id: driverId,
      base_key: baseKey || textValue(driver.base_key) || null,
      status: "draft",
      issue: null,
    }).eq("id", documentId).select().single();
    if (updateError) throw new Error(updateError.message);

    const batchId = textValue(doc.batch_id);
    if (batchId) {
      const { data: batchDocs, error: batchDocsError } = await admin
        .from("driver_payment_documents")
        .select("status")
        .eq("batch_id", batchId);
      if (batchDocsError) throw new Error(batchDocsError.message);
      const rows = (batchDocs ?? []) as DbRow[];
      const remainingReview = rows.some((row) => ["draft", "unidentified", "error"].includes(textValue(row.status)));
      const { error: batchUpdateError } = await admin.from("driver_payment_batches").update({
        identified_count: rows.filter((row) => ["draft", "published"].includes(textValue(row.status))).length,
        unidentified_count: rows.filter((row) => textValue(row.status) === "unidentified").length,
        duplicate_count: rows.filter((row) => textValue(row.status) === "duplicate").length,
        error_count: rows.filter((row) => textValue(row.status) === "error").length,
        status: remainingReview ? "review" : "published",
      }).eq("id", batchId);
      if (batchUpdateError) throw new Error(batchUpdateError.message);
    }

    await admin.from("driver_portal_audit_events").insert({
      actor_profile_id: profile.id,
      action: "payment_document_driver_identified",
      entity_table: "driver_payment_documents",
      entity_id: documentId,
      before_data: { driver_id: doc.driver_id, status: doc.status, issue: doc.issue },
      after_data: {
        driver_id: driverId,
        driver_code: driverCode,
        driver_name: textValue(driver.full_name),
        status: "draft",
        version_id: textValue((version as DbRow)?.id),
      },
    });

    return NextResponse.json({
      ok: true,
      document: updated,
      driver: {
        id: driverId,
        driverCode,
        fullName: textValue(driver.full_name),
        baseKey: textValue(driver.base_key),
        sigla: textValue(driver.sigla),
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao identificar motorista.", accessErrorStatus(error, 400));
  }
}
