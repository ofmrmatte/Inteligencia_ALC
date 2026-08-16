import { NextResponse } from "next/server";
import { driverPortalUrl } from "@/lib/driver-portal-url";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "O Portal do Motorista foi separado do painel administrativo.",
      portalUrl: driverPortalUrl(),
    },
    { status: 410 },
  );
}

