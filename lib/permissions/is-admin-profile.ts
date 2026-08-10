import type { Profile } from "@/lib/auth/types";

export function isAdminProfile(profile: Pick<Profile, "is_admin" | "role"> | null | undefined) {
  return profile?.is_admin === true && String(profile?.role || "").trim().toLowerCase() === "admin";
}
