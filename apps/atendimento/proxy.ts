import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, inteligenciaEntryUrl } from "./lib/auth";
import { ENTRY_COOKIE, validEntryReceipt } from "@alc/identity/transfer";
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Preview-only branch: publicly serve synthetic visuals and block all operational routes.
  // This mode has no credentials, database connections or WhatsApp integrations.
  if (process.env.ALC_PREVIEW_DATA_MODE === "synthetic-only") {
    if (!["GET", "HEAD"].includes(request.method))
      return NextResponse.json({ error: "Demonstração somente leitura." }, { status: 405 });
    if (path === "/preview" || path.startsWith("/preview/")) {
      const next = NextResponse.next();
      next.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return next;
    }
    if (path.startsWith("/api/") || path.startsWith("/webhooks/") || path.startsWith("/auth/"))
      return NextResponse.json({ error: "Rota desabilitada na prévia isolada." }, { status: 404 });
    return NextResponse.redirect(new URL("/preview", request.url));
  }
  if (
    path.startsWith("/webhooks/") ||
    path === "/health" ||
    path === "/manifest.webmanifest" ||
    path === "/auth/transfer" ||
    path === "/acesso-indisponivel"
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
  if (path === "/login") return NextResponse.redirect(inteligenciaEntryUrl());
  let response = NextResponse.next({ request });
  let config;
  try {
    config = authConfig();
  } catch {
    return NextResponse.json(
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
  if (
    error ||
    !data?.claims?.sub ||
    !validEntryReceipt(
      request.cookies.get(ENTRY_COOKIE)?.value,
      process.env.ATENDIMENTO_ENCRYPTION_KEY || "",
      data.claims,
    )
  ) {
    const next = path.startsWith("/api/")
      ? NextResponse.json({ error: "Sessão expirada." }, { status: 401 })
      : NextResponse.redirect(inteligenciaEntryUrl());
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
