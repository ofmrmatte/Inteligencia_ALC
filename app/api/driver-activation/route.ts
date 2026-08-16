import { NextResponse } from "next/server";
import { driverPortalUrl } from "@/lib/driver-portal-url";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error: "A ativação por CPF/código foi descontinuada. Use o Portal do Motorista externo.",
      portalUrl: driverPortalUrl("/login"),
    },
    { status: 410 },
  );
}

