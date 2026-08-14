import { DashboardApp } from "@/components/dashboard-app";
import { requireCurrentProfile } from "@/lib/auth-server";

export default async function HomePage() {
  const profile = await requireCurrentProfile();
  return <DashboardApp section="visao-geral" profile={profile} />;
}
