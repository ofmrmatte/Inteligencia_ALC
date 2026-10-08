import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { HrError, getHrRow, saveHrRow, deleteHrRow } from "./repository";
import { documentSchema } from "./validators";
import type { HrActor } from "./audit";

export const HR_DOCUMENT_BUCKET = "hr-documents";
export const HR_SIGNED_URL_SECONDS = 60;
export function sanitizeHrFilename(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(-120) || "document";
}
async function privateStorage() {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.getBucket(HR_DOCUMENT_BUCKET);
  if (error || !data) throw new HrError(503, "Bucket privado hr-documents indisponível. Configure-o no ambiente de revisão; não é criado automaticamente.");
  if (data.public) throw new HrError(503, "O bucket hr-documents deve ser privado. Operação bloqueada.");
  return admin.storage.from(HR_DOCUMENT_BUCKET);
}
export async function uploadHrDocument(form: FormData, actor: HrActor) {
  const parsed = documentSchema.parse({ employee_id: form.get("employee_id"), title: form.get("title"), category: form.get("category"), expires_at: form.get("expires_at") || null, is_sensitive: form.get("is_sensitive") !== "false" });
  await getHrRow("employees", parsed.employee_id);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) throw new HrError(400, "Documento deve ter entre 1 byte e 10 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const allowed = (file.type === "application/pdf" && bytes.subarray(0, 5).toString() === "%PDF-")
    || (file.type === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    || (file.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255);
  if (!allowed) throw new HrError(400, "Use PDF, PNG ou JPEG com conteúdo compatível com o MIME informado.");
  const storage = await privateStorage();
  const path = `hr/${parsed.employee_id}/${randomUUID()}-${sanitizeHrFilename(file.name)}`;
  const { error } = await storage.upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) throw new HrError(503, "Não foi possível armazenar o documento privado.");
  try {
    const row = await saveHrRow("documents", { ...parsed, storage_path: path, mime_type: file.type, file_size: file.size, uploaded_by: actor.id }, actor);
    return { id: row.id };
  } catch (error) { await storage.remove([path]); throw error; }
}
export async function signHrDocument(id: string, sensitive: boolean) {
  const row = await getHrRow("documents", id);
  if (row.deleted_at) throw new HrError(404, "Documento removido.");
  if (row.is_sensitive && !sensitive) throw new HrError(403, "Documento restrito ao RH administrativo.");
  const storage = await privateStorage();
  const { data, error } = await storage.createSignedUrl(String(row.storage_path), HR_SIGNED_URL_SECONDS, { download: true });
  if (error || !data) throw new HrError(503, "Não foi possível gerar acesso temporário ao documento.");
  return { url: data.signedUrl, expiresIn: HR_SIGNED_URL_SECONDS };
}
export async function removeHrDocument(id: string, actor: HrActor) {
  const storage = await privateStorage();
  const row = await deleteHrRow("documents", id, actor);
  const { error } = await storage.remove([String(row.storage_path)]);
  // Tombstone prevents downloads even if storage cleanup fails; DELETE can be retried.
  return { ok: true, warning: error ? "Documento removido do painel; limpeza do arquivo privado pendente. Repita a remoção para concluir." : null };
}
