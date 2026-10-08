import { NextResponse } from "next/server";
import { canAccessSection } from "@/lib/access-control";
import { canAccessScopedRecord } from "@/lib/access-scope";
import { getUserAccessScope } from "@/lib/access-scope-server";
import { getCurrentProfile } from "@/lib/auth-server";
import { isDiscountDirection } from "@/lib/discount-management";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;
type Authorized = {
  profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>;
  scope: Awaited<ReturnType<typeof getUserAccessScope>>;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function nullableText(value: unknown) {
  const valueText = textValue(value);
  return valueText || null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableDate(value: unknown) {
  const date = textValue(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function validShipmentId(value: unknown) {
  const id = textValue(value).replace(/\D/g, "");
  return /^\d{8,14}$/.test(id) ? id : "";
}

async function authorize(): Promise<Authorized> {
  const profile = await getCurrentProfile();
  if (!profile) {
    const error = new Error("Sessão expirada. Entre novamente.");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (!canAccessSection(profile, "gestao-descontos")) {
    const error = new Error("Seu perfil não possui acesso à Gestão de Descontos.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return { profile, scope: await getUserAccessScope(profile) };
}

function errorStatus(error: unknown, fallback = 400) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : fallback;
}

function canSeeRow(auth: Authorized, row: DbRow) {
  if (auth.scope.fullAccess) return true;
  if (canAccessScopedRecord(auth.scope, { baseKey: textValue(row.base_key), sigla: textValue(row.sigla) })) return true;
  const xpt = normalizeText(textValue(row.xpt_code));
  const allowedXpt = new Set((auth.profile.xptScope ?? []).map(normalizeText));
  if (xpt && allowedXpt.has(xpt)) return true;
  return Boolean(row.awaiting_match && textValue(row.created_by) === auth.profile.id);
}

async function loadCurrentRow(admin: ReturnType<typeof createAdminClient>, caseId: string) {
  const current = await admin.from("discount_case_current").select("*").eq("id", caseId).maybeSingle();
  if (current.error) throw new Error(`discount_case_current: ${current.error.message}`);
  return (current.data ?? null) as DbRow | null;
}

async function lookupOperational(admin: ReturnType<typeof createAdminClient>, shipmentId: string) {
  const [prefaturaResult, pnrResult] = await Promise.all([
    admin
      .from("prefatura_records")
      .select("shipment_id,driver_id,driver_name,base_key,base_name,base_label,sigla,route_id,route_date,value,operation,month,fortnight,source_file,created_at")
      .eq("shipment_id", shipmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("pnr_records")
      .select("shipment_id,driver_id,base_key,sigla,route_id,case_date,purchase_value,status,month,fortnight,source_file,created_at")
      .eq("shipment_id", shipmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (prefaturaResult.error) throw new Error(`prefatura_records: ${prefaturaResult.error.message}`);
  if (pnrResult.error) throw new Error(`pnr_records: ${pnrResult.error.message}`);

  const prefatura = (prefaturaResult.data ?? null) as DbRow | null;
  const pnr = (pnrResult.data ?? null) as DbRow | null;
  const driverId = textValue(prefatura?.driver_id) || textValue(pnr?.driver_id);
  const baseKey = textValue(prefatura?.base_key) || textValue(pnr?.base_key);
  const sigla = textValue(prefatura?.sigla) || textValue(pnr?.sigla);

  let driverName = textValue(prefatura?.driver_name);
  if (!driverName && driverId) {
    const driver = await admin.from("alc_drivers").select("full_name").eq("driver_code", driverId).limit(1).maybeSingle();
    if (!driver.error) driverName = textValue(driver.data?.full_name);
  }

  let unit: DbRow | null = null;
  if (baseKey) {
    const unitByBase = await admin.from("operational_units").select("base_name,xpt_code").eq("active", true).eq("base_key", baseKey).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!unitByBase.error) unit = (unitByBase.data ?? null) as DbRow | null;
  }
  if (!unit && sigla) {
    const unitBySigla = await admin.from("operational_units").select("base_name,xpt_code").eq("active", true).eq("sigla", sigla).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!unitBySigla.error) unit = (unitBySigla.data ?? null) as DbRow | null;
  }

  const matchedPrefatura = Boolean(prefatura);
  const matchedPnr = Boolean(pnr);
  return {
    shipment_id: shipmentId,
    driver_id: driverId || null,
    driver_name: driverName || null,
    base_key: baseKey || null,
    base_name: textValue(prefatura?.base_name) || textValue(unit?.base_name) || textValue(prefatura?.base_label) || null,
    sigla: sigla || null,
    xpt_code: textValue(unit?.xpt_code) || null,
    route_id: textValue(prefatura?.route_id) || textValue(pnr?.route_id) || null,
    event_date: textValue(prefatura?.route_date) || textValue(pnr?.case_date) || null,
    amount: nullableNumber(prefatura?.value) ?? nullableNumber(pnr?.purchase_value) ?? 0,
    amount_source: prefatura?.value != null ? "Pré-fatura" : pnr?.purchase_value != null ? "PNR" : "Sem valor",
    pnr_status: textValue(pnr?.status) || null,
    prefatura_operation: textValue(prefatura?.operation) || null,
    month: textValue(prefatura?.month) || textValue(pnr?.month) || null,
    fortnight: textValue(prefatura?.fortnight) || textValue(pnr?.fortnight) || null,
    prefatura_source_file: textValue(prefatura?.source_file) || null,
    pnr_source_file: textValue(pnr?.source_file) || null,
    matched_prefatura: matchedPrefatura,
    matched_pnr: matchedPnr,
    awaiting_match: !matchedPrefatura && !matchedPnr,
    origin: matchedPrefatura && matchedPnr ? "Pré-fatura + PNR" : matchedPrefatura ? "Pré-fatura" : matchedPnr ? "PNR" : "Manual",
  } satisfies DbRow;
}

export async function GET(request: Request) {
  try {
    const auth = await authorize();
    const admin = createAdminClient();
    const url = new URL(request.url);
    const lookup = validShipmentId(url.searchParams.get("lookup"));
    const historyId = textValue(url.searchParams.get("history"));

    if (historyId) {
      const current = await loadCurrentRow(admin, historyId);
      if (!current) return jsonError("Direcionamento não encontrado.", 404);
      if (!canSeeRow(auth, current)) return jsonError("Acesso negado para este registro.", 403);
      const eventsResult = await admin.from("discount_case_events").select("*").eq("case_id", historyId).order("created_at", { ascending: false });
      if (eventsResult.error) throw new Error(`discount_case_events: ${eventsResult.error.message}`);
      const events = (eventsResult.data ?? []) as DbRow[];
      const actorIds = [...new Set(events.map((event) => textValue(event.actor_id)).filter(Boolean))];
      const actorMap = new Map<string, { full_name: string; email: string }>();
      if (actorIds.length) {
        const actors = await admin.from("profiles").select("id,full_name,email").in("id", actorIds);
        if (!actors.error) for (const actor of actors.data ?? []) actorMap.set(textValue(actor.id), { full_name: textValue(actor.full_name), email: textValue(actor.email) });
      }
      return NextResponse.json({ row: current, events: events.map((event) => ({ ...event, actor: actorMap.get(textValue(event.actor_id)) ?? null })) });
    }

    if (url.searchParams.has("lookup")) {
      if (!lookup) return jsonError("Informe um ID de pacote válido.");
      const existingResult = await admin.from("discount_case_current").select("*").eq("shipment_id", lookup).order("allocation_no", { ascending: true });
      if (existingResult.error) throw new Error(`discount_case_current: ${existingResult.error.message}`);
      const existingEntries = ((existingResult.data ?? []) as DbRow[]).filter((row) => canSeeRow(auth, row));
      const match = await lookupOperational(admin, lookup);
      if (!match.awaiting_match && !canSeeRow(auth, match)) return jsonError("O ID existe fora do seu escopo operacional.", 403);
      return NextResponse.json({
        existing: existingEntries[0] ?? null,
        existingEntries,
        existingCount: existingEntries.length,
        allocatedTotal: existingEntries.reduce((sum, row) => sum + (nullableNumber(row.amount) ?? 0), 0),
        match,
      });
    }

    const result = await admin.from("discount_case_current").select("*").order("updated_at", { ascending: false }).limit(10000);
    if (result.error) throw new Error(`discount_case_current: ${result.error.message}`);
    const rows = ((result.data ?? []) as DbRow[]).filter((row) => canSeeRow(auth, row));
    return NextResponse.json({ rows });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao carregar a Gestão de Descontos.", errorStatus(error, 500));
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize();
    const admin = createAdminClient();
    const body = (await request.json()) as DbRow;
    const shipmentId = validShipmentId(body.shipmentId ?? body.shipment_id);
    if (!shipmentId) return jsonError("Informe um ID de pacote válido.");
    const direction = isDiscountDirection(body.direction) ? body.direction : "em_analise";
    const allowDuplicate = Boolean(body.allowDuplicate ?? body.allow_duplicate);

    const existingResult = await admin.from("discount_cases")
      .select("id,allocation_no")
      .eq("shipment_id", shipmentId)
      .is("deleted_at", null)
      .order("allocation_no", { ascending: true });
    if (existingResult.error) throw new Error(existingResult.error.message);
    const existing = existingResult.data ?? [];
    if (existing.length && !allowDuplicate) return jsonError("Este ID já possui direcionamento. Use a opção de adicionar um novo lançamento para o mesmo ID.", 409);

    const allocationNo = existing.length ? Math.max(...existing.map((row) => Number(row.allocation_no || 0))) + 1 : 1;
    const match = await lookupOperational(admin, shipmentId);
    if (!match.awaiting_match && !canSeeRow(auth, match)) return jsonError("O ID existe fora do seu escopo operacional.", 403);

    const allocationAmount = nullableNumber(body.allocationAmount ?? body.allocation_amount);
    if (existing.length && allocationAmount == null) return jsonError("Para um novo lançamento do mesmo ID, informe o valor deste direcionamento.");
    if (allocationAmount != null && allocationAmount < 0) return jsonError("O valor do direcionamento não pode ser negativo.");

    const insert = await admin.from("discount_cases").insert({
      shipment_id: shipmentId,
      allocation_no: allocationNo,
      allocation_amount: allocationAmount,
      allocation_target_id: nullableText(body.allocationTargetId ?? body.allocation_target_id),
      allocation_target_name: nullableText(body.allocationTargetName ?? body.allocation_target_name),
      direction,
      note: nullableText(body.note),
      manual_amount: nullableNumber(body.manualAmount ?? body.manual_amount),
      manual_route_id: nullableText(body.manualRouteId ?? body.manual_route_id),
      manual_date: nullableDate(body.manualDate ?? body.manual_date),
      manual_driver_id: nullableText(body.manualDriverId ?? body.manual_driver_id),
      manual_driver_name: nullableText(body.manualDriverName ?? body.manual_driver_name),
      manual_base_key: nullableText(body.manualBaseKey ?? body.manual_base_key),
      manual_base_name: nullableText(body.manualBaseName ?? body.manual_base_name),
      manual_sigla: nullableText(body.manualSigla ?? body.manual_sigla),
      source_kind: "manual",
      created_by: auth.profile.id,
      updated_by: auth.profile.id,
    }).select("id").single();
    if (insert.error) throw new Error(`discount_cases: ${insert.error.message}`);

    const caseId = textValue(insert.data.id);
    const event = await admin.from("discount_case_events").insert({
      case_id: caseId,
      event_type: allocationNo > 1 ? "additional_allocation_created" : "created",
      to_direction: direction,
      note: nullableText(body.note),
      actor_id: auth.profile.id,
      snapshot: { match, source: "manual", allocation_no: allocationNo, allocation_amount: allocationAmount, allocation_target_id: nullableText(body.allocationTargetId ?? body.allocation_target_id), allocation_target_name: nullableText(body.allocationTargetName ?? body.allocation_target_name) },
    });
    if (event.error) throw new Error(`discount_case_events: ${event.error.message}`);

    const row = await loadCurrentRow(admin, caseId);
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao criar direcionamento.", errorStatus(error, 500));
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorize();
    const admin = createAdminClient();
    const body = (await request.json()) as DbRow;
    const caseId = textValue(body.id);
    if (!caseId) return jsonError("Informe o registro que será atualizado.");

    const before = await loadCurrentRow(admin, caseId);
    if (!before) return jsonError("Direcionamento não encontrado.", 404);
    if (!canSeeRow(auth, before)) return jsonError("Acesso negado para este registro.", 403);

    const patch: DbRow = { updated_by: auth.profile.id, updated_at: new Date().toISOString() };
    if (body.direction !== undefined) {
      if (!isDiscountDirection(body.direction)) return jsonError("Direcionamento inválido.");
      patch.direction = body.direction;
    }
    if (body.note !== undefined) patch.note = nullableText(body.note);
    if (body.allocationAmount !== undefined || body.allocation_amount !== undefined) patch.allocation_amount = nullableNumber(body.allocationAmount ?? body.allocation_amount);
    if (body.allocationTargetId !== undefined || body.allocation_target_id !== undefined) patch.allocation_target_id = nullableText(body.allocationTargetId ?? body.allocation_target_id);
    if (body.allocationTargetName !== undefined || body.allocation_target_name !== undefined) patch.allocation_target_name = nullableText(body.allocationTargetName ?? body.allocation_target_name);
    if (body.manualAmount !== undefined || body.manual_amount !== undefined) patch.manual_amount = nullableNumber(body.manualAmount ?? body.manual_amount);
    if (body.manualRouteId !== undefined || body.manual_route_id !== undefined) patch.manual_route_id = nullableText(body.manualRouteId ?? body.manual_route_id);
    if (body.manualDate !== undefined || body.manual_date !== undefined) patch.manual_date = nullableDate(body.manualDate ?? body.manual_date);
    if (body.manualDriverId !== undefined || body.manual_driver_id !== undefined) patch.manual_driver_id = nullableText(body.manualDriverId ?? body.manual_driver_id);
    if (body.manualDriverName !== undefined || body.manual_driver_name !== undefined) patch.manual_driver_name = nullableText(body.manualDriverName ?? body.manual_driver_name);
    if (body.manualBaseKey !== undefined || body.manual_base_key !== undefined) patch.manual_base_key = nullableText(body.manualBaseKey ?? body.manual_base_key);
    if (body.manualBaseName !== undefined || body.manual_base_name !== undefined) patch.manual_base_name = nullableText(body.manualBaseName ?? body.manual_base_name);
    if (body.manualSigla !== undefined || body.manual_sigla !== undefined) patch.manual_sigla = nullableText(body.manualSigla ?? body.manual_sigla);

    const updated = await admin.from("discount_cases").update(patch).eq("id", caseId).is("deleted_at", null).select("id").single();
    if (updated.error) throw new Error(`discount_cases: ${updated.error.message}`);
    const after = await loadCurrentRow(admin, caseId);
    if (!after) throw new Error("Não foi possível recarregar o direcionamento atualizado.");

    const fromDirection = textValue(before.direction);
    const toDirection = textValue(after.direction);
    const eventResult = await admin.from("discount_case_events").insert({
      case_id: caseId,
      event_type: fromDirection !== toDirection ? "direction_changed" : "case_updated",
      from_direction: fromDirection || null,
      to_direction: toDirection || null,
      note: nullableText(body.note) ?? nullableText(after.note),
      actor_id: auth.profile.id,
      snapshot: {
        before: { direction: before.direction, amount: before.amount, allocation_amount: before.allocation_amount, target_id: before.allocation_target_id, target_name: before.allocation_target_name, note: before.note },
        after: { direction: after.direction, amount: after.amount, allocation_amount: after.allocation_amount, target_id: after.allocation_target_id, target_name: after.allocation_target_name, note: after.note },
      },
    });
    if (eventResult.error) throw new Error(`discount_case_events: ${eventResult.error.message}`);

    return NextResponse.json({ row: after });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao atualizar direcionamento.", errorStatus(error, 500));
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authorize();
    const admin = createAdminClient();
    const url = new URL(request.url);
    const caseId = textValue(url.searchParams.get("id"));
    if (!caseId) return jsonError("Informe o direcionamento que será excluído.");

    const before = await loadCurrentRow(admin, caseId);
    if (!before) return jsonError("Direcionamento não encontrado.", 404);
    if (!canSeeRow(auth, before)) return jsonError("Acesso negado para este registro.", 403);

    const event = await admin.from("discount_case_events").insert({
      case_id: caseId,
      event_type: "deleted",
      from_direction: textValue(before.direction) || null,
      note: "Direcionamento removido da Gestão de Descontos.",
      actor_id: auth.profile.id,
      snapshot: { row: before },
    });
    if (event.error) throw new Error(`discount_case_events: ${event.error.message}`);

    const deleted = await admin.from("discount_cases").update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.profile.id,
      updated_by: auth.profile.id,
      updated_at: new Date().toISOString(),
    }).eq("id", caseId).is("deleted_at", null).select("id").single();
    if (deleted.error) throw new Error(`discount_cases: ${deleted.error.message}`);

    return NextResponse.json({ deleted: true, id: caseId });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao excluir direcionamento.", errorStatus(error, 500));
  }
}
