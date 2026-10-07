import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { isTransientSupabaseError, retrySupabaseResult } from "@/lib/supabase/retry";

const PUBLIC_PATHS = new Set(["/login", "/manifest.webmanifest"]);
const MFA_PATH = "/seguranca/mfa";

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

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
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

  const { data, error } = await retrySupabaseResult(() => supabase.auth.getClaims(), [250, 750]);
  const claims = data?.claims as { aal?: string } | undefined;
  const isAuthenticated = Boolean(claims && !error);

  if (error && isTransientSupabaseError(error)) {
    if (isApiPath(pathname)) {
      return preserveSessionCookies(
        NextResponse.json({ error: "Autenticação temporariamente indisponível." }, { status: 503 }),
        response,
      );
    }

    const recoveryUrl = request.nextUrl.clone();
    recoveryUrl.pathname = "/login";
    recoveryUrl.search = "";
    recoveryUrl.searchParams.set("error", "auth_temp");
    recoveryUrl.searchParams.set("next", pathname);
    return preserveSessionCookies(NextResponse.redirect(recoveryUrl), response);
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

  if (claims?.aal !== "aal2") {
    if (pathname === MFA_PATH) return response;
    if (isApiPath(pathname)) {
      return preserveSessionCookies(
        NextResponse.json({ error: "MFA_REQUIRED", message: "Confirme o segundo fator para continuar." }, { status: 403 }),
        response,
      );
    }
    const mfaUrl = request.nextUrl.clone();
    mfaUrl.pathname = MFA_PATH;
    mfaUrl.search = "";
    mfaUrl.searchParams.set("next", pathname);
    return preserveSessionCookies(NextResponse.redirect(mfaUrl), response);
  }

  return response;
}
