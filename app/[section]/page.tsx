import { notFound } from "next/navigation";
import { DashboardApp } from "@/components/dashboard-app";
import { requireCurrentProfile } from "@/lib/auth-server";
import { SECTION_IDS, type SectionId } from "@/lib/navigation";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SECTION_IDS.includes(section as SectionId) || section === "visao-geral") notFound();
  const profile = await requireCurrentProfile();
  return <DashboardApp section={section as SectionId} profile={profile} />;
}
