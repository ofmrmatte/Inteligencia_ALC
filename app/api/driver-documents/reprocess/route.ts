import { NextResponse } from "next/server";
import { accessErrorStatus, assertDriverManagementTab, driverManagementBaseScope } from "@/lib/access-control-server";
import {
  ensurePaymentDocumentDraftVersion,
  paymentDriverCandidates,
  paymentDriverNameKeyFromTitle,
  paymentNameKey,
  type PaymentBaseRef,
  type PaymentDriverRef,
} from "@/lib/payment-document-server";
import { jsonError, loadKnownDrivers, requirePortalProfile, textValue } from "@/lib/driver-portal-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(textValue).filter(Boolean) : [];
}

export async function POST(request: Request) {
  try {
    const profile = await requirePortalProfile();
    assertDriverManagementTab(profile, "payments");
    const allowedBases = await driverManagementBaseScope(profile);
    const body = (await request.json().catch(() => ({}))) as DbRow;
    const requestedIds = stringArray(body.documentIds);

    const admin = createAdminClient();
    let documentsQuery = admin
      .from("driver_payment_documents")
      .select("*,driver_payment_document_versions:driver_payment_document_versions!driver_payment_document_versions_document_id_fkey(*)")
      .in("status", ["unidentified", "error"])
      .order("created_at", { ascending: true });
    if (allowedBases) documentsQuery = documentsQuery.in("base_key", allowedBases.length ? allowedBases : ["__none__"]);
    if (requestedIds.length) documentsQuery = documentsQuery.in("id", requestedIds);

    const [{ data: documents, error: documentsError }, { data: baseRows, error: basesError }, allDrivers] = await Promise.all([
      documentsQuery,
      admin.from("operational_bases").select("base_key,base_name,sigla").eq("active", true),
      loadKnownDrivers(null),
    ]);
    if (documentsError) throw new Error(documentsError.message);
    if (basesError) throw new Error(basesError.message);

    const bases: PaymentBaseRef[] = (baseRows ?? []).map((row) => ({
      baseKey: textValue(row.base_key),
      baseName: textValue(row.base_name),
      sigla: textValue(row.sigla),
    }));
    const drivers: PaymentDriverRef[] = allDrivers.map((driver) => ({
      id: driver.id,
      driverCode: driver.driverCode,
      fullName: driver.fullName,
      baseKey: driver.baseKey,
      sigla: driver.sigla,
    })).filter((driver) => /^\d+$/.test(driver.driverCode));

    const resolved: Array<{ documentId: string; driverCode: string; driverName: string }> = [];
    const pending: Array<{ documentId: string; title: string; reason: string }> = [];
    const affectedBatchIds = new Set<string>();

    for (const raw of (documents ?? []) as DbRow[]) {
      const documentId = textValue(raw.id);
      const title = textValue(raw.title);
      const expectedNameKey = paymentDriverNameKeyFromTitle(title);
      if (!expectedNameKey) {
        pending.push({ documentId, title, reason: "Nome do motorista não pôde ser extraído do arquivo." });
        continue;
      }

      const exactNameDrivers = drivers.filter((driver) => paymentNameKey(driver.fullName) === expectedNameKey);
      const compatible = paymentDriverCandidates(textValue(raw.base_key), exactNameDrivers, bases, {
        allowUnscoped: true,
        expectedNameKey,
      });

      if (compatible.length !== 1) {
        pending.push({
          documentId,
          title,
          reason: compatible.length > 1
            ? "Mais de um ID canônico compatível com o nome/base."
            : exactNameDrivers.length > 0
              ? "O nome existe, mas o cadastro aponta para outra base/operação."
              : "Nenhum ID numérico canônico encontrado para o nome exato.",
        });
        continue;
      }

      const driver = compatible[0];
      const version = await ensurePaymentDocumentDraftVersion(admin, raw, profile.id);
      const { error: updateError } = await admin.from("driver_payment_documents").update({
        driver_id: driver.id,
        status: "draft",
        issue: null,
      }).eq("id", documentId);
      if (updateError) throw new Error(updateError.message);

      const batchId = textValue(raw.batch_id);
      if (batchId) affectedBatchIds.add(batchId);
      resolved.push({ documentId, driverCode: driver.driverCode, driverName: driver.fullName });

      await admin.from("driver_portal_audit_events").insert({
        actor_profile_id: profile.id,
        action: "payment_document_driver_auto_resolved",
        entity_table: "driver_payment_documents",
        entity_id: documentId,
        before_data: { driver_id: raw.driver_id, status: raw.status, issue: raw.issue },
        after_data: {
          driver_id: driver.id,
          driver_code: driver.driverCode,
          driver_name: driver.fullName,
          status: "draft",
          version_id: textValue((version as DbRow)?.id),
          resolution: "exact_name_unique_base_compatible",
        },
      });
    }

    for (const batchId of affectedBatchIds) {
      const { data: rows, error: rowsError } = await admin
        .from("driver_payment_documents")
        .select("status")
        .eq("batch_id", batchId);
      if (rowsError) throw new Error(rowsError.message);
      const statuses = (rows ?? []) as DbRow[];
      const { error: batchError } = await admin.from("driver_payment_batches").update({
        identified_count: statuses.filter((row) => ["draft", "published"].includes(textValue(row.status))).length,
        unidentified_count: statuses.filter((row) => textValue(row.status) === "unidentified").length,
        duplicate_count: statuses.filter((row) => textValue(row.status) === "duplicate").length,
        error_count: statuses.filter((row) => textValue(row.status) === "error").length,
        status: statuses.some((row) => ["draft", "unidentified", "error"].includes(textValue(row.status))) ? "review" : "published",
      }).eq("id", batchId);
      if (batchError) throw new Error(batchError.message);
    }

    return NextResponse.json({
      scanned: (documents ?? []).length,
      resolved: resolved.length,
      pending: pending.length,
      resolvedDocuments: resolved,
      pendingDocuments: pending,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao reprocessar documentos.", accessErrorStatus(error, 400));
  }
}
