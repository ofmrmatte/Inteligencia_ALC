import { NextResponse } from "next/server";
import { getOperationalAlerts } from "@/features/operational-alerts/data/alerts";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";
import { requireAuthenticated } from "@/lib/server/authz";

export async function GET() {
  const { session, response } = await requireAuthenticated();
  if (response) return response;

  const payload = await getOperationalAlerts(isAdminProfile(session.profile));

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
