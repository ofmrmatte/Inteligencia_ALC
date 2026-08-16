import { NextResponse } from "next/server";
import { canManageUsers, isUserRole, type UserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminBaseScope, assertBaseAccess, isSuperAdminProfile, jsonError, loadKnownDrivers, loadTickets, requirePortalProfile, syncOperationalBasesAndDrivers, textValue } from "@/lib/driver-portal-server";
import { normalizeDriverKey } from "@/lib/driver-portal";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

function toArray(value: unknown) {
  return Array.isArray(value) ? value.map(textValue).filter(Boolean) : typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

export async function GET() {
  try {
    const profile = await requirePortalProfile();
    const allowedBases = await adminBaseScope(profile);
    await syncOperationalBasesAndDrivers();
    const admin = createAdminClient();
    const [drivers, tickets, bases, documents, disputes, assignments, history] = await Promise.all([
      loadKnownDrivers(allowedBases),
      loadTickets({ allowedBases }),
      (allowedBases
        ? admin.from("operational_bases").select("*").in("base_key", allowedBases.length ? allowedBases : ["__none__"])
        : admin.from("operational_bases").select("*")
      ).order("base_name", { ascending: true }),
      (allowedBases
        ? admin.from("driver_payment_documents").select("*,alc_drivers(driver_code,full_name),driver_payment_document_versions(*)").in("base_key", allowedBases.length ? allowedBases : ["__none__"])
        : admin.from("driver_payment_documents").select("*,alc_drivers(driver_code,full_name),driver_payment_document_versions(*)")
      ).order("created_at", { ascending: false }).limit(1000),
      (allowedBases
        ? admin.from("driver_disputes").select("*,alc_drivers(driver_code,full_name),driver_payment_documents(title)").in("base_key", allowedBases.length ? allowedBases : ["__none__"])
        : admin.from("driver_disputes").select("*,alc_drivers(driver_code,full_name),driver_payment_documents(title)")
      ).order("created_at", { ascending: false }).limit(1000),
      isSuperAdminProfile(profile)
        ? admin.from("admin_base_assignments").select("*,profiles(email,full_name),operational_bases(base_name)").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      isSuperAdminProfile(profile)
        ? admin.from("admin_base_assignment_history").select("*,profiles(email,full_name)").order("created_at", { ascending: false }).limit(200)
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [bases, documents, disputes, assignments, history]) if (result.error) throw new Error(result.error.message);
    return NextResponse.json({
      access: { superAdmin: isSuperAdminProfile(profile), canManageUsers: canManageUsers(profile), bases: allowedBases },
      drivers,
      tickets,
      bases: bases.data ?? [],
      documents: documents.data ?? [],
      disputes: disputes.data ?? [],
      assignments: assignments.data ?? [],
      assignmentHistory: history.data ?? [],
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao carregar gestão de motoristas.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requirePortalProfile();
    const admin = createAdminClient();
    const body = (await request.json()) as DbRow;
    const action = textValue(body.action);
    const allowedBases = await adminBaseScope(profile);

    if (action === "driver") {
      const baseKey = textValue(body.baseKey);
      assertBaseAccess(baseKey, allowedBases);
      const driverCode = textValue(body.driverCode) || normalizeDriverKey(body.fullName);
      if (!driverCode || !textValue(body.fullName)) throw new Error("Informe motorista e ID.");
      const { data, error } = await admin.from("alc_drivers").upsert({
        driver_code: driverCode,
        full_name: textValue(body.fullName),
        base_key: baseKey,
        sigla: textValue(body.sigla),
        cpf_last4: textValue(body.cpfLast4).slice(-4),
        activation_code_hash: textValue(body.activationCodeHash),
        portal_login: `${normalizeDriverKey(driverCode).toLowerCase()}@motorista.alc.local`,
        status: textValue(body.status) || "pending_activation",
      }, { onConflict: "driver_code" }).select().single();
      if (error) throw new Error(error.message);
      await admin.from("driver_portal_audit_events").insert({ actor_profile_id: profile.id, action: "driver_upsert", entity_table: "alc_drivers", entity_id: data.id, after_data: data });
      return GET();
    }

    if (action === "assignment") {
      if (!isSuperAdminProfile(profile)) throw new Error("Designação de bases restrita a gestores.");
      const adminId = textValue(body.adminId);
      const baseKeys = toArray(body.baseKeys);
      if (!adminId || baseKeys.length === 0) throw new Error("Informe administrativo e bases.");
      for (const baseKey of baseKeys) {
        const { data, error } = await admin.from("admin_base_assignments").upsert({
          admin_id: adminId,
          base_key: baseKey,
          assigned_by: profile.id,
          active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "admin_id,base_key" }).select().single();
        if (error) throw new Error(error.message);
        await admin.from("admin_base_assignment_history").insert({ assignment_id: data.id, admin_id: adminId, base_key: baseKey, action: "assigned", actor_id: profile.id, after_data: data });
      }
      return GET();
    }

    if (action === "admin") {
      if (!isSuperAdminProfile(profile)) throw new Error("Cadastro administrativo restrito a gestores.");
      const email = textValue(body.email).trim().toLowerCase();
      const password = textValue(body.password);
      const role: UserRole = isUserRole(body.role) && body.role !== "driver" ? body.role : "admin";
      if (!email || password.length < 6) throw new Error("Informe e-mail e senha inicial.");
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: textValue(body.fullName) } });
      if (created.error || !created.data.user) throw new Error(created.error?.message ?? "Usuário não criado.");
      const { error } = await admin.from("profiles").upsert({
        id: created.data.user.id,
        email,
        full_name: textValue(body.fullName) || email,
        role,
        global_access: Boolean(body.globalAccess),
        active: true,
        base_scope: toArray(body.baseKeys),
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      return GET();
    }

    throw new Error("Ação não reconhecida.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao salvar gestão de motoristas.", 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requirePortalProfile();
    const body = (await request.json()) as DbRow;
    const admin = createAdminClient();
    if (textValue(body.action) === "assignment") {
      if (!isSuperAdminProfile(profile)) throw new Error("Designação de bases restrita a gestores.");
      const id = textValue(body.id);
      const active = body.active !== false;
      const { data: before } = await admin.from("admin_base_assignments").select("*").eq("id", id).single();
      const { data, error } = await admin.from("admin_base_assignments").update({ active, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      await admin.from("admin_base_assignment_history").insert({ assignment_id: id, admin_id: data.admin_id, base_key: data.base_key, action: active ? "reactivated" : "removed", actor_id: profile.id, before_data: before, after_data: data });
      return GET();
    }
    throw new Error("Ação não reconhecida.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao alterar gestão de motoristas.", 400);
  }
}
