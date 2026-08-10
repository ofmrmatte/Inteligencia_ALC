import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentSession } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, profile } = await getCurrentSession();
  if (!user) redirect("/login");

  return <AppShell profile={profile}>{children}</AppShell>;
}
