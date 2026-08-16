import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, textValue } from "@/lib/driver-portal-server";
import { normalizeDriverKey, sha256Bytes } from "@/lib/driver-portal";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

async function hashText(value: string) {
  return sha256Bytes(new TextEncoder().encode(value.trim().toUpperCase()));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DbRow;
    const driverCode = normalizeDriverKey(body.driverCode);
    const baseKey = textValue(body.baseKey).trim();
    const confirmation = textValue(body.confirmation).trim();
    const password = textValue(body.password);
    if (!driverCode || !baseKey || !confirmation || password.length < 6) {
      throw new Error("Informe ID, base, confirmação segura e senha/PIN com pelo menos 6 caracteres.");
    }

    const admin = createAdminClient();
    const { data: driver, error } = await admin
      .from("alc_drivers")
      .select("*")
      .eq("driver_code", driverCode)
      .eq("base_key", baseKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!driver) throw new Error("Motorista não encontrado para a base informada.");

    const row = driver as DbRow;
    const cpfLast4 = textValue(row.cpf_last4);
    const activationHash = textValue(row.activation_code_hash);
    const confirmationHash = await hashText(confirmation);
    const validConfirmation = (cpfLast4 && confirmation.endsWith(cpfLast4)) || (activationHash && confirmationHash === activationHash);
    if (!validConfirmation) throw new Error("Confirmação segura inválida.");

    const email = textValue(row.portal_login) || `${driverCode.toLowerCase()}@motorista.alc.local`;
    let authUserId = textValue(row.auth_user_id);
    if (!authUserId) {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: textValue(row.full_name), driver_code: driverCode } });
      if (created.error || !created.data.user) throw new Error(created.error?.message ?? "Falha ao ativar acesso.");
      authUserId = created.data.user.id;
    } else {
      const updated = await admin.auth.admin.updateUserById(authUserId, { password, email_confirm: true });
      if (updated.error) throw new Error(updated.error.message);
    }

    const profile = await admin.from("profiles").upsert({
      id: authUserId,
      email,
      full_name: textValue(row.full_name),
      role: "driver",
      global_access: false,
      active: true,
      base_scope: [baseKey],
      sigla_scope: [textValue(row.sigla)].filter(Boolean),
      updated_at: new Date().toISOString(),
    });
    if (profile.error) throw new Error(profile.error.message);

    const updatedDriver = await admin.from("alc_drivers").update({
      auth_user_id: authUserId,
      portal_login: email,
      status: "active",
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", textValue(row.id));
    if (updatedDriver.error) throw new Error(updatedDriver.error.message);
    await admin.from("driver_portal_audit_events").insert({ actor_driver_id: textValue(row.id), action: "driver_activation", entity_table: "alc_drivers", entity_id: textValue(row.id), after_data: { driverCode, baseKey } });
    return NextResponse.json({ ok: true, login: email });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao ativar acesso do motorista.", 400);
  }
}
