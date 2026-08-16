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
    return jsonError(error instanceof Error ? error.message : "Falha ao atualizar contestação.", accessErrorStatus(error, 400));
  }
}
