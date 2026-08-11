import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { printSection, writeAuditReport } from "./audit-utils.mjs";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "features", "lib"];
const API_ROUTE_EXPECTATIONS = {
  "app/api/alerts/route.ts": "AUTH",
  "app/api/configuracoes/settings/route.ts": "ADMIN",
  "app/api/configuracoes/users/route.ts": "ADMIN",
  "app/api/desvios-pnr/status/route.ts": "ADMIN",
  "app/api/desvios-pnr/validate/route.ts": "AUTH",
  "app/api/exports/desvios-pnr/route.ts": "AUTH",
  "app/api/exports/gestao-pacotes/route.ts": "AUTH",
  "app/api/exports/pacotes-faltantes/route.ts": "AUTH",
  "app/api/exports/pre-fatura/route.ts": "AUTH",
  "app/api/gestao-pacotes/validate/route.ts": "AUTH",
  "app/api/pacotes-faltantes/status/route.ts": "ADMIN",
  "app/api/perfil/avatar/route.ts": "AUTH",
  "app/api/perfil/route.ts": "AUTH",
  "app/api/pre-fatura/validate/route.ts": "AUTH",
  "app/api/search/route.ts": "AUTH",
};

async function listFiles(dir) {
  const entries = await readdir(path.join(ROOT, dir), { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(relative));
    else if (entry.isFile() && /\.(ts|tsx|css)$/.test(entry.name)) output.push(relative.replace(/\\/g, "/"));
  }
  return output;
}

async function exists(relativePath) {
  try {
    await access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

function routeGuard(content) {
  if (content.includes("requireAdmin(")) return "ADMIN";
  if (content.includes("requireAuthenticated(")) return "AUTH";
  return "PUBLIC";
}

function countPattern(files, pattern) {
  return files.reduce((matches, file) => (
    matches + [...file.content.matchAll(pattern)].map(() => file.path).length
  ), 0);
}

try {
  const files = [];
  for (const dir of SOURCE_DIRS) {
    const listed = await listFiles(dir);
    for (const file of listed) {
      if (/features\/[^/]+\/migration\.ts$/.test(file)) continue;
      files.push({ path: file, content: await readFile(path.join(ROOT, file), "utf8") });
    }
  }
  const allText = files.map((file) => file.content).join("\n");
  const apiRoutes = files
    .filter((file) => file.path.startsWith("app/api/") && file.path.endsWith("/route.ts"))
    .map((file) => ({
      file: file.path,
      expected: API_ROUTE_EXPECTATIONS[file.path] || "UNMAPPED",
      guard: routeGuard(file.content),
    }));

  const brandAssets = [
    "public/brand/alc-favicon.svg",
    "public/brand/alc-loader-dark.svg",
    "public/brand/alc-loader-light.svg",
    "public/brand/alc-symbol-dark.svg",
    "public/brand/alc-symbol-light.svg",
  ];

  const adminHelper = await readFile(path.join(ROOT, "lib/permissions/is-admin-profile.ts"), "utf8");
  const hasTopbarSearch = /Pesquisar no painel/.test(allText);
  const hasRealSearchBackend = await exists("app/api/search/route.ts")
    && await exists("features/global-search/data/search.ts")
    && await exists("features/global-search/components/global-search.tsx");
  const checks = [
    {
      id: "no_fake_topbar_search",
      ok: !hasTopbarSearch || hasRealSearchBackend,
      detail: "Topbar nao deve exibir busca sem backend funcional.",
    },
    {
      id: "no_visible_migration_badge",
      ok: !/Em migracao|Em migração|em desenvolvimento|modulo em processo|módulo em processo/i.test(allText),
      detail: "Runtime final nao deve exibir linguagem de placeholder/migracao.",
    },
    {
      id: "no_module_foundation_runtime",
      ok: !allText.includes("ModuleFoundation") && !await exists("components/layout/module-foundation.tsx"),
      detail: "Componente foundation temporario foi removido do runtime.",
    },
    {
      id: "no_legacy_runtime_imports",
      ok: !/legacy\/|legacy\\|assets\/vendor|authService|supabaseClient\.js|dashboardCacheService|window\.supabaseClient/.test(allText),
      detail: "Runtime Next nao importa app legado nem bibliotecas vendor de navegador.",
    },
    {
      id: "no_service_role_in_runtime",
      ok: !/SERVICE_ROLE|service_role|SUPABASE_SERVICE/i.test(allText),
      detail: "Service role nao pode aparecer no runtime app/components/features/lib.",
    },
    {
      id: "admin_rule_single_helper",
      ok: /is_admin\s*===\s*true/.test(adminHelper) && /role/.test(adminHelper) && /admin/.test(adminHelper) && !/user_metadata/i.test(allText),
      detail: "Admin exige helper central e nao usa user_metadata.",
    },
    {
      id: "exceljs_server_only",
      ok: files
        .filter((file) => file.content.includes("from \"exceljs\""))
        .every((file) => file.path.startsWith("app/api/") || file.path === "lib/export/xlsx.ts"),
      detail: "ExcelJS deve ficar em rotas API/export server-side, fora de componentes client.",
    },
    {
      id: "brand_assets_present",
      ok: (await Promise.all(brandAssets.map(exists))).every(Boolean),
      detail: "Assets oficiais ALC usados pelo shell/login/loaders estao em public/brand.",
    },
    {
      id: "api_routes_guarded",
      ok: apiRoutes.every((route) => route.expected !== "UNMAPPED" && route.guard === route.expected),
      detail: "Rotas app/api devem estar classificadas como AUTH ou ADMIN e usar guard correspondente.",
    },
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    checks,
    apiRoutes,
    counts: {
      sourceFiles: files.length,
      serviceRoleMentions: countPattern(files, /SERVICE_ROLE|service_role|SUPABASE_SERVICE/gi),
      legacyMentions: countPattern(files, /legacy\/|legacy\\|window\.supabaseClient/gi),
      placeholderMentions: countPattern(files, /Em migracao|Em migração|em desenvolvimento|modulo em processo|módulo em processo/gi),
    },
  };
  const reportPath = await writeAuditReport("dashboard-health", report);

  printSection("Dashboard health");
  checks.forEach((check) => console.log(`${check.ok ? "ok" : "falha"} ${check.id}: ${check.detail}`));
  console.table(apiRoutes);
  console.log(`Relatorio: ${reportPath}`);

  if (checks.some((check) => !check.ok)) process.exitCode = 2;
} catch (error) {
  console.error("[Dashboard Health] Falha:", error);
  process.exit(1);
}
