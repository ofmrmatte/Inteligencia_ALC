import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "./lib/auth";
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    path.startsWith("/webhooks/") ||
    path === "/health" ||
    path === "/auth/transfer"
  )
    return NextResponse.next();
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (
      !origin ||
      origin !==
        (process.env.ATENDIMENTO_PUBLIC_URL || request.nextUrl.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return NextResponse.json(
        { error: "Origem não autorizada." },
        { status: 403 },
      );
  }
  let response = NextResponse.next({ request });
  let config;
  try {
    config = authConfig();
  } catch {
    return path === "/login"
      ? response
      : NextResponse.json(
          { error: "Acesso não configurado." },
          { status: 503 },
        );
  }
  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach((v) => request.cookies.set(v.name, v.value));
        response = NextResponse.next({ request });
        values.forEach((v) => response.cookies.set(v.name, v.value, v.options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  const { data, error } = await client.auth.getClaims();
  if (path === "/login") return response;
  if (error || !data?.claims?.sub) {
    const next = path.startsWith("/api/")
      ? NextResponse.json({ error: "Sessão expirada." }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((c) => next.cookies.set(c));
    return next;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|zip)$).*)",
  ],
};
