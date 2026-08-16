import { canAccessDriverManagementTab, type DriverManagementTab } from "@/lib/access-control";
import { getAllowedBaseIds } from "@/lib/access-scope";
import { getUserAccessScope } from "@/lib/access-scope-server";
import type { AuthProfile } from "@/lib/auth";

export function assertDriverManagementTab(profile: AuthProfile, tab: DriverManagementTab) {
  if (!canAccessDriverManagementTab(profile, tab)) {
    const error = new Error("Acesso negado para esta área da Gestão de Motoristas.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}

export async function driverManagementBaseScope(profile: AuthProfile) {
  if (["director", "developer", "loss_supervisor", "super_admin", "administration_supervisor"].includes(profile.role)) return null;
  const scope = await getUserAccessScope(profile);
  return getAllowedBaseIds(scope) ?? null;
}

export function accessErrorStatus(error: unknown, fallback = 400) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : fallback;
}
