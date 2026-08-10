import { NextResponse, type NextRequest } from "next/server";
import { searchOperationalData } from "@/features/global-search/data/search";
import { requireAuthenticated } from "@/lib/server/authz";

export async function GET(request: NextRequest) {
  const { response } = await requireAuthenticated();
  if (response) return response;

  const query = request.nextUrl.searchParams.get("q") || "";
  const payload = await searchOperationalData(query);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
