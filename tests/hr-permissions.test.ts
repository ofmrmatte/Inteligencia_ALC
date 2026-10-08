import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canAccessHr, canManageHr, canReadSensitiveHr, canManageHrDocuments, canImportSecullum } from "@/lib/hr/permissions";
import { canAccessSection, canAccessOperationalData, modulesForProfile, roleModuleCap } from "@/lib/access-control";
import { NAVIGATION, SECTION_IDS, SECTION_META } from "@/lib/navigation";
import { employeeSchema } from "@/lib/hr/validators";
import type { UserRole } from "@/lib/auth";

describe("RH authorization and isolation", () => {
  it("seção RH existe em navegação, metadados e router", () => {
    expect(SECTION_IDS).toContain("rh");
    expect(NAVIGATION.find((n) => n.id === "rh")).toMatchObject({ label: "Recursos Humanos", shortLabel: "RH", href: "/rh", group: "Administração" });
    expect(SECTION_META.rh.title).toBe("Recursos Humanos");
    expect(readFileSync("components/views/view-router.tsx", "utf8")).toContain('case "rh": return <HrView profile={profile} />');
  });
  it.each<UserRole>(["loss_supervisor", "loss_admin", "coordinator", "supervisor", "driver"])("%s não herda RH do acesso operacional", (role) => {
    const profile = { role, moduleScope: ["rh"], globalAccess: true };
    expect(canAccessHr(profile)).toBe(false);
    expect(canAccessSection(profile, "rh")).toBe(false);
    expect(modulesForProfile(profile)).not.toContain("rh");
    expect(roleModuleCap(role)).not.toContain("rh");
  });
  it.each<UserRole>(["developer", "super_admin", "administration_supervisor", "admin"])("%s possui RH completo", (role) => {
    const profile = { role, moduleScope: [] };
    for (const permission of [canAccessHr, canManageHr, canReadSensitiveHr, canManageHrDocuments, canImportSecullum]) expect(permission(profile)).toBe(true);
    expect(canAccessSection(profile, "rh")).toBe(true);
    if (["admin", "administration_supervisor"].includes(role)) expect(canAccessOperationalData(profile)).toBe(false);
  });
  it("director consulta sem privilégios sensíveis ou mutações", () => {
    const profile = { role: "director" as const };
    expect(canAccessHr(profile)).toBe(true);
    for (const permission of [canManageHr, canReadSensitiveHr, canManageHrDocuments, canImportSecullum]) expect(permission(profile)).toBe(false);
  });
  it("schema RH isola tabelas, salários e não cria campos proibidos ou FKs externas", () => {
    const migration = readFileSync("db/railway/hr/001_hr_initial_schema.sql", "utf8");
    expect(migration).toContain("TARGET DATABASE: Postgres-RH / HR_DATABASE_URL");
    expect(migration).not.toMatch(/\b(unit_id|base_key|sigla|xpt|home_office_regime|banco_horas|cpf)\b/i);
    const employee = migration.split("CREATE TABLE hr_employees (")[1].split("CREATE INDEX")[0];
    expect(employee).not.toContain("salary");
    expect(employee).not.toMatch(/home_office/i);
    expect(employeeSchema.shape).not.toHaveProperty("salary_amount");
    expect(employeeSchema.shape).not.toHaveProperty("home_office");
    const references = [...migration.matchAll(/REFERENCES\s+([\w.]+)/g)].map((m) => m[1]);
    expect(references.every((table) => table.startsWith("hr_"))).toBe(true);
    expect(migration).not.toMatch(/REFERENCES\s+(public\.|auth\.|profiles)/i);
    expect(readFileSync("lib/db/railway-data-client.ts", "utf8")).not.toMatch(/hr_\w+/);
  });
  it("RH é standalone sem hidratação ou polling operacional e recrutamento fica em preparação", () => {
    const app = readFileSync("components/dashboard-app.tsx", "utf8");
    expect(app).toMatch(/ADMIN_SECTIONS[^\n]+"rh"/);
    expect(app).toMatch(/STANDALONE_SECTIONS[^\n]+\.\.\.ADMIN_SECTIONS/);
    expect(app).toMatch(/NO_GLOBAL_DATA_SECTIONS[^\n]+\.\.\.ADMIN_SECTIONS/);
    const view = readFileSync("components/views/hr-view.tsx", "utf8");
    expect(view).not.toMatch(/useDashboardStore|\.hydrate\(|\/api\/(sync|data|pnr|dashboard)/);
    expect(view).toContain("/api/hr/");
    expect(view).toContain("Em preparação");
    expect(view).toContain("disabled={i === 6");
  });
  it("validação de employee rejeita salário, CPF, bases e home office permanente", () => {
    const valid = { employee_code: "SYNTH-1", full_name: "Colaborador sintético", status: "ACTIVE", employment_type: "CLT" };
    expect(employeeSchema.safeParse(valid).success).toBe(true);
    for (const key of ["salary_amount", "cpf", "unit_id", "base_key", "xpt", "home_office"]) expect(employeeSchema.safeParse({ ...valid, [key]: "forbidden" }).success).toBe(false);
  });
  it("código RH usa só HR_DATABASE_URL e migration/runner não têm fallback", () => {
    for (const file of ["lib/hr/db.ts", "lib/hr/repository.ts", "app/api/hr/[...path]/route.ts", "scripts/hr-migrate-local.mjs"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/process\.env\.(DATABASE_URL|PNR_DATABASE_URL)\b/);
    }
    expect(readFileSync("lib/hr/db.ts", "utf8")).toContain("process.env.HR_DATABASE_URL");
    const runner = readFileSync("scripts/hr-migrate-local.mjs", "utf8");
    expect(runner).toContain('"/alc_hr_local"');
    expect(runner).toContain("--confirm-hr-local");
    expect(runner).not.toContain("createTable");
  });
});
