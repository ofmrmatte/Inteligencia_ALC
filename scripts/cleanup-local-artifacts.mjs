#!/usr/bin/env node
import fs from "fs";
import path from "path";
import process from "process";

const root = process.cwd();
const apply = process.argv.includes("--apply");

const rootFilePatterns = [
  /^app\.js\.backup.*$/i,
  /^app\.js\.bak.*$/i,
  /^app\.js\.fase.*$/i,
  /^app\.js\.loading.*$/i,
  /^app\.js\.fix-.*$/i,
  /^app\.js\.before-revert-.*$/i,
  /^app\.js\.perf-.*$/i,
  /^index\.html\.bak$/i,
  /^conserta_tudo\.py$/i,
  /^mapear_layout\.py$/i,
  /^patch_layout_unificado\.py$/i,
  /^mapa_layout\.md$/i,
  /^.*\.(old|orig|rej|tmp)$/i,
];

const removableDirectories = [
  path.join(root, "scripts", "logs"),
  path.join(root, "scripts", "railway", "exports"),
  path.join(root, "scripts", "railway", "logs"),
];

const protectedNames = new Set([
  ".env",
  ".env.local",
  ".env.staging.railway",
  ".env.example",
  "node_modules",
  "supabase",
  "assets",
]);

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function safeRemove(target) {
  const resolved = path.resolve(target);
  if (resolved === root || !isInside(root, resolved)) {
    throw new Error(`Caminho fora do repositorio bloqueado: ${target}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function collectRootFiles() {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => !protectedNames.has(entry.name))
    .filter((entry) => rootFilePatterns.some((pattern) => pattern.test(entry.name)))
    .map((entry) => path.join(root, entry.name));
}

function collectDirectories() {
  return removableDirectories.filter((dir) => fs.existsSync(dir));
}

const targets = [...collectRootFiles(), ...collectDirectories()]
  .map((target) => path.resolve(target))
  .sort((a, b) => a.localeCompare(b));

console.log(apply ? "Modo apply: removendo artefatos locais." : "Modo dry-run: nenhum arquivo sera removido.");

if (!targets.length) {
  console.log("Nenhum artefato local descartavel encontrado.");
  process.exit(0);
}

for (const target of targets) {
  console.log(`${apply ? "remove" : "would remove"} ${path.relative(root, target)}`);
}

if (apply) {
  for (const target of targets) safeRemove(target);
}
