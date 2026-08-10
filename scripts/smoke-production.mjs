#!/usr/bin/env node

const target = (process.argv[2] || process.env.PRODUCTION_URL || "https://dashboardfatura.vercel.app").replace(/\/$/, "");

const privateRoutes = [
  "/",
  "/dashboard",
  "/pre-fatura",
  "/gestao-pacotes",
  "/desvios-pnr",
  "/pacotes-faltantes",
  "/perfil",
  "/configuracoes",
];

function normalizeLocation(location, baseUrl) {
  return new URL(location, baseUrl).toString();
}

async function fetchText(pathname) {
  const response = await fetch(`${target}${pathname}`, { redirect: "follow" });
  return { response, text: await response.text() };
}

async function assertLogin() {
  const { response, text } = await fetchText("/login");
  if (!response.ok) throw new Error(`/login returned ${response.status}`);
  for (const signal of ["Inteligência LOSS", "ALC Pereira &amp; Filho", "Bem-vindo", "Email", "Senha", "Entrar", "/brand/alc-favicon.svg"]) {
    if (!text.includes(signal)) throw new Error(`/login missing expected signal: ${signal}`);
  }
  console.log("ok /login");
}

async function assertRedirect(pathname) {
  const response = await fetch(`${target}${pathname}`, { redirect: "manual" });
  if (![307, 308].includes(response.status)) {
    throw new Error(`${pathname} expected redirect, got ${response.status}`);
  }
  const location = response.headers.get("location");
  if (!location) throw new Error(`${pathname} redirect missing Location header`);
  const redirectUrl = normalizeLocation(location, target);
  const parsed = new URL(redirectUrl);
  if (parsed.pathname !== "/login") throw new Error(`${pathname} redirected to ${redirectUrl}, expected /login`);
  const expectedNextValues = pathname === "/" ? ["/", "/dashboard"] : [pathname];
  if (!expectedNextValues.includes(parsed.searchParams.get("next"))) {
    throw new Error(`${pathname} redirect next=${parsed.searchParams.get("next")}, expected ${expectedNextValues.join(" or ")}`);
  }
  console.log(`ok ${pathname} -> ${parsed.pathname}?next=${parsed.searchParams.get("next")}`);
}

try {
  console.log(`Production smoke target: ${target}`);
  await assertLogin();
  for (const route of privateRoutes) await assertRedirect(route);
  console.log("Production smoke passed.");
} catch (error) {
  console.error("Production smoke failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
