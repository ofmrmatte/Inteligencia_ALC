import { NextResponse } from "next/server";
import { accessErrorStatus, assertDriverManagementTab, driverManagementBaseScope } from "@/lib/access-control-server";
import { DRIVER_DISPUTE_STATUSES, type DriverDisputeStatus } from "@/lib/driver-portal";
import { createAdminClient } from "@/lib/supabase/admin";
import { driverPortalUrl } from "@/lib/driver-portal-url";
import { assertBaseAccess, jsonError, requirePortalProfile, textValue } from "@/lib/driver-portal-server";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

function isStatus(value: unknown): value is DriverDisputeStatus {
  return typeof value === "string" && DRIVER_DISPUTE_STATUSES.includes(value as DriverDisputeStatus);
}

export async function GET(request: Request) {
  try {
    const profile = await requirePortalProfile();
    assertDriverManagementTab(profile, "disputes");
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) throw new Error("Informe a contestação.");

    const admin = createAdminClient();
    const current = await admin
      .from("driver_disputes")
      .select("*,alc_drivers(driver_code,full_name,base_key,sigla),driver_payment_documents(id,title,status,active_version_id,period),driver_dispute_messages(*)")
      .eq("id", id)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) return jsonError("Contestação não encontrada.", 404);
    const allowedBases = await driverManagementBaseScope(profile);
    assertBaseAccess(textValue(current.data.base_key), allowedBases);
    return NextResponse.json({ dispute: current.data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao carregar contestação.", accessErrorStatus(error, 400));
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error: "A abertura de contestação pelo motorista foi movida para o Portal do Motorista externo.",
      portalUrl: driverPortalUrl(),
    },
    { status: 410 },
  );
}

export async function PATCH(request: Request) {
  try {
    const profile = await requirePortalProfile();
    assertDriverManagementTab(profile, "disputes");
    const body = (await request.json()) as DbRow;
    const id = textValue(body.id);
    const nextStatus = isStatus(body.status) ? body.status : null;
    if (!id || !nextStatus) throw new Error("Informe contestação e status.");
    const admin = createAdminClient();
    const current = await admin.from("driver_disputes").select("*").eq("id", id).single();
    if (current.error) throw new Error(current.error.message);
    const allowedBases = await driverManagementBaseScope(profile);
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
    const message = textValue(body.message).trim();
    if (message) {
      const insertedMessage = await admin.from("driver_dispute_messages").insert({ dispute_id: id, author_profile_id: profile.id, body: message });
      if (insertedMessage.error) throw new Error(insertedMessage.error.message);
    }
    if (updated.data.driver_id) {
      await admin.from("driver_notifications").insert({
        driver_id: textValue(updated.data.driver_id),
        title: message ? "Nova mensagem na contestação" : "Contestação atualizada",
        body: message || `Status: ${nextStatus.replaceAll("_", " ")}.`,
        entity_table: "driver_disputes",
        entity_id: id,
      });
    }
    await admin.from("driver_portal_audit_events").insert({ actor_profile_id: profile.id, action: message ? "dispute_admin_message" : "dispute_status_changed", entity_table: "driver_disputes", entity_id: id, before_data: current.data, after_data: updated.data });
    return NextResponse.json({ dispute: updated.data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao atualizar contestação.", accessErrorStatus(error, 400));
  }
}
