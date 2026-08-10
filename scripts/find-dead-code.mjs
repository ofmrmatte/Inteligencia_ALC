import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { printSection, writeAuditReport } from "./audit-utils.mjs";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "features", "lib"];
const forbiddenRuntimePatterns = [
  { id: "module_foundation", pattern: /ModuleFoundation|module-foundation|module-foundation/ },
  { id: "fake_topbar_search", pattern: /topbar-search/ },
  { id: "legacy_runtime", pattern: /legacy\/|legacy\\|window\.supabaseClient|assets\/vendor/ },
];

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

function exportNames(content) {
  return [
    ...content.matchAll(/export\s+(?:function|const|class|type|interface)\s+([A-Za-z_$][\w$]*)/g),
  ].map((match) => match[1]);
}

function countRefs(allText, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...allText.matchAll(new RegExp(`\\b${escaped}\\b`, "g"))].length;
}

try {
  const files = [];
  for (const dir of SCAN_DIRS) {
    for (const file of await listFiles(dir)) {
      files.push({ path: file, content: await readFile(path.join(ROOT, file), "utf8") });
    }
  }
  const allText = files.map((file) => file.content).join("\n");
  const forbiddenHits = forbiddenRuntimePatterns.flatMap((item) =>
    files
      .filter((file) => item.pattern.test(file.content))
      .map((file) => ({ id: item.id, file: file.path }))
  );
  const exportedSymbols = files.flatMap((file) =>
    exportNames(file.content).map((name) => ({ file: file.path, name, references: countRefs(allText, name) }))
  );
  const lowReferenceExports = exportedSymbols
    .filter((symbol) => symbol.references <= 1 && !/\/page\.tsx$|\/layout\.tsx$|\/loading\.tsx$|\/route\.ts$/.test(symbol.file))
    .sort((a, b) => a.references - b.references || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));

  const report = {
    generatedAt: new Date().toISOString(),
    caveat: "Heuristica estatica. Exports com baixa referencia devem ser revisados antes de remocao.",
    forbiddenHits,
    lowReferenceExports: lowReferenceExports.slice(0, 120),
  };
  const reportPath = await writeAuditReport("dead-code", report);

  printSection("Dead code heuristic");
  console.log(`Forbidden runtime hits: ${forbiddenHits.length}`);
  console.log(`Low-reference exports sampled: ${report.lowReferenceExports.length}`);
  console.log(`Relatorio: ${reportPath}`);

  if (forbiddenHits.length) process.exitCode = 2;
} catch (error) {
  console.error("[Dead Code] Falha:", error);
  process.exit(1);
}
