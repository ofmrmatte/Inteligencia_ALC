import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ getBucket: vi.fn(), createSignedUrl: vi.fn(), upload: vi.fn(), remove: vi.fn(), from: vi.fn(), getHrRow: vi.fn(), saveHrRow: vi.fn(), deleteHrRow: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { getBucket: state.getBucket, from: state.from } }) }));
vi.mock("@/lib/hr/repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/hr/repository")>();
  return { ...original, getHrRow: state.getHrRow, saveHrRow: state.saveHrRow, deleteHrRow: state.deleteHrRow };
});
import { sanitizeHrFilename, signHrDocument, uploadHrDocument, removeHrDocument } from "@/lib/hr/documents";
const id = "00000000-0000-4000-8000-000000000001";
const actor = { id };
beforeEach(() => {
  vi.clearAllMocks();
  state.getBucket.mockResolvedValue({ data: { public: false }, error: null });
  state.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://synthetic.test/signed/temporary" }, error: null });
  state.from.mockReturnValue({ createSignedUrl: state.createSignedUrl, upload: state.upload, remove: state.remove });
  state.upload.mockResolvedValue({ error: null }); state.remove.mockResolvedValue({ error: null });
  state.getHrRow.mockResolvedValue({ id, employee_id: id, storage_path: `hr/${id}/synthetic.pdf`, is_sensitive: false });
  state.saveHrRow.mockResolvedValue({ id }); state.deleteHrRow.mockResolvedValue({ id, storage_path: `hr/${id}/synthetic.pdf` });
});
function form(content = "%PDF-1.7\nsynthetic", type = "application/pdf") {
  const value = new FormData();
  value.set("employee_id", id); value.set("title", "Documento sintético"); value.set("category", "Contrato");
  value.set("file", new File([content], "../../documento.pdf", { type }));
  return value;
}
describe("RH private documents", () => {
  it("download usa signed URL de 60 segundos em bucket privado", async () => {
    const result = await signHrDocument(id, false);
    expect(state.getBucket).toHaveBeenCalledWith("hr-documents");
    expect(state.createSignedUrl).toHaveBeenCalledWith(`hr/${id}/synthetic.pdf`, 60, { download: true });
    expect(result.expiresIn).toBe(60);
  });
  it("diretor não recebe documento sensível e tombstone não permite download", async () => {
    state.getHrRow.mockResolvedValueOnce({ id, is_sensitive: true });
    await expect(signHrDocument(id, false)).rejects.toMatchObject({ status: 403 });
    state.getHrRow.mockResolvedValueOnce({ id, deleted_at: "2026-10-07" });
    await expect(signHrDocument(id, true)).rejects.toMatchObject({ status: 404 });
    expect(state.createSignedUrl).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: {} }, { data: { public: true }, error: null }])("bucket ausente ou público bloqueia sem criação automática", async (value) => {
    state.getBucket.mockResolvedValue(value);
    await expect(signHrDocument(id, true)).rejects.toMatchObject({ status: 503 });
    expect(state.from).not.toHaveBeenCalled();
  });
  it("upload valida assinatura/MIME, sanitiza path e grava metadados", async () => {
    await uploadHrDocument(form(), actor);
    const [path, bytes, uploadOptions] = state.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^hr/${id}/[0-9a-f-]+-`));
    expect(path).not.toContain("../");
    expect(bytes.toString()).toContain("%PDF-");
    expect(uploadOptions).toMatchObject({ contentType: "application/pdf", upsert: false });
    expect(state.saveHrRow).toHaveBeenCalledWith("documents", expect.objectContaining({ uploaded_by: id, is_sensitive: true, storage_path: path }), actor);
    expect(sanitizeHrFilename("../../documento ç.pdf")).not.toContain("/");
  });
  it("MIME enganoso, documento vazio ou excesso de tamanho são rejeitados", async () => {
    await expect(uploadHrDocument(form("<script>alert(1)</script>"), actor)).rejects.toMatchObject({ status: 400 });
    await expect(uploadHrDocument(form(""), actor)).rejects.toMatchObject({ status: 400 });
    await expect(uploadHrDocument(form("x".repeat(10 * 1024 * 1024 + 1)), actor)).rejects.toMatchObject({ status: 400 });
    expect(state.upload).not.toHaveBeenCalled();
  });
  it("falha SQL após upload tenta remover arquivo órfão", async () => {
    state.saveHrRow.mockRejectedValue(new Error("SQL failed"));
    await expect(uploadHrDocument(form(), actor)).rejects.toThrow("SQL failed");
    expect(state.remove).toHaveBeenCalledWith([state.upload.mock.calls[0][0]]);
  });
  it("remoção marca tombstone auditável antes da limpeza e permite retry", async () => {
    state.remove.mockResolvedValue({ error: { message: "unavailable" } });
    const result = await removeHrDocument(id, actor);
    expect(state.deleteHrRow).toHaveBeenCalledWith("documents", id, actor);
    expect(state.remove).toHaveBeenCalledWith([`hr/${id}/synthetic.pdf`]);
    expect(result.warning).toContain("pendente");
  });
});
