import { notFound, redirect } from "next/navigation";
import { DashboardApp } from "@/components/dashboard-app";
import { canAccessSection, firstAllowedSection } from "@/lib/access-control";
import { requireCurrentProfile } from "@/lib/auth-server";
import { NAVIGATION, SECTION_IDS, type SectionId } from "@/lib/navigation";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SECTION_IDS.includes(section as SectionId) || section === "visao-geral") notFound();
  const profile = await requireCurrentProfile();
  if (profile.role === "driver") redirect("/motorista");
  const sectionId = section as SectionId;
  if (!canAccessSection(profile, sectionId)) {
    const first = firstAllowedSection(profile);
    const href = NAVIGATION.find((item) => item.id === first)?.href;
    redirect(href || "/login");
  }
  return <DashboardApp section={sectionId} profile={profile} />;
}
