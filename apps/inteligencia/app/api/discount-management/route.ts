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

function operationalSnapshot(row: DbRow) {
  return {
    driver_id: nullableText(row.driver_id),
    driver_name: nullableText(row.driver_name),
    base_key: nullableText(row.base_key),
    base_name: nullableText(row.base_name),
    sigla: nullableText(row.sigla),
    xpt_code: nullableText(row.xpt_code),
    route_id: nullableText(row.route_id),
    event_date: nullableText(row.event_date),
    amount: nullableNumber(row.amount) ?? 0,
    amount_source: nullableText(row.amount_source),
    pnr_status: nullableText(row.pnr_status),
    prefatura_operation: nullableText(row.prefatura_operation),
    month: nullableText(row.month),
    fortnight: nullableText(row.fortnight),
    matched_prefatura: Boolean(row.matched_prefatura),
    matched_pnr: Boolean(row.matched_pnr),
    awaiting_match: Boolean(row.awaiting_match),
    origin: nullableText(row.origin),
  };
}

function snapshotChanged(before: unknown, after: ReturnType<typeof operationalSnapshot>) {
  if (!before || typeof before !== "object") return false;
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function syncOperationalChanges(admin: ReturnType<typeof createAdminClient>, rows: DbRow[]) {
  for (const row of rows) {
    const caseId = textValue(row.id);
    if (!caseId) continue;
    const nextSnapshot = operationalSnapshot(row);
    const previousSnapshot = row.last_operational_snapshot;
    if (previousSnapshot && snapshotChanged(previousSnapshot, nextSnapshot)) {
      const event = await admin.from("discount_case_events").insert({
        case_id: caseId,
        event_type: "operational_data_changed",
        note: "Dados operacionais atualizados após novo cruzamento com Pré-fatura/PNR.",
        snapshot: { before: previousSnapshot, after: nextSnapshot },
      });
      if (event.error) throw new Error(`discount_case_events: ${event.error.message}`);
    }
    if (!previousSnapshot || snapshotChanged(previousSnapshot, nextSnapshot)) {
      const synced = await admin.from("discount_cases").update({
        last_operational_snapshot: nextSnapshot,
        last_operational_synced_at: new Date().toISOString(),
      }).eq("id", caseId);
      if (synced.error) throw new Error(`discount_cases: ${synced.error.message}`);
    }
  }
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
        if (!actors.error) {
          for (const actor of actors.data ?? []) actorMap.set(textValue(actor.id), { full_name: textValue(actor.full_name), email: textValue(actor.email) });
        }
      }
      return NextResponse.json({
        row: current,
        events: events.map((event) => ({ ...event, actor: actorMap.get(textValue(event.actor_id)) ?? null })),
      });
    }

    if (url.searchParams.has("lookup")) {
      if (!lookup) return jsonError("Informe um ID de pacote válido.");
      const existingResult = await admin.from("discount_case_current").select("*").eq("shipment_id", lookup).maybeSingle();
      if (existingResult.error) throw new Error(`discount_case_current: ${existingResult.error.message}`);
      const existing = (existingResult.data ?? null) as DbRow | null;
      if (existing) {
        if (!canSeeRow(auth, existing)) return jsonError("Acesso negado para este ID.", 403);
        return NextResponse.json({ existing, match: existing });
      }
      const match = await lookupOperational(admin, lookup);
      if (!match.awaiting_match && !canSeeRow(auth, match)) return jsonError("O ID existe fora do seu escopo operacional.", 403);
      return NextResponse.json({ existing: null, match });
    }

    const result = await admin.from("discount_case_current").select("*").order("updated_at", { ascending: false }).limit(5000);
    if (result.error) throw new Error(`discount_case_current: ${result.error.message}`);
    const rows = ((result.data ?? []) as DbRow[]).filter((row) => canSeeRow(auth, row));
    await syncOperationalChanges(admin, rows);
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

    const existing = await admin.from("discount_cases").select("id").eq("shipment_id", shipmentId).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return jsonError("Este ID já possui direcionamento na Gestão de Descontos.", 409);

    const match = await lookupOperational(admin, shipmentId);
    if (!match.awaiting_match && !canSeeRow(auth, match)) return jsonError("O ID existe fora do seu escopo operacional.", 403);

    const insert = await admin.from("discount_cases").insert({
      shipment_id: shipmentId,
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
      event_type: "created",
      to_direction: direction,
      note: nullableText(body.note),
      actor_id: auth.profile.id,
      snapshot: { match, source: "manual" },
    });
    if (event.error) throw new Error(`discount_case_events: ${event.error.message}`);

    const row = await loadCurrentRow(admin, caseId);
    if (row) {
      const snapshot = operationalSnapshot(row);
      const synced = await admin.from("discount_cases").update({
        last_operational_snapshot: snapshot,
        last_operational_synced_at: new Date().toISOString(),
      }).eq("id", caseId);
      if (synced.error) throw new Error(`discount_cases: ${synced.error.message}`);
    }
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
    if (body.manualAmount !== undefined || body.manual_amount !== undefined) patch.manual_amount = nullableNumber(body.manualAmount ?? body.manual_amount);
    if (body.manualRouteId !== undefined || body.manual_route_id !== undefined) patch.manual_route_id = nullableText(body.manualRouteId ?? body.manual_route_id);
    if (body.manualDate !== undefined || body.manual_date !== undefined) patch.manual_date = nullableDate(body.manualDate ?? body.manual_date);
    if (body.manualDriverId !== undefined || body.manual_driver_id !== undefined) patch.manual_driver_id = nullableText(body.manualDriverId ?? body.manual_driver_id);
    if (body.manualDriverName !== undefined || body.manual_driver_name !== undefined) patch.manual_driver_name = nullableText(body.manualDriverName ?? body.manual_driver_name);
    if (body.manualBaseKey !== undefined || body.manual_base_key !== undefined) patch.manual_base_key = nullableText(body.manualBaseKey ?? body.manual_base_key);
    if (body.manualBaseName !== undefined || body.manual_base_name !== undefined) patch.manual_base_name = nullableText(body.manualBaseName ?? body.manual_base_name);
    if (body.manualSigla !== undefined || body.manual_sigla !== undefined) patch.manual_sigla = nullableText(body.manualSigla ?? body.manual_sigla);

    const updated = await admin.from("discount_cases").update(patch).eq("id", caseId).select("id").single();
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
        before: { direction: before.direction, amount: before.amount, note: before.note, origin: before.origin },
        after: { direction: after.direction, amount: after.amount, note: after.note, origin: after.origin },
      },
    });
    if (eventResult.error) throw new Error(`discount_case_events: ${eventResult.error.message}`);

    const snapshot = operationalSnapshot(after);
    const synced = await admin.from("discount_cases").update({
      last_operational_snapshot: snapshot,
      last_operational_synced_at: new Date().toISOString(),
    }).eq("id", caseId);
    if (synced.error) throw new Error(`discount_cases: ${synced.error.message}`);

    return NextResponse.json({ row: after });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao atualizar direcionamento.", errorStatus(error, 500));
  }
}
