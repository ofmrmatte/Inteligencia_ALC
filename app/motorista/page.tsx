import { redirect } from "next/navigation";
import { DriverPortalApp } from "./driver-portal-app";
import { getCurrentProfile } from "@/lib/auth-server";

export default async function DriverPortalPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/motorista/login");
  if (profile.role !== "driver") redirect("/");
  return <DriverPortalApp />;
}
