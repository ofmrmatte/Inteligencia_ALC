import type { AuthProfile } from "@/lib/auth";

export const DRIVER_PORTAL_BASE_MANAGER_ROLES = ["director", "super_admin", "developer", "loss_supervisor"] as const;

type DriverAccessShape = {
  portal_status?: unknown;
  portalStatus?: unknown;
  portal_eligible?: unknown;
  portalEligible?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function canManageDriverPortalBaseSettings(profile: Pick<AuthProfile, "role">) {
  return DRIVER_PORTAL_BASE_MANAGER_ROLES.includes(profile.role as (typeof DRIVER_PORTAL_BASE_MANAGER_ROLES)[number]);
}

export function normalizePortalBaseKey(value: unknown) {
  return textValue(value).trim().toUpperCase();
}

export function driverPortalBaseAccessKey(baseKey: unknown, sigla?: unknown) {
  return normalizePortalBaseKey(sigla) || normalizePortalBaseKey(baseKey);
}

export function driverPortalBaseAccessKeyFromMap(baseKey: unknown, sigla: unknown, operationalBaseSiglas: Map<string, string>) {
  const normalizedBaseKey = normalizePortalBaseKey(baseKey);
  return normalizePortalBaseKey(operationalBaseSiglas.get(normalizedBaseKey)) || driverPortalBaseAccessKey(baseKey, sigla);
}

export function isDriverPortalBlockingStatus(status: unknown) {
  const normalized = textValue(status).trim().toLowerCase();
  return normalized === "blocked" || normalized === "inactive";
}

export function portalEligibilityFromBase(baseEnabled: boolean, portalStatus: unknown) {
  return Boolean(baseEnabled && !isDriverPortalBlockingStatus(portalStatus));
}

export function getEffectiveDriverPortalAccess(driver: DriverAccessShape | null | undefined, baseEnabled: boolean) {
  const portalStatus = textValue(driver?.portal_status ?? driver?.portalStatus);
  const driverEligible = Boolean(driver?.portal_eligible ?? driver?.portalEligible);
  const blockedStatus = isDriverPortalBlockingStatus(portalStatus);
  const allowed = Boolean(baseEnabled && driverEligible && !blockedStatus);
  const reason = !baseEnabled
    ? "base_disabled"
    : !driverEligible
      ? "driver_not_eligible"
      : blockedStatus
        ? "driver_blocked"
        : "allowed";
  return {
    allowed,
    baseEnabled,
    driverEligible,
    portalStatus,
    reason,
  };
}
