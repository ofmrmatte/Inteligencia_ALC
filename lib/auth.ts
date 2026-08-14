export const USER_ROLES = ["coordinator", "supervisor", "director", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface AuthProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  baseScope: string[];
  siglaScope: string[];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  coordinator: "Coordenador",
  supervisor: "Supervisor",
  director: "Diretor",
  admin: "ADM",
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export function canManageImports(role: UserRole) {
  return role === "admin" || role === "director";
}
