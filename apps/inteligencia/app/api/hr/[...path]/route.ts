import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth-server";
import { canAccessHr, canManageHr, canReadSensitiveHr, canManageHrDocuments, canImportSecullum } from "@/lib/hr/permissions";
import { HrError, getHrRow, saveHrRow, deleteHrRow, listEmployees, listHrRows, attendance, overview, hrAudit, importAttendance, validateSecullumLinks, type HrResource } from "@/lib/hr/repository";
import { employeeSchema, employeeFiltersSchema, departmentSchema, positionSchema, leaveSchema, occurrenceSchema, contractSchema, compensationSchema, idSchema, periodFiltersSchema, mappingSchema } from "@/lib/hr/validators";
import { parseSecullum } from "@/lib/hr/secullum-parser";
import { uploadHrDocument, signHrDocument, removeHrDocument, sanitizeHrFilename } from "@/lib/hr/documents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
const schemas = { employees: employeeSchema, departments: departmentSchema, positions: positionSchema, leave: leaveSchema, occurrences: occurrenceSchema, contracts: contractSchema, compensation: compensationSchema };
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });

async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) throw new HrError(413, "Arquivo ou requisição muito grande.");
  const reader = request.body?.getReader();
  if (!reader) throw new HrError(400, "Corpo da requisição ausente.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new HrError(413, "Arquivo ou requisição muito grande."); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function formData(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new HrError(400, "Envie arquivo e metadados como multipart/form-data.");
  const body = await boundedBody(request, 11 * 1024 * 1024);
  try { return await new Response(new Uint8Array(body), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new HrError(400, "Formulário inválido."); }
}
async function jsonBody(request: Request) {
  try { return JSON.parse((await boundedBody(request, 64000)).toString()); }
  catch (error) { if (error instanceof HrError) throw error; throw new HrError(400, "JSON inválido."); }
}
async function handle(request: Request, context: Context) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) throw new HrError(401, "Sessão expirada. Entre novamente.");
    if (!canAccessHr(profile)) throw new HrError(403, "Acesso ao RH não autorizado.");
    const { path } = await context.params;
    const [resource, id, action] = path;
    const method = request.method;
    const sensitive = canReadSensitiveHr(profile);
    if (method !== "GET" && !canManageHr(profile)) throw new HrError(403, "Alterações restritas ao RH administrativo.");
    if (resource === "compensation" && !sensitive) throw new HrError(403, "Remuneração restrita ao RH administrativo.");
    if (path.length > 3) throw new HrError(404, "Rota RH não encontrada.");
    const query = Object.fromEntries(new URL(request.url).searchParams);
    if (method === "GET" && path.length === 1 && resource === "overview") return response(await overview(sensitive));
    if (method === "GET" && path.length === 1 && resource === "attendance") return response(await attendance(periodFiltersSchema.parse(query)));
    if (method === "GET" && path.length === 1 && resource === "audit") {
      const filter = periodFiltersSchema.parse(query);
      if (!sensitive && !filter.employee_id) throw new HrError(403, "Histórico geral restrito ao RH administrativo.");
      return response(await hrAudit(filter.employee_id, sensitive, filter.offset));
    }
    if (method === "POST" && path.length === 2 && resource === "attendance" && id === "import") {
      if (!canImportSecullum(profile)) throw new HrError(403, "Importação Secullum não autorizada.");
      const form = await formData(request);
      const file = form.get("file");
      if (!(file instanceof File)) throw new HrError(400, "Selecione um arquivo Secullum.");
      let mapping;
      try { mapping = form.get("mapping") ? mappingSchema.parse(JSON.parse(String(form.get("mapping")))) : undefined; }
      catch { throw new HrError(400, "Mapeamento de colunas inválido."); }
      const bytes = await file.arrayBuffer();
      let preview;
      try { preview = parseSecullum(bytes, file.name, mapping); }
      catch (error) { throw new HrError(400, error instanceof Error ? error.message : "Arquivo inválido."); }
      if (preview.missing.length) {
        if (form.get("mode") !== "preview") throw new HrError(400, "Mapeie matrícula, data e horas trabalhadas antes de importar.");
      } else await validateSecullumLinks(preview);
      if (form.get("mode") === "preview") return response({ ...preview, rows: preview.rows.slice(0, 50), total: preview.rows.length,
        accepted: preview.rows.filter((r) => r.entry && !r.error).length, rejected: preview.rows.filter((r) => r.error).length });
      const result = await importAttendance(preview, sanitizeHrFilename(file.name), createHash("sha256").update(Buffer.from(bytes)).digest("hex"), profile);
      return response(result, 201);
    }
    if (resource === "documents") {
      if (method === "GET" && path.length === 1) return response(await listHrRows("documents", periodFiltersSchema.parse(query), sensitive));
      if (method === "GET" && path.length === 3 && action === "download") return response(await signHrDocument(idSchema.parse(id), sensitive));
      if (!canManageHrDocuments(profile)) throw new HrError(403, "Gestão de documentos não autorizada.");
      if (method === "POST" && path.length === 1) return response(await uploadHrDocument(await formData(request), profile), 201);
      if (method === "DELETE" && path.length === 2) return response(await removeHrDocument(idSchema.parse(id), profile));
      throw new HrError(404, "Rota de documentos não encontrada.");
    }
    if (!Object.hasOwn(schemas, resource)) throw new HrError(404, "Rota RH não encontrada.");
    const entity = resource as keyof typeof schemas;
    const schema = schemas[entity];
    if (method === "GET" && path.length === 1) return response(entity === "employees"
      ? await listEmployees(employeeFiltersSchema.parse(query)) : await listHrRows(entity, periodFiltersSchema.parse(query), sensitive));
    if (method === "GET" && path.length === 2 && entity === "employees") return response(await getHrRow(entity, idSchema.parse(id)));
    if (method === "DELETE" && path.length === 2 && entity === "occurrences") return response(await deleteHrRow(entity, idSchema.parse(id), profile));
    if ((method === "POST" && path.length === 1) || (method === "PATCH" && path.length === 2)) {
      const key = id ? idSchema.parse(id) : undefined;
      const input = await jsonBody(request);
      const original = key ? await getHrRow(entity, key) : null;
      const version = request.headers.get("if-match");
      if (key && version && version !== JSON.stringify(String(original?.updated_at))) throw new HrError(409, "Registro alterado em outra sessão. Recarregue e revise antes de salvar.");
      const initial = original ? Object.fromEntries(Object.keys(schema.shape).map((k) => [k, original[k]])) : {};
      for (const numeric of ["salary_amount", "weekly_hours"]) if (initial[numeric] != null) initial[numeric] = Number(initial[numeric]);
      if (!input || Array.isArray(input) || typeof input !== "object") throw new HrError(400, "Payload inválido.");
      const parsed = schema.parse({ ...initial, ...input });
      const data: Record<string, unknown> = { ...parsed };
      if (original?.employee_id && data.employee_id !== original.employee_id) throw new HrError(409, "Um registro existente não pode ser transferido para outro colaborador.");
      if (entity === "employees" && key && data.manager_employee_id === key) throw new HrError(400, "Colaborador não pode ser seu próprio gestor.");
      if (!key && ["leave", "occurrences", "compensation"].includes(entity)) data.created_by = profile.id;
      return response(await saveHrRow(entity as HrResource, data, profile, key, original?.updated_at ? String(original.updated_at) : undefined), key ? 200 : 201);
    }
    throw new HrError(405, "Método não permitido nesta rota.");
  } catch (error) {
    if (error instanceof HrError) return response({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return response({ error: "Campos inválidos.", fields: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) }, 400);
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "23505") return response({ error: "Registro, vínculo ativo ou arquivo já cadastrado. Revise os dados." }, 409);
    if (["23503", "23514", "22P02"].includes(String(code))) return response({ error: "Vínculo ou valor inválido. Confira setor, cargo, colaborador e datas." }, 400);
    if (error instanceof Error && error.message === "HR_DATABASE_UNAVAILABLE") return response({ error: "Banco de Recursos Humanos ainda não configurado." }, 503);
    if (code === "42P01") return response({ error: "Schema de Recursos Humanos ainda não configurado no Postgres-RH." }, 503);
    return response({ error: "Não foi possível concluir a operação RH. Tente novamente ou contate o administrador." }, 500);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
