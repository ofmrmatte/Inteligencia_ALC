import { NextResponse } from "next/server";
import { canManageImports } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function validShipmentId(value: unknown) {
  const id = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return /^\d{8,14}$/.test(id) ? id : "";
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return jsonError("Sessão expirada. Entre novamente.", 401);
    if (!canManageImports(profile)) return jsonError("Seu perfil não possui permissão para mesclar registros da conciliação.", 403);

    const body = (await request.json().catch(() => ({}))) as { shipmentId?: unknown };
    const shipmentId = validShipmentId(body.shipmentId);
    if (!shipmentId) return jsonError("Informe um ID de pacote válido.");

    const admin = createAdminClient();
    const result = await admin.rpc("merge_reconciliation_duplicates_admin", {
      p_shipment_id: shipmentId,
      p_merged_by: profile.id,
    });

    if (result.error) throw new Error(`merge_reconciliation_duplicates_admin: ${result.error.message}`);

    return NextResponse.json(result.data ?? { shipmentId, removed: 0 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao mesclar duplicidades.", 500);
  }
}
