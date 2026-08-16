import { DashboardApp } from "@/components/dashboard-app";
import { canAccessSection, firstAllowedSection } from "@/lib/access-control";
import { requireCurrentProfile } from "@/lib/auth-server";
import { NAVIGATION } from "@/lib/navigation";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const profile = await requireCurrentProfile();
  if (profile.role === "driver") redirect("/motorista");
  if (!canAccessSection(profile, "visao-geral")) {
    const first = firstAllowedSection(profile);
    const href = NAVIGATION.find((item) => item.id === first)?.href;
    redirect(href || "/login");
  }
  return <DashboardApp section="visao-geral" profile={profile} />;
}
