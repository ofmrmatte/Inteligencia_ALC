import type { AuthProfile, UserRole } from "@/lib/auth";
import type { SectionId } from "@/lib/navigation";

export const DRIVER_MANAGEMENT_TABS = ["overview", "pilot", "drivers", "tickets", "payments", "disputes", "admins"] as const;
export type DriverManagementTab = (typeof DRIVER_MANAGEMENT_TABS)[number];

const ALL_MODULES: SectionId[] = [
  "visao-geral",
  "gestao-pnr",
  "pre-faturamento",
  "risco-lm",
  "motoristas",
  "gestao-motoristas",
  "conciliacao-ids",
  "qualidade-dados",
  "importacoes",
  "configuracoes",
  "perfil",
];

const OPERATIONAL_MODULES: SectionId[] = [
  "visao-geral",
  "gestao-pnr",
  "pre-faturamento",
  "risco-lm",
  "motoristas",
  "perfil",
];

const FULL_PANEL_ROLES = new Set<UserRole>(["director", "developer", "loss_supervisor", "super_admin"]);

const ROLE_MODULE_CAP: Record<UserRole, SectionId[]> = {
  director: ALL_MODULES,
  developer: ALL_MODULES,
  loss_supervisor: ALL_MODULES,
  super_admin: ALL_MODULES,
  administration_supervisor: ["gestao-motoristas"],
  admin: ["gestao-motoristas"],
  coordinator: OPERATIONAL_MODULES,
  supervisor: OPERATIONAL_MODULES,
  driver: [],
};

const ROLE_DRIVER_MANAGEMENT_CAP: Record<UserRole, DriverManagementTab[]> = {
  director: [...DRIVER_MANAGEMENT_TABS],
  developer: [...DRIVER_MANAGEMENT_TABS],
  loss_supervisor: [...DRIVER_MANAGEMENT_TABS],
  super_admin: [...DRIVER_MANAGEMENT_TABS],
  administration_supervisor: [...DRIVER_MANAGEMENT_TABS],
  admin: ["payments", "disputes"],
  coordinator: [],
  supervisor: [],
  driver: [],
};

function normalizeList<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  const allowedSet = new Set<string>(allowed);
  return [...new Set(values.filter((value): value is T => typeof value === "string" && allowedSet.has(value)))];
}

function configuredScope<T extends string>(values: unknown, cap: readonly T[]): T[] {
  // Undefined means an old profile created before module scopes existed.
  // An explicit empty array is intentional and must never silently restore the role maximum.
  return values === undefined || values === null ? [...cap] : normalizeList(values, cap);
}

export function isFullPanelRole(role: UserRole) {
  return FULL_PANEL_ROLES.has(role);
}

export function modulesForProfile(profile: Pick<AuthProfile, "role" | "moduleScope">): SectionId[] {
  const cap = ROLE_MODULE_CAP[profile.role] ?? [];
  if (isFullPanelRole(profile.role)) return [...cap];
  return configuredScope(profile.moduleScope, cap);
}

export function canAccessSection(profile: Pick<AuthProfile, "role" | "moduleScope">, section: SectionId) {
  return modulesForProfile(profile).includes(section);
}

export function firstAllowedSection(profile: Pick<AuthProfile, "role" | "moduleScope">): SectionId | null {
  return modulesForProfile(profile)[0] ?? null;
}

export function canAccessOperationalData(profile: Pick<AuthProfile, "role" | "moduleScope">) {
  return modulesForProfile(profile).some((section) => section !== "gestao-motoristas" && section !== "configuracoes" && section !== "perfil");
}

export function driverManagementTabsForProfile(profile: Pick<AuthProfile, "role" | "driverManagementScope">): DriverManagementTab[] {
  const cap = ROLE_DRIVER_MANAGEMENT_CAP[profile.role] ?? [];
  if (isFullPanelRole(profile.role)) return [...cap];
  return configuredScope(profile.driverManagementScope, cap);
}

export function canAccessDriverManagementTab(profile: Pick<AuthProfile, "role" | "driverManagementScope">, tab: DriverManagementTab) {
  return driverManagementTabsForProfile(profile).includes(tab);
}

export function roleModuleCap(role: UserRole) {
  return [...(ROLE_MODULE_CAP[role] ?? [])];
}

export function roleDriverManagementCap(role: UserRole) {
  return [...(ROLE_DRIVER_MANAGEMENT_CAP[role] ?? [])];
}
