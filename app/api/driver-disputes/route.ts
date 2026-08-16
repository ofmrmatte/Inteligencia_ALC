import { NextResponse } from "next/server";
import { DRIVER_DISPUTE_STATUSES, type DriverDisputeStatus } from "@/lib/driver-portal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { adminBaseScope, assertBaseAccess, jsonError, loadDriverByAuthUser, requirePortalProfile, textValue } from "@/lib/driver-portal-server";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

function isStatus(value: unknown): value is DriverDisputeStatus {
  return typeof value === "string" && DRIVER_DISPUTE_STATUSES.includes(value as DriverDisputeStatus);
}

async function currentDriver() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? loadDriverByAuthUser(data.user.id) : null;
}

export async function POST(request: Request) {
  try {
    const driver = await currentDriver();
    if (!driver) throw new Error("Conta de motorista não vinculada.");
    const body = (await request.json()) as DbRow;
    const documentId = textValue(body.documentId);
    const admin = createAdminClient();
    const doc = await admin.from("driver_payment_documents").select("*").eq("id", documentId).maybeSingle();
    if (doc.error) throw new Error(doc.error.message);
    if (!doc.data || textValue(doc.data.driver_id) !== textValue(driver.id)) throw new Error("Documento não autorizado para contestação.");
    const admins = await admin.from("admin_base_assignments").select("admin_id").eq("base_key", textValue(doc.data.base_key)).eq("active", true).limit(1);
    if (admins.error) throw new Error(admins.error.message);
    const dispute = await admin.from("driver_disputes").insert({
      document_id: documentId,
      document_version_id: textValue(doc.data.active_version_id) || null,
      driver_id: textValue(driver.id),
      assigned_admin_id: textValue(admins.data?.[0]?.admin_id) || null,
      base_key: textValue(doc.data.base_key),
      reason: textValue(body.reason),
      description: textValue(body.description),
      reference: textValue(body.reference),
      amount: Number(body.amount || 0) || null,
      status: "aberta",
    }).select().single();
    if (dispute.error) throw new Error(dispute.error.message);
    await admin.from("driver_dispute_messages").insert({ dispute_id: dispute.data.id, author_driver_id: textValue(driver.id), body: textValue(body.description) });
    await admin.from("driver_portal_audit_events").insert({ actor_driver_id: textValue(driver.id), action: "dispute_opened", entity_table: "driver_disputes", entity_id: dispute.data.id, after_data: dispute.data });
    return NextResponse.json({ dispute: dispute.data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao abrir contestação.", 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requirePortalProfile();
    const body = (await request.json()) as DbRow;
    const id = textValue(body.id);
    const nextStatus = isStatus(body.status) ? body.status : null;
    if (!id || !nextStatus) throw new Error("Informe contestação e status.");
    const admin = createAdminClient();
    const current = await admin.from("driver_disputes").select("*").eq("id", id).single();
    if (current.error) throw new Error(current.error.message);
    const allowedBases = await adminBaseScope(profile);
    assertBaseAccess(textValue(current.data.base_key), allowedBases);
    const patch: DbRow = { status: nextStatus, updated_at: new Date().toISOString() };
    if (nextStatus === "deferida") patch.decision = textValue(body.decision) || "Contestação deferida. PDF em correção.";
    if (nextStatus === "indeferida") {
      const decision = textValue(body.decision);
      if (!decision) throw new Error("Justificativa obrigatória para indeferimento.");
      patch.decision = decision;
      patch.decided_by = profile.id;
      patch.decided_at = new Date().toISOString();
    }
    if (nextStatus === "concluida") {
      patch.decided_by = profile.id;
      patch.decided_at = new Date().toISOString();
    }
    const updated = await admin.from("driver_disputes").update(patch).eq("id", id).select().single();
    if (updated.error) throw new Error(updated.error.message);
    if (body.message) await admin.from("driver_dispute_messages").insert({ dispute_id: id, author_profile_id: profile.id, body: textValue(body.message) });
    if (updated.data.driver_id) {
      await admin.from("driver_notifications").insert({
        driver_id: textValue(updated.data.driver_id),
        title: "Contestação atualizada",
        body: `Status: ${nextStatus.replaceAll("_", " ")}.`,
        entity_table: "driver_disputes",
        entity_id: id,
      });
    }
    await admin.from("driver_portal_audit_events").insert({ actor_profile_id: profile.id, action: "dispute_status_changed", entity_table: "driver_disputes", entity_id: id, before_data: current.data, after_data: updated.data });
    return NextResponse.json({ dispute: updated.data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao atualizar contestação.", 400);
  }
}
