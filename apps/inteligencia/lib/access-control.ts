import { canAccessAtendimento, type AuthProfile, type UserRole } from "@/lib/auth";
import type { SectionId } from "@/lib/navigation";
import { canAccessHr } from "@/lib/hr/permissions";

const ALL_MODULES: SectionId[] = [
  "visao-geral",
  "gestao-pnr",
  "pre-faturamento",
  "gestao-descontos",
  "relatorios-pacotes",
  "risco-lm",
  "motoristas",
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
  "gestao-descontos",
  "relatorios-pacotes",
  "risco-lm",
  "motoristas",
  "perfil",
];

const LOSS_MODULES: SectionId[] = [...ALL_MODULES];
const LOSS_ADMIN_MODULES: SectionId[] = [...OPERATIONAL_MODULES, "importacoes"];
const FULL_PANEL_ROLES = new Set<UserRole>(["director", "developer", "loss_supervisor", "loss_admin", "super_admin"]);
const ASSIGNABLE_RH_ROLES = new Set<UserRole>(["coordinator", "supervisor"]);

const ROLE_MODULE_CAP: Record<UserRole, SectionId[]> = {
  director: ALL_MODULES,
  developer: ALL_MODULES,
  loss_supervisor: LOSS_MODULES,
  loss_admin: LOSS_ADMIN_MODULES,
  super_admin: ALL_MODULES,
  administration_supervisor: [],
  admin: [],
  coordinator: OPERATIONAL_MODULES,
  supervisor: OPERATIONAL_MODULES,
  driver: [],
};

function normalizeList<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  const allowedSet = new Set<string>(allowed);
  return [...new Set(values.filter((value): value is T => typeof value === "string" && allowedSet.has(value)))];
}

export function isFullPanelRole(role: UserRole) {
  return FULL_PANEL_ROLES.has(role);
}

export function roleDefaultModules(role: UserRole): SectionId[] {
  const base = [...(ROLE_MODULE_CAP[role] ?? [])];
  return canAccessHr({ role }) ? [...base, "rh"] : base;
}

export function roleModuleCap(role: UserRole): SectionId[] {
  const base = [...(ROLE_MODULE_CAP[role] ?? [])];
  const rhAvailable = canAccessHr({ role }) || ASSIGNABLE_RH_ROLES.has(role);
  return rhAvailable ? [...base, "rh"] : base;
}

export function modulesForProfile(profile: Pick<AuthProfile, "role" | "moduleScope" | "setor">): SectionId[] {
  const baseCap = ROLE_MODULE_CAP[profile.role] ?? [];
  const allowedCap = roleModuleCap(profile.role);
  let modules: SectionId[];

  if (isFullPanelRole(profile.role)) {
    modules = [...baseCap];
  } else if (profile.moduleScope === undefined || profile.moduleScope === null) {
    modules = roleDefaultModules(profile.role);
  } else {
    modules = normalizeList(profile.moduleScope, allowedCap);
  }

  if (canAccessHr(profile) && !modules.includes("rh")) modules.push("rh");
  return modules;
}

export function canAccessSection(profile: Pick<AuthProfile, "role" | "moduleScope" | "setor" | "atendimentoAccess">, section: SectionId) {
  if (section === "atendimento") return canAccessAtendimento(profile);
  if (section === "auditoria-pnr" || section === "bandeja-pnr") return modulesForProfile(profile).includes("gestao-pnr");
  return modulesForProfile(profile).includes(section);
}

export function firstAllowedSection(profile: Pick<AuthProfile, "role" | "moduleScope" | "setor">): SectionId | null {
  return modulesForProfile(profile)[0] ?? null;
}

export function canAccessOperationalData(profile: Pick<AuthProfile, "role" | "moduleScope" | "setor">) {
  return modulesForProfile(profile).some((section) => section !== "configuracoes" && section !== "perfil" && section !== "rh");
}
