import "server-only";
import { hrDb, hrTransaction } from "./db";
import { writeHrAudit, type HrActor } from "./audit";
import type { HrRow, HrOverview, SecullumPreview } from "./types";
import type { z } from "zod";
import { employeeFiltersSchema, periodFiltersSchema } from "./validators";

export class HrError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const HR_TABLES = {
  employees: "hr_employees", departments: "hr_departments", positions: "hr_positions", leave: "hr_leave",
  occurrences: "hr_occurrences", contracts: "hr_contracts", compensation: "hr_compensation_history", documents: "hr_documents",
} as const;
export type HrResource = keyof typeof HR_TABLES;
const DATE_COLUMNS: Partial<Record<HrResource, string[]>> = {
  employees: ["admission_date", "termination_date"], leave: ["start_date", "end_date"],
  occurrences: ["occurrence_date"], contracts: ["start_date", "end_date"],
  compensation: ["effective_from", "effective_to"], documents: ["expires_at"],
};
const dates = (resource: HrResource, alias: string) => (DATE_COLUMNS[resource] ?? []).map((column) => `,${alias}.${column}::text AS ${column}`).join("");
const TODAY = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

export async function getHrRow(resource: HrResource, id: string) {
  const { rows } = await hrDb().query<HrRow>(`SELECT r.*${dates(resource, "r")}${resource !== "documents" ? ",(r.updated_at AT TIME ZONE 'UTC')::text AS updated_at" : ""} FROM ${HR_TABLES[resource]} r WHERE r.id=$1`, [id]);
  if (!rows[0]) throw new HrError(404, "Registro não encontrado.");
  return rows[0];
}
export async function saveHrRow(resource: HrResource, data: Record<string, unknown>, actor: HrActor, id?: string, expectedUpdatedAt?: string) {
  // Callers pass only strict-schema parsed payloads, never raw request keys.
  return hrTransaction(async (client) => {
    const table = HR_TABLES[resource];
    const before = id ? (await client.query(`SELECT *${resource !== "documents" ? ",(updated_at AT TIME ZONE 'UTC')::text AS updated_at" : ""} FROM ${table} WHERE id=$1 FOR UPDATE`, [id])).rows[0] : null;
    if (id && !before) throw new HrError(404, "Registro não encontrado.");
    if (expectedUpdatedAt && String(before.updated_at) !== expectedUpdatedAt) throw new HrError(409, "Registro alterado em outra sessão. Recarregue e revise antes de salvar.");
    const fields = Object.keys(data);
    const values = Object.values(data);
    if (!fields.length || fields.some((key) => !/^[a-z_]+$/.test(key))) throw new HrError(400, "Campos inválidos.");
    const updated = resource !== "documents";
    const { rows } = id
      ? await client.query(`UPDATE ${table} SET ${fields.map((key, i) => `${key}=$${i + 1}`).join(",")}${updated ? ",updated_at=now()" : ""} WHERE id=$${fields.length + 1} RETURNING *`, [...values, id])
      : await client.query(`INSERT INTO ${table}(${fields.join(",")}) VALUES(${fields.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`, values);
    await writeHrAudit(client, actor, id ? "UPDATE" : "CREATE", resource, before, rows[0]);
    return rows[0] as HrRow;
  });
}
export async function deleteHrRow(resource: "documents" | "occurrences", id: string, actor: HrActor) {
  return hrTransaction(async (client) => {
    const { rows } = await client.query(resource === "documents"
      ? "UPDATE hr_documents SET deleted_at=coalesce(deleted_at,now()) WHERE id=$1 RETURNING *"
      : "DELETE FROM hr_occurrences WHERE id=$1 RETURNING *", [id]);
    if (!rows[0]) throw new HrError(404, "Registro não encontrado.");
    await writeHrAudit(client, actor, "DELETE", resource, rows[0], null);
    return rows[0] as HrRow;
  });
}
export async function listEmployees(filters: z.infer<typeof employeeFiltersSchema>) {
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.search) { values.push(`%${filters.search}%`); where.push(`(e.full_name ILIKE $${values.length} OR e.employee_code ILIKE $${values.length})`); }
  for (const key of ["status", "department_id", "position_id", "employment_type"] as const) {
    if (filters[key]) { values.push(filters[key]); where.push(`e.${key}=$${values.length}`); }
  }
  const { rows } = await hrDb().query<HrRow>(`SELECT e.*${dates("employees", "e")},(e.updated_at AT TIME ZONE 'UTC')::text AS updated_at,d.name AS department_name,p.title AS position_title,count(*) OVER()::int AS total
    FROM hr_employees e LEFT JOIN hr_departments d ON d.id=e.department_id LEFT JOIN hr_positions p ON p.id=e.position_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY e.full_name,e.id LIMIT 100 OFFSET $${values.length + 1}`, [...values, filters.offset]);
  return { rows, total: Number(rows[0]?.total ?? 0), limit: 100 };
}
export async function listHrRows(resource: HrResource, filters: z.infer<typeof periodFiltersSchema>, sensitive: boolean) {
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.employee_id && !["employees", "departments", "positions"].includes(resource)) { values.push(filters.employee_id); where.push(`r.employee_id=$${values.length}`); }
  if (resource === "documents" && !sensitive) where.push("r.is_sensitive=false");
  if (resource === "documents") where.push("r.deleted_at IS NULL");
  const dateColumn = resource === "leave" ? "start_date" : resource === "occurrences" ? "occurrence_date" : null;
  if (dateColumn) {
    if (filters.start) { values.push(filters.start); where.push(`r.${resource === "leave" ? "end_date" : dateColumn} >= $${values.length}::date`); }
    if (filters.end) { values.push(filters.end); where.push(`r.${dateColumn} <= $${values.length}::date`); }
  }
  const employeeJoin = !["employees", "departments", "positions"].includes(resource);
  // Paths and uploader identifiers are not part of document listings.
  const projection = resource === "documents" ? "r.id,r.employee_id,r.category,r.title,r.mime_type,r.file_size,r.is_sensitive,r.created_at" : "r.*";
  const { rows } = await hrDb().query<HrRow>(`SELECT ${projection}${dates(resource, "r")}${resource !== "documents" ? ",(r.updated_at AT TIME ZONE 'UTC')::text AS updated_at" : ""}${employeeJoin ? ",e.full_name AS employee_name" : ""},count(*) OVER()::int AS total
    FROM ${HR_TABLES[resource]} r ${employeeJoin ? "JOIN hr_employees e ON e.id=r.employee_id" : ""}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.created_at DESC,r.id LIMIT 100 OFFSET $${values.length + 1}`, [...values, filters.offset]);
  return { rows, total: Number(rows[0]?.total ?? 0), limit: 100 };
}
export async function attendance(filters: z.infer<typeof periodFiltersSchema>) {
  const start = filters.start ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const end = filters.end ?? start;
  const values = [start, end, filters.employee_id ?? null];
  const daily = `WITH manual AS (
      SELECT employee_id,occurrence_date,bool_or(type='HOME_OFFICE') AS home_office,bool_or(type='ABSENCE') AS absence,
        bool_or(type='MEDICAL_LEAVE') AS medical_leave,bool_or(type='DAY_OFF') AS day_off,
        max(minutes) FILTER(WHERE type='LATE') AS late_minutes,max(minutes) FILTER(WHERE type='EXTRA_HOURS') AS extra_minutes
      FROM hr_occurrences WHERE occurrence_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR employee_id=$3)
      GROUP BY employee_id,occurrence_date
    ), days AS (
      SELECT employee_id,attendance_date FROM hr_attendance_daily WHERE attendance_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR employee_id=$3)
      UNION SELECT employee_id,occurrence_date FROM manual
    ), daily AS (
      SELECT coalesce(a.id::text,days.employee_id::text||':'||days.attendance_date::text) AS id,days.employee_id,days.attendance_date,
        a.first_entry,a.last_exit,a.worked_minutes,a.expected_minutes,
        greatest(coalesce(a.late_minutes,0),coalesce(m.late_minutes,0)) AS late_minutes,
        greatest(coalesce(a.extra_minutes,0),coalesce(m.extra_minutes,0)) AS extra_minutes,
        (coalesce(a.absence,false) OR coalesce(m.absence,false)) AS absence,
        coalesce(a.divergence,false) AS divergence,coalesce(m.home_office,false) AS home_office,
        coalesce(m.medical_leave,false) AS medical_leave,coalesce(m.day_off,false) AS day_off,
        e.full_name AS employee_name,e.employee_code
      FROM days JOIN hr_employees e ON e.id=days.employee_id
      LEFT JOIN hr_attendance_daily a ON a.employee_id=days.employee_id AND a.attendance_date=days.attendance_date
      LEFT JOIN manual m ON m.employee_id=days.employee_id AND m.occurrence_date=days.attendance_date
    )`;
  const { rows } = await hrDb().query<HrRow>(`${daily} SELECT a.*,a.attendance_date::text,count(*) OVER()::int AS total
    FROM daily a ORDER BY a.attendance_date DESC,a.employee_name,a.id LIMIT 100 OFFSET $4`, [...values, filters.offset]);
  const { rows: kpis } = await hrDb().query(`${daily} SELECT count(*) FILTER(WHERE (worked_minutes>0 OR home_office) AND NOT absence)::int AS present,
    count(*) FILTER(WHERE late_minutes>0)::int AS late,count(*) FILTER(WHERE absence)::int AS absence,
    count(*) FILTER(WHERE divergence)::int AS divergence,coalesce(sum(extra_minutes),0)::int AS extra FROM daily`, values);
  return { rows, kpis: kpis[0], total: Number(rows[0]?.total ?? 0), limit: 100 };
}
export async function hrAudit(employeeId?: string, sensitive = true, offset = 0) {
  const projection = sensitive ? "*" : "id,action,entity_type,employee_id,created_at";
  const { rows } = await hrDb().query<HrRow>(`SELECT ${projection},count(*) OVER()::int AS total FROM hr_audit_log
    WHERE ($1::uuid IS NULL OR employee_id=$1) ${sensitive ? "" : "AND entity_type IN ('employees','leave','contracts','occurrences')"}
    ORDER BY created_at DESC,id LIMIT 100 OFFSET $2`, [employeeId ?? null, offset]);
  return { rows, total: Number(rows[0]?.total ?? 0), limit: 100 };
}
export async function overview(sensitive: boolean): Promise<HrOverview> {
  const db = hrDb();
  const { rows } = await db.query(`SELECT
    (SELECT count(*) FROM hr_employees WHERE status='ACTIVE')::int AS active,
    (SELECT count(*) FROM (SELECT id AS employee_id FROM hr_employees WHERE status='LEAVE'
      UNION SELECT employee_id FROM hr_leave WHERE type IN ('MEDICAL','LICENSE') AND status IN ('APPROVED','ACTIVE') AND ${TODAY} BETWEEN start_date AND end_date) away)::int AS leave,
    (SELECT count(*) FROM hr_employees WHERE admission_date >= date_trunc('month',${TODAY}) AND admission_date <= ${TODAY})::int AS admissions,
    (SELECT count(DISTINCT employee_id) FROM hr_leave WHERE type='VACATION' AND status IN ('APPROVED','ACTIVE') AND ${TODAY} BETWEEN start_date AND end_date)::int AS vacation,
    (SELECT count(DISTINCT employee_id) FROM hr_occurrences WHERE type='HOME_OFFICE' AND occurrence_date=${TODAY})::int AS home_office,
    (SELECT count(*) FROM (SELECT employee_id FROM hr_attendance_daily WHERE attendance_date=${TODAY} AND absence
      UNION SELECT employee_id FROM hr_occurrences WHERE occurrence_date=${TODAY} AND type='ABSENCE') missing)::int AS absence,
    (SELECT count(*) FROM (SELECT employee_id FROM hr_attendance_daily WHERE attendance_date=${TODAY} AND late_minutes>0
      UNION SELECT employee_id FROM hr_occurrences WHERE occurrence_date=${TODAY} AND type='LATE' AND minutes>0) delayed)::int AS late,
    (SELECT count(*) FROM hr_attendance_daily WHERE attendance_date=${TODAY} AND divergence)::int AS divergence`);
  const departments = (await db.query<HrRow>(`SELECT coalesce(d.name,'Sem setor') AS label,count(*)::int AS count FROM hr_employees e LEFT JOIN hr_departments d ON d.id=e.department_id WHERE e.status='ACTIVE' GROUP BY d.name ORDER BY count DESC`)).rows;
  const employmentTypes = (await db.query<HrRow>("SELECT coalesce(employment_type,'Sem vínculo') AS label,count(*)::int AS count FROM hr_employees WHERE status='ACTIVE' GROUP BY employment_type ORDER BY count DESC")).rows;
  const upcomingLeave = (await db.query<HrRow>(`SELECT l.id,l.type,l.status,l.start_date::text,l.end_date::text,e.full_name AS employee_name FROM hr_leave l JOIN hr_employees e ON e.id=l.employee_id
    WHERE l.status IN ('PLANNED','APPROVED','ACTIVE') AND l.end_date >= ${TODAY} AND l.start_date <= ${TODAY}+30 ORDER BY l.start_date LIMIT 20`)).rows;
  const attendanceAlerts = (await db.query<HrRow>(`SELECT e.id,${TODAY}::text AS attendance_date,
    (coalesce(a.absence,false) OR coalesce(o.absence,false)) AS absence,coalesce(a.divergence,false) AS divergence,
    greatest(coalesce(a.late_minutes,0),coalesce(o.late_minutes,0)) AS late_minutes,e.full_name AS employee_name
    FROM hr_employees e LEFT JOIN hr_attendance_daily a ON a.employee_id=e.id AND a.attendance_date=${TODAY}
    LEFT JOIN (SELECT employee_id,bool_or(type='ABSENCE') AS absence,max(minutes) FILTER(WHERE type='LATE') AS late_minutes
      FROM hr_occurrences WHERE occurrence_date=${TODAY} GROUP BY employee_id) o ON o.employee_id=e.id
    WHERE a.absence OR o.absence OR a.divergence OR a.late_minutes>0 OR o.late_minutes>0 ORDER BY e.full_name LIMIT 20`)).rows;
  const expiringDocuments = (await db.query<HrRow>(`SELECT d.id,d.title,d.expires_at::text,e.full_name AS employee_name FROM hr_documents d JOIN hr_employees e ON e.id=d.employee_id WHERE d.deleted_at IS NULL AND d.expires_at BETWEEN ${TODAY} AND ${TODAY}+30 AND ($1::boolean OR NOT d.is_sensitive) ORDER BY d.expires_at LIMIT 20`, [sensitive])).rows;
  const movements = (await db.query<HrRow>(`SELECT a.id,a.action,a.entity_type,a.created_at,e.full_name AS employee_name FROM hr_audit_log a LEFT JOIN hr_employees e ON e.id=a.employee_id WHERE a.entity_type IN ('employees','leave','contracts','occurrences') ORDER BY a.created_at DESC LIMIT 20`)).rows;
  return { kpis: rows[0], departments, employmentTypes, upcomingLeave, attendanceAlerts, expiringDocuments, movements };
}
export async function validateSecullumLinks(preview: SecullumPreview) {
  const codes = [...new Set(preview.rows.flatMap((r) => r.entry ? [r.entry.employee_code] : []))];
  const { rows } = await hrDb().query<{ id: string; secullum_employee_code: string }>("SELECT id,secullum_employee_code FROM hr_employees WHERE secullum_employee_code=ANY($1::text[])", [codes]);
  const employees = new Map(rows.map((r) => [r.secullum_employee_code, r.id]));
  for (const row of preview.rows) if (row.entry && !employees.has(row.entry.employee_code)) row.error = "Matrícula Secullum sem colaborador vinculado.";
  return employees;
}
export async function importAttendance(preview: SecullumPreview, filename: string, hash: string, actor: HrActor) {
  const employees = await validateSecullumLinks(preview);
  return hrTransaction(async (client) => {
    // ponytail: serialize rare daily imports; per-employee locks if import throughput grows.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('alc-hr-attendance-import'))");
    const accepted = preview.rows.filter((r) => r.entry && !r.error).length;
    const summary = preview.rows.filter((r) => r.error).map((r) => ({ row: r.rowNumber, error: r.error }));
    const { rows: [batch] } = await client.query(`INSERT INTO hr_time_import_batches(original_filename,file_hash,imported_by,status,total_rows,accepted_rows,rejected_rows,error_summary)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [filename, hash, actor.id, accepted === preview.rows.length ? "COMPLETED" : accepted ? "PARTIAL" : "REJECTED", preview.rows.length, accepted, summary.length, JSON.stringify(summary)]);
    for (const row of preview.rows) {
      await client.query(`INSERT INTO hr_time_entries_raw(batch_id,row_number,employee_code,raw_payload,normalized,error_message) VALUES($1,$2,$3,$4,$5,$6)`, [batch.id, row.rowNumber, row.entry?.employee_code ?? null, row.raw, Boolean(row.entry && !row.error), row.error]);
      if (!row.entry || row.error) continue;
      const e = row.entry;
      const employeeId = employees.get(e.employee_code);
      const before = (await client.query("SELECT * FROM hr_attendance_daily WHERE employee_id=$1 AND attendance_date=$2 FOR UPDATE", [employeeId, e.attendance_date])).rows[0] ?? null;
      const { rows: [after] } = await client.query(`INSERT INTO hr_attendance_daily(employee_id,attendance_date,first_entry,last_exit,worked_minutes,expected_minutes,late_minutes,extra_minutes,absence,divergence,source_batch_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(employee_id,attendance_date) DO UPDATE SET
        first_entry=excluded.first_entry,last_exit=excluded.last_exit,worked_minutes=excluded.worked_minutes,expected_minutes=excluded.expected_minutes,
        late_minutes=excluded.late_minutes,extra_minutes=excluded.extra_minutes,absence=excluded.absence,divergence=excluded.divergence,source_batch_id=excluded.source_batch_id,updated_at=now() RETURNING *`,
      [employeeId, e.attendance_date, e.first_entry, e.last_exit, e.worked_minutes, e.expected_minutes, e.late_minutes, e.extra_minutes, e.absence, e.divergence, batch.id]);
      await writeHrAudit(client, actor, "IMPORT", "attendance", before, after);
    }
    await writeHrAudit(client, actor, "IMPORT", "time_import_batches", null, batch);
    return { id: batch.id, total: preview.rows.length, accepted, rejected: summary.length, errors: summary };
  });
}
