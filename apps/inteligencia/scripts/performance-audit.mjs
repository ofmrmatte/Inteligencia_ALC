import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "lib", "scripts"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const MAX_LIST = 30;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

const files = SOURCE_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)))
  .filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)))
  .map(rel);

const fileSet = new Set(files);
const contents = new Map(files.map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));

function resolveLocal(from, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  else return null;

  const candidates = [
    base,
    ...[...SOURCE_EXTENSIONS].map((ext) => base + ext),
    ...[...SOURCE_EXTENSIONS].map((ext) => path.posix.join(base, "index" + ext)),
  ];
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

function externalPackage(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("@/")) return null;
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

const inbound = new Map(files.map((file) => [file, 0]));
const packageImports = new Map();
const apiReferences = new Map();
const diagnostics = [];

for (const [file, source] of contents) {
  const specifiers = [];
  for (const match of source.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)) specifiers.push(match[1]);
  for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) specifiers.push(match[1]);

  for (const specifier of new Set(specifiers)) {
    const target = resolveLocal(file, specifier);
    if (target) inbound.set(target, (inbound.get(target) ?? 0) + 1);
    const dependency = externalPackage(specifier);
    if (dependency) packageImports.set(dependency, (packageImports.get(dependency) ?? 0) + 1);
  }

  for (const match of source.matchAll(/["'`](\/api\/[A-Za-z0-9_./\-\[\]]+)/g)) {
    const endpoint = match[1];
    const refs = apiReferences.get(endpoint) ?? [];
    refs.push(file);
    apiReferences.set(endpoint, refs);
  }

  const markers = [
    ["console.log", /\bconsole\.log\s*\(/g],
    ["console.debug", /\bconsole\.debug\s*\(/g],
    ["console.time", /\bconsole\.time(?:End)?\s*\(/g],
    ["debugger", /\bdebugger\s*;/g],
    ["TODO", /\bTODO\b/g],
    ["FIXME", /\bFIXME\b/g],
  ];
  for (const [label, regex] of markers) {
    const count = [...source.matchAll(regex)].length;
    if (count) diagnostics.push({ file, marker: label, count });
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const scriptRoots = new Set();
for (const command of Object.values(packageJson.scripts ?? {})) {
  if (typeof command !== "string") continue;
  for (const match of command.matchAll(/(?:node|tsx)\s+([^\s]+)/g)) {
    const candidate = match[1].replace(/^\.\//, "");
    if (fileSet.has(candidate)) scriptRoots.add(candidate);
  }
}

function isFrameworkRoot(file) {
  if (/^app\/(?:.*\/)?(?:page|layout|route|loading|error|not-found)\.(?:ts|tsx|js|jsx)$/.test(file)) return true;
  if (file === "lib/supabase/proxy.ts") return true;
  return false;
}

const orphanCandidates = files
  .filter((file) => (inbound.get(file) ?? 0) === 0 && !isFrameworkRoot(file) && !scriptRoots.has(file))
  .map((file) => ({ file, bytes: Buffer.byteLength(contents.get(file) ?? ""), reason: "sem import/referência interna detectada" }))
  .sort((a, b) => b.bytes - a.bytes);

const dependencies = Object.keys(packageJson.dependencies ?? {});
const unusedDependencyCandidates = dependencies
  .filter((dependency) => !packageImports.has(dependency))
  .sort();

const apiRoutes = files.filter((file) => /^app\/api\/.+\/route\.(?:ts|js)$/.test(file));
function routePath(file) {
  return "/" + file.replace(/^app\//, "").replace(/\/route\.(?:ts|js)$/, "").replace(/\[([^\]]+)\]/g, "[$1]");
}
const unreferencedApiCandidates = apiRoutes
  .map((file) => ({ file, route: routePath(file) }))
  .filter(({ route }) => ![...apiReferences.keys()].some((ref) => ref === route || ref.startsWith(route.replace(/\[[^\]]+\]/g, ""))))
  .map((item) => ({ ...item, note: "sem referência literal no frontend; pode ser API externa/dinâmica" }));

const largeSources = files
  .map((file) => ({ file, bytes: Buffer.byteLength(contents.get(file) ?? ""), inbound: inbound.get(file) ?? 0 }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 25);

const report = {
  generatedAt: new Date().toISOString(),
  sourceFiles: files.length,
  totalSourceBytes: files.reduce((sum, file) => sum + Buffer.byteLength(contents.get(file) ?? ""), 0),
  orphanCandidates: orphanCandidates.slice(0, MAX_LIST),
  unusedDependencyCandidates,
  debugMarkers: diagnostics,
  unreferencedApiCandidates: unreferencedApiCandidates.slice(0, MAX_LIST),
  largeSources,
};

console.log("ALC PERFORMANCE AUDIT");
console.log(JSON.stringify(report, null, 2));
