import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { printSection, writeAuditReport } from "./audit-utils.mjs";

const ROOT = process.cwd();
const filesToScan = ["app.js", "styles.css", "index.html", "supabaseClient.js", "authService.js", "dashboardCacheService.js"];

async function readText(file) {
  return readFile(path.join(ROOT, file), "utf8");
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(full));
    else if (entry.isFile()) output.push(full);
  }
  return output;
}

function countWord(allText, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...allText.matchAll(new RegExp(`\\b${escaped}\\b`, "g"))].length;
}

try {
  const contents = Object.fromEntries(await Promise.all(filesToScan.map(async (file) => [file, await readText(file)])));
  const scripts = await listFiles(path.join(ROOT, "scripts"));
  for (const script of scripts.filter((file) => file.endsWith(".mjs"))) {
    contents[path.relative(ROOT, script).replace(/\\/g, "/")] = await readFile(script, "utf8");
  }
  const allText = Object.values(contents).join("\n");
  const applicationText = filesToScan.map((file) => contents[file] || "").join("\n");
  const app = contents["app.js"];

  const functions = [...app.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((match) => match[1])
    .filter((name) => !name.startsWith("_"));

  const variables = [...app.matchAll(/\b(?:const|let|var)\s+([A-Z][A-Z0-9_]{3,}|[a-zA-Z_$][\w$]*)\s*=/g)]
    .map((match) => match[1])
    .filter((name) => !["el", "state", "library"].includes(name));

  const functionCandidates = [...new Set(functions)]
    .map((name) => ({ name, references: countWord(allText, name) }))
    .filter((item) => item.references <= 1)
    .sort((a, b) => a.references - b.references || a.name.localeCompare(b.name));

  const variableCandidates = [...new Set(variables)]
    .map((name) => ({ name, references: countWord(allText, name) }))
    .filter((item) => item.references <= 1)
    .sort((a, b) => a.references - b.references || a.name.localeCompare(b.name));

  const oldPatternHits = [
    { pattern: "textarea", matches: [...applicationText.matchAll(/textarea/gi)].length },
    { pattern: "Storage download dashboard-files", matches: [...applicationText.matchAll(/storage\.from\(["']dashboard-files["']\)\.download/gi)].length },
    { pattern: "legacy module keys", matches: [...applicationText.matchAll(/pre-fatura|gestao-pacotes|gestao-desvios-pnr|desvios-pnr|pacotes-faltantes/g)].length },
    { pattern: "ofensividade", matches: [...applicationText.matchAll(/ofensividade/gi)].length },
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    caveat: "Static heuristic only. Review every candidate before removal because browser handlers and dynamic selectors can look unused.",
    functionCandidates,
    variableCandidates: variableCandidates.slice(0, 120),
    oldPatternHits,
  };
  const reportPath = await writeAuditReport("dead-code", report);

  printSection("Dead code heuristic");
  console.log(`Functions with <=1 reference: ${functionCandidates.length}`);
  console.log(`Variables/constants with <=1 reference: ${report.variableCandidates.length}`);
  oldPatternHits.forEach((hit) => console.log(`${hit.pattern}: ${hit.matches}`));
  console.log(`Relatorio: ${reportPath}`);
} catch (error) {
  console.error("[Dead Code] Falha:", error);
  process.exit(1);
}
