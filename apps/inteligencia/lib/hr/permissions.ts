import type { AuthProfile } from "@/lib/auth";

type Profile = Pick<AuthProfile, "role" | "setor" | "moduleScope">;

const MANAGERS = new Set(["developer", "super_admin", "administration_supervisor", "admin"]);
const ASSIGNABLE_RH_ROLES = new Set(["coordinator", "supervisor"]);

function hasExplicitRhGrant(profile: Profile) {
  return Array.isArray(profile.moduleScope) && profile.moduleScope.includes("rh");
}

function isRhSector(profile: Profile) {
  return typeof profile.setor === "string" && profile.setor.trim().toLocaleLowerCase("pt-BR") === "recursos humanos";
}

export const canManageHr = (profile: Profile) =>
  MANAGERS.has(profile.role) ||
  (ASSIGNABLE_RH_ROLES.has(profile.role) && hasExplicitRhGrant(profile) && isRhSector(profile));

export const canAccessHr = (profile: Profile) =>
  profile.role === "director" ||
  MANAGERS.has(profile.role) ||
  (ASSIGNABLE_RH_ROLES.has(profile.role) && hasExplicitRhGrant(profile));

export const canReadSensitiveHr = (profile: Profile) => MANAGERS.has(profile.role);
export const canManageHrDocuments = (profile: Profile) => MANAGERS.has(profile.role);
export const canImportSecullum = (profile: Profile) => MANAGERS.has(profile.role);
