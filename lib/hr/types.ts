export const EMPLOYEE_STATUSES = ["ACTIVE", "LEAVE", "TERMINATED"] as const;
export const EMPLOYMENT_TYPES = ["CLT", "PJ", "ESTAGIO", "APRENDIZ", "OUTRO"] as const;
export const OCCURRENCE_TYPES = ["HOME_OFFICE", "ABSENCE", "MEDICAL_LEAVE", "LATE", "EXTRA_HOURS", "DAY_OFF", "OTHER"] as const;
export const LEAVE_TYPES = ["VACATION", "MEDICAL", "LICENSE", "OTHER"] as const;
export const LEAVE_STATUSES = ["PLANNED", "APPROVED", "ACTIVE", "FINISHED", "CANCELED"] as const;
export type HrRow = Record<string, string | number | boolean | null>;
export interface HrEmployee extends HrRow {
  id: string; employee_code: string; full_name: string;
  status: typeof EMPLOYEE_STATUSES[number]; employment_type: typeof EMPLOYMENT_TYPES[number];
  department_id: string | null; position_id: string | null;
}
export interface HrOverview {
  kpis: Record<string, number>;
  departments: HrRow[]; employmentTypes: HrRow[]; movements: HrRow[];
  upcomingLeave: HrRow[]; attendanceAlerts: HrRow[]; expiringDocuments: HrRow[];
}
export const SECULLUM_FIELDS = ["employee_code", "date", "worked_minutes", "expected_minutes", "first_entry", "last_exit", "late_minutes", "extra_minutes", "absence", "divergence"] as const;
export type SecullumField = typeof SECULLUM_FIELDS[number];
export type ColumnMapping = Partial<Record<SecullumField, string>>;
export interface AttendanceInput {
  employee_code: string; attendance_date: string; first_entry: string | null; last_exit: string | null;
  worked_minutes: number; expected_minutes: number | null; late_minutes: number;
  extra_minutes: number; absence: boolean; divergence: boolean;
}
export interface SecullumRow {
  rowNumber: number; raw: Record<string, string | number | boolean | null>;
  entry: AttendanceInput | null; error: string | null;
}
export interface SecullumPreview {
  columns: string[]; mapping: ColumnMapping; missing: string[]; rows: SecullumRow[];
}
