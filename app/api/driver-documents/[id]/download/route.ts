import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { adminBaseScope, assertBaseAccess, jsonError, loadDriverByAuthUser, requirePortalProfile, textValue } from "@/lib/driver-portal-server";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("driver_payment_documents")
      .select("*,driver_payment_document_versions(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Documento não encontrado.");
    const doc = data as DbRow;
    const versions = (doc.driver_payment_document_versions as DbRow[] | null) ?? [];
    const version = versions.find((item) => textValue(item.id) === textValue(doc.active_version_id)) ?? versions.find((item) => textValue(item.status) === "active");
    if (!version) throw new Error("Versão ativa não encontrada.");

    let allowed = false;
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const driver = await loadDriverByAuthUser(userData.user.id);
      allowed = Boolean(driver && textValue(driver.id) === textValue(doc.driver_id));
    }
    if (!allowed) {
      const profile = await requirePortalProfile();
      const allowedBases = await adminBaseScope(profile);
      assertBaseAccess(textValue(doc.base_key), allowedBases);
      allowed = true;
    }
    if (!allowed) throw new Error("Acesso negado ao documento.");

    const signed = await admin.storage.from("driver-payments").createSignedUrl(textValue(version.storage_path), 300);
    if (signed.error) throw new Error(signed.error.message);
    await admin.from("driver_portal_audit_events").insert({
      actor_profile_id: userData.user?.id ?? null,
      action: "payment_document_signed_url",
      entity_table: "driver_payment_documents",
      entity_id: id,
      after_data: { versionId: textValue(version.id) },
    });
    return NextResponse.json({ url: signed.data.signedUrl, expiresIn: 300 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao gerar link temporário.", 403);
  }
}
