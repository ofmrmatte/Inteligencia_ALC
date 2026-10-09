import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, inteligenciaEntryUrl } from "./lib/auth";
import { ENTRY_COOKIE, validEntryReceipt } from "@alc/identity/transfer";

function clearSessionCookies(response: NextResponse, request: NextRequest) {
  const names = new Set(
    request.cookies
      .getAll()
      .map(({ name }) => name)
      .filter((name) => name === ENTRY_COOKIE || name.startsWith("sb-")),
  );
  for (const name of names)
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
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
  if (path === "/login") {
    const next = NextResponse.redirect(inteligenciaEntryUrl());
    clearSessionCookies(next, request);
    return next;
  }
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
    clearSessionCookies(next, request);
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
