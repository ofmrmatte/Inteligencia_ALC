import "server-only";
import type pg from "pg";

export interface HrActor { id: string }
export async function writeHrAudit(client: pg.PoolClient, actor: HrActor, action: string, entity: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const row = after ?? before;
  // Sensitive content stays out of the audit trail; record only references and metadata.
  const redact = (value: Record<string, unknown> | null) => value && Object.fromEntries(Object.entries(value).filter(([key]) => !["salary_amount", "notes", "description", "raw_payload", "storage_path", "error_summary"].includes(key)));
  await client.query(`INSERT INTO hr_audit_log(actor_user_id,action,entity_type,entity_id,employee_id,before_data,after_data)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [actor.id, action, entity, row?.id ?? null,
    entity === "employees" ? row?.id : row?.employee_id ?? null, redact(before), redact(after)]);
}
