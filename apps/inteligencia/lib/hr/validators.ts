import { z } from "zod";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, LEAVE_STATUSES, LEAVE_TYPES, OCCURRENCE_TYPES, SECULLUM_FIELDS } from "./types";

export const idSchema = z.uuid();
export const dateSchema = z.iso.date();
const optionalText = z.string().trim().max(4000).nullable().optional();
const optionalId = idSchema.nullable().optional();
const optionalDate = dateSchema.nullable().optional();
const name = z.string().trim().min(1).max(160);
export const employeeSchema = z.strictObject({
  employee_code: z.string().trim().min(1).max(80), full_name: name, preferred_name: optionalText,
  corporate_email: z.email().max(254).nullable().optional(), phone: z.string().trim().max(40).nullable().optional(),
  status: z.enum(EMPLOYEE_STATUSES), employment_type: z.enum(EMPLOYMENT_TYPES),
  department_id: optionalId, position_id: optionalId, manager_employee_id: optionalId,
  admission_date: optionalDate, termination_date: optionalDate,
  secullum_employee_code: z.string().trim().min(1).max(80).nullable().optional(), notes: optionalText,
}).refine((v) => !v.admission_date || !v.termination_date || v.termination_date >= v.admission_date, "Desligamento anterior à admissão.")
  .refine((v) => v.status === "TERMINATED" || !v.termination_date, "Data de desligamento exige status desligado.");
export const departmentSchema = z.strictObject({ name, description: optionalText, active: z.boolean() });
export const positionSchema = z.strictObject({ title: name, department_id: idSchema, description: optionalText, active: z.boolean() });
export const leaveSchema = z.strictObject({ employee_id: idSchema, type: z.enum(LEAVE_TYPES), start_date: dateSchema, end_date: dateSchema, status: z.enum(LEAVE_STATUSES), notes: optionalText })
  .refine((v) => v.end_date >= v.start_date, "Fim anterior ao início.");
export const occurrenceSchema = z.strictObject({ employee_id: idSchema, occurrence_date: dateSchema, type: z.enum(OCCURRENCE_TYPES), minutes: z.number().int().min(0).max(1440).nullable().optional(), description: optionalText });
export const contractSchema = z.strictObject({ employee_id: idSchema, contract_type: z.enum(EMPLOYMENT_TYPES), start_date: dateSchema, end_date: optionalDate, weekly_hours: z.number().min(0).max(168).nullable().optional(), status: z.enum(["ACTIVE", "FINISHED", "CANCELED"]), notes: optionalText })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, "Fim anterior ao início.");
export const compensationSchema = z.strictObject({ employee_id: idSchema, effective_from: dateSchema, effective_to: optionalDate, salary_amount: z.number().min(0).max(99999999).nullable(), salary_type: z.enum(["MONTHLY", "HOURLY", "OTHER"]), notes: optionalText })
  .refine((v) => !v.effective_to || v.effective_to >= v.effective_from, "Fim anterior ao início.");
export const documentSchema = z.strictObject({ employee_id: idSchema, category: name, title: name, expires_at: optionalDate, is_sensitive: z.boolean() });
export const mappingSchema = z.partialRecord(z.enum(SECULLUM_FIELDS), z.string().min(1).max(160));
export const employeeFiltersSchema = z.strictObject({ search: z.string().trim().max(160).optional(), status: z.enum(EMPLOYEE_STATUSES).optional(), department_id: idSchema.optional(), position_id: idSchema.optional(), employment_type: z.enum(EMPLOYMENT_TYPES).optional(), offset: z.coerce.number().int().min(0).max(1000000).default(0) });
export const periodFiltersSchema = z.strictObject({ employee_id: idSchema.optional(), start: dateSchema.optional(), end: dateSchema.optional(), offset: z.coerce.number().int().min(0).max(1000000).default(0) })
  .refine((v) => !v.start || !v.end || v.end >= v.start, "Período inválido.");
