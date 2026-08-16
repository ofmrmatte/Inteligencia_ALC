import { DashboardApp } from "@/components/dashboard-app";
import { requireCurrentProfile } from "@/lib/auth-server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const profile = await requireCurrentProfile();
  if (profile.role === "driver") redirect("/motorista");
  return <DashboardApp section="visao-geral" profile={profile} />;
}
