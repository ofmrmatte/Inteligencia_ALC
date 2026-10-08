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

function shipmentIdsFromBody(body: { shipmentId?: unknown; shipmentIds?: unknown }) {
  const raw = Array.isArray(body.shipmentIds) ? body.shipmentIds : [body.shipmentId];
  return [...new Set(raw.map(validShipmentId).filter(Boolean))];
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return jsonError("Sessão expirada. Entre novamente.", 401);
    if (!canManageImports(profile)) return jsonError("Seu perfil não possui permissão para mesclar registros da conciliação.", 403);

    const body = (await request.json().catch(() => ({}))) as { shipmentId?: unknown; shipmentIds?: unknown };
    const shipmentIds = shipmentIdsFromBody(body);
    if (!shipmentIds.length) return jsonError("Informe ao menos um ID de pacote válido.");
    if (shipmentIds.length > 100) return jsonError("É possível combinar no máximo 100 IDs por vez.");

    const admin = createAdminClient();
    const merged: Array<{ shipmentId: string; removed: number }> = [];

    // Executa em pequenos blocos para manter a operação rápida sem pressionar o banco.
    for (let offset = 0; offset < shipmentIds.length; offset += 10) {
      const chunk = shipmentIds.slice(offset, offset + 10);
      const results = await Promise.all(chunk.map(async (shipmentId) => {
        const result = await admin.rpc("merge_reconciliation_duplicates_admin", {
          p_shipment_id: shipmentId,
          p_merged_by: profile.id,
        });
        if (result.error) throw new Error(`${shipmentId}: ${result.error.message}`);
        const data = (result.data ?? {}) as { removed?: unknown };
        return { shipmentId, removed: Number(data.removed ?? 0) || 0 };
      }));
      merged.push(...results);
    }

    const removed = merged.reduce((total, item) => total + item.removed, 0);
    return NextResponse.json({
      shipmentId: shipmentIds.length === 1 ? shipmentIds[0] : undefined,
      shipmentIds,
      processed: shipmentIds.length,
      removed,
      merged,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao mesclar duplicidades.", 500);
  }
}
