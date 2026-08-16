import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { jsonError, loadDriverByAuthUser, loadTickets, textValue } from "@/lib/driver-portal-server";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");
    const driver = await loadDriverByAuthUser(userData.user.id);
    if (!driver) throw new Error("Conta de motorista não vinculada.");
    const admin = createAdminClient();
    const driverId = textValue(driver.id);
    const driverCode = textValue(driver.driver_code);
    const [tickets, docs, disputes, notifications] = await Promise.all([
      loadTickets({ driverId, driverCode }),
      admin
        .from("driver_payment_documents")
        .select("*,driver_payment_document_versions(*)")
        .eq("driver_id", driverId)
        .in("status", ["published", "superseded"])
        .order("created_at", { ascending: false }),
      admin
        .from("driver_disputes")
        .select("*,driver_payment_documents(title),driver_dispute_messages(*)")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false }),
      admin.from("driver_notifications").select("*").eq("driver_id", driverId).order("created_at", { ascending: false }).limit(50),
    ]);
    for (const result of [docs, disputes, notifications]) if (result.error) throw new Error(result.error.message);
    await admin.from("alc_drivers").update({ last_seen_at: new Date().toISOString() }).eq("id", driverId);
    return NextResponse.json({
      driver: {
        id: driverId,
        driverCode,
        fullName: textValue(driver.full_name),
        baseKey: textValue(driver.base_key),
        sigla: textValue(driver.sigla),
        status: textValue(driver.status),
        baseName: textValue((driver.operational_bases as DbRow | null)?.base_name) || textValue(driver.base_key),
      },
      tickets,
      documents: docs.data ?? [],
      disputes: disputes.data ?? [],
      notifications: notifications.data ?? [],
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao carregar portal do motorista.", 401);
  }
}
