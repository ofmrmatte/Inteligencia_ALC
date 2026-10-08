import { NextResponse } from "next/server";
import { canAccessSection } from "@/lib/access-control";
import { canAccessScopedRecord } from "@/lib/access-scope";
import { getUserAccessScope } from "@/lib/access-scope-server";
import { getCurrentProfile } from "@/lib/auth-server";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function validMonth(value: unknown) {
  const month = textValue(value);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : "";
}

function validFortnight(value: unknown) {
  const fortnight = textValue(value).toUpperCase();
  return /^0[12]Q(0[1-9]|1[0-2])20\d{2}$/.test(fortnight) ? fortnight : "";
}

export async function PATCH(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
    if (!canAccessSection(profile, "gestao-descontos")) return NextResponse.json({ error: "Acesso negado à Gestão de Descontos." }, { status: 403 });

    const body = (await request.json()) as DbRow;
    const id = textValue(body.id);
    const discountMonth = validMonth(body.discountMonth ?? body.discount_month);
    if (!id) return NextResponse.json({ error: "Informe o registro." }, { status: 400 });
    if (!discountMonth) return NextResponse.json({ error: "Informe um mês de desconto válido." }, { status: 400 });

    const admin = createAdminClient();
    const currentResult = await admin.from("discount_case_current").select("*").eq("id", id).maybeSingle();
    if (currentResult.error) throw new Error(currentResult.error.message);
    const current = (currentResult.data ?? null) as DbRow | null;
    if (!current) return NextResponse.json({ error: "Direcionamento não encontrado." }, { status: 404 });

    const scope = await getUserAccessScope(profile);
    if (!scope.fullAccess) {
      const scoped = canAccessScopedRecord(scope, { baseKey: textValue(current.base_key), sigla: textValue(current.sigla) });
      const xpt = normalizeText(textValue(current.xpt_code));
      const allowedXpt = new Set((profile.xptScope ?? []).map(normalizeText));
      const ownPending = Boolean(current.awaiting_match && textValue(current.created_by) === profile.id);
      if (!scoped && !(xpt && allowedXpt.has(xpt)) && !ownPending) return NextResponse.json({ error: "Acesso negado para este registro." }, { status: 403 });
    }

    const sourcePeriod = body.sourcePeriod === null || body.source_period === null
      ? null
      : validFortnight(body.sourcePeriod ?? body.source_period) || textValue(current.source_period) || null;

    const beforeMonth = textValue(current.discount_month || current.month);
    const beforePeriod = textValue(current.source_period);
    const update = await admin.from("discount_cases").update({
      discount_month: discountMonth,
      source_period: sourcePeriod,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (update.error) throw new Error(update.error.message);

    if (beforeMonth !== discountMonth || beforePeriod !== textValue(sourcePeriod)) {
      const event = await admin.from("discount_case_events").insert({
        case_id: id,
        event_type: "discount_competence_changed",
        actor_id: profile.id,
        source_period: sourcePeriod,
        note: `Competência financeira alterada de ${beforeMonth || "não definida"} para ${discountMonth}.`,
        snapshot: {
          before: { discount_month: beforeMonth || null, source_period: beforePeriod || null },
          after: { discount_month: discountMonth, source_period: sourcePeriod },
        },
      });
      if (event.error) throw new Error(event.error.message);
    }

    const refreshed = await admin.from("discount_case_current").select("*").eq("id", id).single();
    if (refreshed.error) throw new Error(refreshed.error.message);
    return NextResponse.json({ row: refreshed.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar competência do desconto." }, { status: 500 });
  }
}
