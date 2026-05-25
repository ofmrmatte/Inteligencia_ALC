import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { printSection, writeAuditReport } from "./audit-utils.mjs";

const ROOT = process.cwd();
const codeFiles = ["app.js", "index.html", "styles.css", "supabaseClient.js", "authService.js", "dashboardCacheService.js"];
const canonicalKeys = ["pre_fatura", "gestao_pacotes", "desvios_pnr", "pacotes_faltantes"];
const legacyKeys = ["pre-fatura", "gestao-pacotes", "gestao-desvios-pnr", "desvios-pnr", "pacotes-faltantes"];

async function readProjectFile(file) {
  return readFile(path.join(ROOT, file), "utf8");
}

async function listScripts(dir = path.join(ROOT, "scripts")) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listScripts(full));
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      files.push(full);
    }
  }
  return files;
}

function countPattern(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

try {
  const contents = Object.fromEntries(await Promise.all(codeFiles.map(async (file) => [file, await readProjectFile(file)])));
  const app = contents["app.js"];
  const styles = contents["styles.css"];
  const scripts = await listScripts();
  const scriptStats = [];
  for (const file of scripts) {
    const info = await stat(file);
    scriptStats.push({
      file: path.relative(ROOT, file).replace(/\\/g, "/"),
      bytes: info.size,
      referencedInPackage: false,
    });
  }

  const packageJson = JSON.parse(await readProjectFile("package.json"));
  const packageScriptText = JSON.stringify(packageJson.scripts || {});
  scriptStats.forEach((item) => {
    item.referencedInPackage = packageScriptText.includes(item.file) || packageScriptText.includes(item.file.replace("scripts/", "scripts\\"));
  });

  const checks = [
    {
      id: "keep_raw_uploads_disabled",
      ok: /const\s+KEEP_RAW_UPLOADS_IN_STORAGE\s*=\s*false\s*;/.test(app),
      detail: "KEEP_RAW_UPLOADS_IN_STORAGE must stay false for processed-only.",
    },
    {
      id: "no_dashboard_storage_download",
      ok: !/storage\.from\(["']dashboard-files["']\)\.download\s*\(/.test(app),
      detail: "Dashboard must not download raw files from Storage to render.",
    },
    {
      id: "dashboard_storage_upload_guarded",
      ok: /if\s*\(\s*KEEP_RAW_UPLOADS_IN_STORAGE\s*\)[\s\S]{0,300}storage\s*\.from\(["']dashboard-files["']\)\s*\.upload/.test(app),
      detail: "Raw upload is guarded by KEEP_RAW_UPLOADS_IN_STORAGE.",
    },
    {
      id: "load_persisted_module_path",
      ok: /async function loadPersistedDatasetForModule/.test(app) && /fetchAllProcessedRowsFromTable/.test(app),
      detail: "Modules can load from persisted tables.",
    },
    {
      id: "file_delete_uses_tables",
      ok: /async function deleteImportedRowsForRecord/.test(app) && /deleteProcessedDashboardFileMetadata/.test(app),
      detail: "Deletion path removes persisted rows and processed metadata.",
    },
    {
      id: "module_key_constants",
      ok: canonicalKeys.every((key) => app.includes(`"${key}"`)),
      detail: "Canonical module keys are declared.",
    },
  ];

  const storageMentions = codeFiles.map((file) => ({
    file,
    storageMentions: countPattern(contents[file], /storage_path|storage\.from|dashboard-files|KEEP_RAW_UPLOADS_IN_STORAGE/g),
  }));

  const legacyKeyMentions = codeFiles.map((file) => ({
    file,
    mentions: legacyKeys.reduce((sum, key) => sum + contents[file].split(key).length - 1, 0),
  })).filter((item) => item.mentions > 0);

  const cssDuplicateSelectors = [];
  const selectorCounts = new Map();
  for (const match of styles.matchAll(/(^|\n)\s*([^{}\n][^{]+)\s*\{/g)) {
    const selector = match[2].trim();
    if (!selector || selector.startsWith("@")) continue;
    selectorCounts.set(selector, (selectorCounts.get(selector) || 0) + 1);
  }
  for (const [selector, count] of selectorCounts) {
    if (count > 1) cssDuplicateSelectors.push({ selector, count });
  }
  cssDuplicateSelectors.sort((a, b) => b.count - a.count || a.selector.localeCompare(b.selector));

  const report = {
    generatedAt: new Date().toISOString(),
    checks,
    storageMentions,
    legacyKeyMentions,
    scriptStats,
    cssDuplicateSelectors: cssDuplicateSelectors.slice(0, 80),
    notes: [
      "Legacy module key mentions are acceptable only inside normalization or migration compatibility paths.",
      "Storage mentions are acceptable for avatars, optional guarded raw upload, and best-effort deletion, not rendering.",
    ],
  };
  const reportPath = await writeAuditReport("dashboard-health", report);

  printSection("Dashboard health");
  checks.forEach((check) => console.log(`${check.ok ? "ok" : "falha"} ${check.id}: ${check.detail}`));
  console.log(`Legacy key files: ${legacyKeyMentions.length}`);
  console.log(`CSS duplicate selectors sampled: ${report.cssDuplicateSelectors.length}`);
  console.log(`Scripts found: ${scriptStats.length}`);
  console.log(`Relatorio: ${reportPath}`);

  if (checks.some((check) => !check.ok)) process.exitCode = 2;
} catch (error) {
  console.error("[Dashboard Health] Falha:", error);
  process.exit(1);
}
