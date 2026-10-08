import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: vi.fn(), commit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/hr/db", () => ({ hrDb: () => ({ query: state.query }), hrTransaction: async (work: (client: unknown) => Promise<unknown>) => { const result = await work({ query: state.query }); state.commit(); return result; } }));
import { listEmployees, listHrRows, saveHrRow, deleteHrRow, hrAudit, importAttendance } from "@/lib/hr/repository";
import { employeeFiltersSchema, periodFiltersSchema } from "@/lib/hr/validators";
import { parseSecullum } from "@/lib/hr/secullum-parser";

const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => { vi.clearAllMocks(); state.query.mockResolvedValue({ rows: [] }); });
describe("RH repository trust boundaries", () => {
  it("colaboradores usam parâmetros e não carregam salário", async () => {
    await listEmployees(employeeFiltersSchema.parse({ search: "' OR TRUE;--" }));
    const [sql, values] = state.query.mock.calls[0];
    expect(sql).not.toContain("' OR TRUE");
    expect(sql).not.toContain("compensation");
    expect(sql).not.toContain("salary");
    expect(values).toEqual(["%' OR TRUE;--%", 0]);
  });
  it("diretor não recebe documentos sensíveis, paths ou auditoria sensível", async () => {
    await listHrRows("documents", periodFiltersSchema.parse({}), false);
    const sql = state.query.mock.calls[0][0];
    expect(sql).toContain("r.is_sensitive=false");
    expect(sql).toContain("r.deleted_at IS NULL");
    expect(sql).not.toContain("storage_path");
    await hrAudit(id, false);
    expect(state.query.mock.calls[1][0]).not.toContain("before_data");
    expect(state.query.mock.calls[1][0]).toContain("entity_type IN");
  });
  it("mutações são auditadas antes do commit sem valores sensíveis", async () => {
    state.query.mockResolvedValueOnce({ rows: [{ id, employee_id: id, salary_amount: "9000", notes: "private", effective_from: "2026-10-07" }] });
    await saveHrRow("compensation", { employee_id: id, salary_amount: 9000, salary_type: "MONTHLY", effective_from: "2026-10-07", created_by: id }, { id });
    const [sql, params] = state.query.mock.calls[1];
    expect(sql).toContain("INSERT INTO hr_audit_log");
    expect(params[6]).not.toHaveProperty("salary_amount");
    expect(params[6]).not.toHaveProperty("notes");
    expect(state.commit).toHaveBeenCalledOnce();
  });
  it("remoção de documento preserva tombstone e audit log", async () => {
    state.query.mockResolvedValueOnce({ rows: [{ id, employee_id: id, storage_path: "hr/synthetic/file.pdf" }] });
    await deleteHrRow("documents", id, { id });
    expect(state.query.mock.calls[0][0]).toContain("SET deleted_at=coalesce");
    expect(state.query.mock.calls[1][0]).toContain("hr_audit_log");
    expect(state.query.mock.calls[1][1][5]).not.toHaveProperty("storage_path");
  });
  it("Secullum vincula apenas matrícula Secullum e guarda rejeições/raw com auditoria", async () => {
    const preview = parseSecullum(new TextEncoder().encode("Matricula;Data;Trabalhadas\nSYNTH-1;2026-10-07;480\nUNKNOWN;2026-10-07;480").buffer, "test.csv");
    state.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT id,secullum")) return { rows: [{ id, secullum_employee_code: "SYNTH-1" }] };
      if (sql.includes("INSERT INTO hr_time_import_batches")) return { rows: [{ id }] };
      if (sql.includes("INSERT INTO hr_attendance_daily")) return { rows: [{ id, employee_id: id }] };
      return { rows: [] };
    });
    const result = await importAttendance(preview, "test.csv", "synthetic-hash", { id });
    expect(result).toMatchObject({ accepted: 1, rejected: 1, total: 2 });
    const queries = state.query.mock.calls.map((c) => c[0]);
    expect(queries[0]).toContain("WHERE secullum_employee_code=ANY");
    expect(queries.filter((sql) => sql.includes("INSERT INTO hr_time_entries_raw"))).toHaveLength(2);
    expect(queries.filter((sql) => sql.includes("INSERT INTO hr_audit_log"))).toHaveLength(2);
    expect(queries.find((sql) => sql.includes("INSERT INTO hr_attendance_daily"))).toContain("ON CONFLICT(employee_id,attendance_date)");
    expect(queries.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
  });
});
