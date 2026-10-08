import type { AuthProfile } from "@/lib/auth";

type Profile = Pick<AuthProfile, "role">;
const MANAGERS = new Set(["developer", "super_admin", "administration_supervisor", "admin"]);
export const canManageHr = (profile: Profile) => MANAGERS.has(profile.role);
export const canAccessHr = (profile: Profile) => profile.role === "director" || canManageHr(profile);
export const canReadSensitiveHr = canManageHr;
export const canManageHrDocuments = canManageHr;
export const canImportSecullum = canManageHr;
