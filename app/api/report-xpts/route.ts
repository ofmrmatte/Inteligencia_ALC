import { NextResponse } from "next/server";
import { hasFullAccess } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/auth-server";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return jsonError("Sessão expirada. Entre novamente.", 401);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("operational_xpts")
      .select("xpt_code,active")
      .eq("active", true)
      .order("xpt_code", { ascending: true });

    if (error) throw new Error(error.message);

    const all = [...new Set((data ?? [])
      .map((row) => normalizeText(row.xpt_code))
      .filter(Boolean))];

    const allowed = hasFullAccess(profile)
      ? all
      : all.filter((xpt) => new Set((profile.xptScope ?? []).map(normalizeText)).has(xpt));

    return NextResponse.json({ xpts: allowed });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao carregar XPTs do relatório.", 500);
  }
}
