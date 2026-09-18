import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { isTransientSupabaseError } from "@/lib/supabase/retry";

const PUBLIC_PATHS = new Set(["/login", "/manifest.webmanifest"]);
const LEGACY_DRIVER_PORTAL_PATHS = new Set(["/motorista", "/motorista/login"]);

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname);
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function preserveSessionCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  ["cache-control", "expires", "pragma"].forEach((name) => {
    const value = source.headers.get(name);
    if (value) target.headers.set(name, value);
  });
  return target;
}

export function legacyDriverPortalTarget(pathname: string) {
  if (!LEGACY_DRIVER_PORTAL_PATHS.has(pathname)) return null;
  const base = process.env.NEXT_PUBLIC_DRIVER_PORTAL_URL?.trim().replace(/\/+$/, "");
  if (!base) return "";
  return pathname === "/motorista/login" ? `${base}/login` : base;
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const legacyPortalTarget = legacyDriverPortalTarget(pathname);
  if (legacyPortalTarget !== null) {
    if (!legacyPortalTarget) {
      return NextResponse.json({ error: "Portal do Motorista não configurado." }, { status: 503 });
    }
    return NextResponse.redirect(legacyPortalTarget);
  }

  if (!isSupabaseConfigured() || !supabaseUrl || !supabasePublishableKey) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    if (!isPublicPath(pathname)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next({ request });
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims && !error);

  if (error && isTransientSupabaseError(error)) {
    return preserveSessionCookies(
      NextResponse.json({ error: "Autenticação temporariamente indisponível." }, { status: 503 }),
      response,
    );
  }

  if (!isAuthenticated) {
    if (isApiPath(pathname)) {
      return preserveSessionCookies(
        NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }),
        response,
      );
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return preserveSessionCookies(NextResponse.redirect(redirectUrl), response);
  }

  return response;
}
