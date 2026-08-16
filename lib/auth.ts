export const USER_ROLES = ["coordinator", "supervisor", "director", "admin", "developer"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface AuthProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  globalAccess: boolean;
  baseScope: string[];
  siglaScope: string[];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  coordinator: "Coordenador",
  supervisor: "Supervisor",
  director: "Diretor",
  admin: "ADM",
  developer: "Desenvolvedor",
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export function hasFullAccess(profile: Pick<AuthProfile, "role" | "globalAccess">) {
  return profile.globalAccess || profile.role === "admin" || profile.role === "director" || profile.role === "developer";
}

export function canManageImports(profile: Pick<AuthProfile, "role" | "globalAccess">) {
  return hasFullAccess(profile);
}

export function canManageUsers(profile: Pick<AuthProfile, "role" | "globalAccess">) {
  return profile.globalAccess || profile.role === "admin" || profile.role === "director" || profile.role === "developer";
}
