import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { hasFullAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function DELETE(request: Request) {
  const startedAt = performance.now();
  try {
    const profile = await getCurrentProfile();
    if (!profile) return jsonError("Sessão expirada. Entre novamente.", 401);
    if (!hasFullAccess(profile)) return jsonError("Exclusão restrita a Diretor, ADM ou Desenvolvedor.", 403);

    const batchId = new URL(request.url).searchParams.get("batchId")?.trim();
    if (!batchId) return jsonError("Informe o lote que será excluído.");

    const admin = createAdminClient();
    const lookupStartedAt = performance.now();
    const files = await admin.from("imported_files").select("storage_path").eq("batch_id", batchId);
    if (files.error) throw new Error(`imported_files: ${files.error.message}`);
    const paths = (files.data ?? []).map((row) => String(row.storage_path || "")).filter(Boolean);
    const lookupMs = performance.now() - lookupStartedAt;

    const deleteStartedAt = performance.now();
    const deleted = await admin.from("import_batches").delete().eq("id", batchId).select("id").maybeSingle();
    if (deleted.error) throw new Error(`import_batches: ${deleted.error.message}`);
    if (!deleted.data) return jsonError("Lote não encontrado.", 404);
    const deleteMs = performance.now() - deleteStartedAt;

    let storageWarning = "";
    const storageStartedAt = performance.now();
    if (paths.length) {
      const storage = await admin.storage.from("alc-imports").remove(paths);
      if (storage.error) storageWarning = storage.error.message;
    }
    const storageMs = performance.now() - storageStartedAt;
    const totalMs = performance.now() - startedAt;

    console.info("[imports:delete]", {
      batchId,
      files: paths.length,
      lookupMs: Math.round(lookupMs),
      deleteMs: Math.round(deleteMs),
      storageMs: Math.round(storageMs),
      totalMs: Math.round(totalMs),
      storageWarning: storageWarning || null,
    });

    return NextResponse.json({
      batchId,
      removedFiles: paths.length,
      storageWarning: storageWarning || null,
      timings: {
        lookupMs: Math.round(lookupMs),
        deleteMs: Math.round(deleteMs),
        storageMs: Math.round(storageMs),
        totalMs: Math.round(totalMs),
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao excluir lote.", 500);
  }
}
