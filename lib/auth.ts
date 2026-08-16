export const USER_ROLES = [
  "coordinator",
  "supervisor",
  "director",
  "admin",
  "developer",
  "loss_supervisor",
  "administration_supervisor",
  "super_admin",
  "driver",
] as const;

export const MANAGED_USER_ROLES = [
  "director",
  "coordinator",
  "supervisor",
  "admin",
  "developer",
  "loss_supervisor",
  "administration_supervisor",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface AuthProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  globalAccess: boolean;
  baseScope: string[];
  siglaScope: string[];
  moduleScope?: string[];
  driverManagementScope?: string[];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  coordinator: "Coordenador",
  supervisor: "Supervisor de Operação",
  director: "Diretoria",
  admin: "Administração",
  developer: "Desenvolvedor",
  loss_supervisor: "Supervisor Loss",
  administration_supervisor: "Supervisor de Administração",
  super_admin: "Super Admin",
  driver: "Motorista",
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export function hasFullAccess(profile: Pick<AuthProfile, "role" | "globalAccess">) {
  return ["director", "developer", "loss_supervisor", "super_admin"].includes(profile.role);
}

export function hasDriverManagementAccess(profile: Pick<AuthProfile, "role">) {
  return ["director", "developer", "super_admin", "administration_supervisor", "admin"].includes(profile.role);
}

export function isDriverProfile(profile: Pick<AuthProfile, "role">) {
  return profile.role === "driver";
}

export function canManageImports(profile: Pick<AuthProfile, "role" | "globalAccess">) {
  return hasFullAccess(profile);
}

export function canManageUsers(profile: Pick<AuthProfile, "role" | "globalAccess">) {
  return hasFullAccess(profile);
}
