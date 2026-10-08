import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestHosts(request: NextRequest) {
  const values = [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(),
    request.nextUrl.host,
  ];

  return new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()));
}

function isSameHostOrigin(request: NextRequest, origin: string | null) {
  if (!origin) return true;

  try {
    const parsed = new URL(origin);
    return requestHosts(request).has(parsed.host.toLowerCase());
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") && !SAFE_METHODS.has(request.method.toUpperCase())) {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");

    if (!isSameHostOrigin(request, origin) || fetchSite === "cross-site") {
      return NextResponse.json(
        { error: "Origem da requisição não autorizada." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
