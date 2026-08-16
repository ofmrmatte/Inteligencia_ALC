import { redirect } from "next/navigation";
import { driverPortalUrl } from "@/lib/driver-portal-url";

export default function DriverLoginRedirectPage() {
  const portalUrl = driverPortalUrl("/login");
  if (portalUrl) redirect(portalUrl);
  redirect("/");
}

