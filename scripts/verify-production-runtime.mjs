#!/usr/bin/env node

const target = process.argv[2] || process.env.PRODUCTION_URL || "https://dashboardfatura.vercel.app";

const legacySignals = [
  "legacy/app.js",
  "app.js",
  "styles.css",
  "authService.js",
  "supabaseClient.js",
  "dashboardCacheService.js",
  "Painel de Inteligência | ALC Transportes",
  "DF55",
];

const nextSignals = [
  "/_next/",
  "__next",
  "self.__next_f",
  "Inteligência ALC",
];

function includesAny(html, signals) {
  return signals.filter((signal) => html.includes(signal));
}

try {
  const response = await fetch(target, { redirect: "follow" });
  const html = await response.text();
  const legacyHits = includesAny(html, legacySignals);
  const nextHits = includesAny(html, nextSignals);
  const statusLine = `${response.status} ${response.statusText}`.trim();

  console.log(`URL: ${target}`);
  console.log(`HTTP: ${statusLine}`);
  console.log(`Runtime Next signals: ${nextHits.length ? nextHits.join(", ") : "none"}`);
  console.log(`Legacy signals: ${legacyHits.length ? legacyHits.join(", ") : "none"}`);

  if (!response.ok) {
    console.error("Runtime verification failed: production URL did not return OK.");
    process.exit(1);
  }

  if (!nextHits.length || legacyHits.length) {
    console.error("Runtime verification failed: production is not serving the Next.js application cleanly.");
    process.exit(1);
  }

  console.log("Runtime verification passed: production is serving the Next.js application.");
} catch (error) {
  console.error("Runtime verification failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
