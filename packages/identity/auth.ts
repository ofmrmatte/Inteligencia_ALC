export const USER_ROLES = [
  "coordinator",
  "supervisor",
  "director",
  "admin",
  "developer",
  "loss_supervisor",
  "loss_admin",
  "administration_supervisor",
  "super_admin",
  "driver",
] as const;

export const MANAGED_USER_ROLES = [
  "director",
  "coordinator",
  "supervisor",
  "developer",
  "loss_supervisor",
  "loss_admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface AuthProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  setor?: string;
  globalAccess: boolean;
  baseScope: string[];
  siglaScope: string[];
  xptScope?: string[];
  moduleScope?: string[];
  atendimentoAccess?: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  coordinator: "Coordenador",
  supervisor: "Supervisor de Operação",
  director: "Diretoria",
  admin: "Administração",
  developer: "Desenvolvedor",
  loss_supervisor: "Supervisor Loss",
  loss_admin: "Administração Loss",
  administration_supervisor: "Supervisor de Administração",
  super_admin: "Super Admin",
  driver: "Motorista",
};

const GLOBAL_OPERATIONAL_ROLES: UserRole[] = [
  "director",
  "developer",
  "loss_supervisor",
  "loss_admin",
  "super_admin",
];
const USER_MANAGER_ROLES: UserRole[] = [
  "director",
  "developer",
  "loss_supervisor",
  "super_admin",
];

const USER_MANAGEMENT_MATRIX: Partial<Record<UserRole, readonly UserRole[]>> = {
  super_admin: MANAGED_USER_ROLES,
  developer: MANAGED_USER_ROLES,
  director: MANAGED_USER_ROLES,
  loss_supervisor: ["coordinator", "supervisor", "loss_admin"],
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export function hasFullAccess(
  profile: Pick<AuthProfile, "role" | "globalAccess">,
) {
  return GLOBAL_OPERATIONAL_ROLES.includes(profile.role);
}

// Matches the current operational policy: modules still restrict coordinators
// and supervisors, while SVC/base is no longer a configurable user scope.
export function hasFullOperationalScope(
  profile: Pick<AuthProfile, "role" | "globalAccess">,
) {
  return (
    hasFullAccess(profile) ||
    profile.role === "coordinator" ||
    profile.role === "supervisor"
  );
}

export function canManageImports(
  profile: Pick<AuthProfile, "role" | "globalAccess">,
) {
  return hasFullAccess(profile);
}

export function canManageUsers(
  profile: Pick<AuthProfile, "role" | "globalAccess">,
) {
  return USER_MANAGER_ROLES.includes(profile.role);
}

// Explicit grants/revocations are stored in the Atendimento settings database.
// Unconfigured users retain the existing PNR permission during migration.
export function canAccessAtendimento(
  profile: Pick<AuthProfile, "role" | "moduleScope" | "atendimentoAccess">,
) {
  const full = GLOBAL_OPERATIONAL_ROLES.includes(profile.role);
  if (!full && !["coordinator", "supervisor"].includes(profile.role)) return false;
  if (typeof profile.atendimentoAccess === "boolean") return profile.atendimentoAccess;
  return full || profile.moduleScope == null || profile.moduleScope.includes("gestao-pnr");
}

export function manageableUserRoles(
  profile: Pick<AuthProfile, "role">,
): UserRole[] {
  return [...(USER_MANAGEMENT_MATRIX[profile.role] ?? [])];
}

export function canManageRole(
  profile: Pick<AuthProfile, "role">,
  role: UserRole,
) {
  return manageableUserRoles(profile).includes(role);
}

export function canManageUserTransition(
  profile: Pick<AuthProfile, "role">,
  currentRole: UserRole,
  nextRole: UserRole,
) {
  return (
    canManageRole(profile, currentRole) && canManageRole(profile, nextRole)
  );
}
