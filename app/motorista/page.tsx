import { redirect } from "next/navigation";
import { driverPortalUrl } from "@/lib/driver-portal-url";

export default async function DriverPortalPage() {
  const portalUrl = driverPortalUrl();
  if (portalUrl) redirect(portalUrl);
  redirect("/");
}
