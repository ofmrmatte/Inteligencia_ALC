import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const PRODUCTION_ORIGIN = "https://inteligenciaalc-production.up.railway.app";

/**
 * Only compare against known public origins. Internal Railway request URLs and
 * the X-Forwarded-Host header are not an authorization authority.
 */
function configuredOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && url.protocol === "http:"))
      return null;
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isTrustedMutationOrigin(request: NextRequest, origin: string | null) {
  if (!origin || origin === "null") return false;
  try {
    const url = new URL(origin);
    if (url.origin !== origin) return false;
    const permitted = [
      PRODUCTION_ORIGIN,
      configuredOrigin(process.env.INTELIGENCIA_PUBLIC_URL),
      configuredOrigin(process.env.RAILWAY_PUBLIC_DOMAIN),
      ...(process.env.NODE_ENV === "production" ? [] : [request.nextUrl.origin]),
    ].filter((item): item is string => Boolean(item));
    return permitted.includes(origin);
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  // This exact service route authenticates signed requests before accessing Core.
  if (request.method === "POST" && request.nextUrl.pathname === "/api/internal/pnr-enrichment")
    return NextResponse.next({ request });
  if (request.nextUrl.pathname.startsWith("/api/") && !SAFE_METHODS.has(request.method.toUpperCase())) {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");

    if (!isTrustedMutationOrigin(request, origin) || fetchSite === "cross-site") {
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
