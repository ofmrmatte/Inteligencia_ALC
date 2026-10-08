import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, "dist");
const resolvedOutput = await realpath(output).catch(() => output);
if (relative(root, resolvedOutput).startsWith(`..${sep}`) || relative(root, resolvedOutput) === ".." || resolvedOutput === root) {
  throw new Error("Destino do build fora de extensions/pnr-connector.");
}
const manifest = JSON.parse(await readFile(join(root, "src", "manifest.json"), "utf8"));
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (manifest.version !== version) throw new Error("Versões do manifest e package.json divergem.");

// Chrome MV3 supports module service workers, but a single classic worker is
// more resilient for unpacked/user-installed builds. Keep source modules for
// tests and bundle only the distributed artifact.
const distributedManifest = structuredClone(manifest);
delete distributedManifest.background?.type;

const caseCenterSource = await readFile(join(root, "src", "case-center.js"), "utf8");
const packageManagementSource = await readFile(join(root, "src", "package-management.js"), "utf8");
const serviceWorkerSource = await readFile(join(root, "src", "service-worker.js"), "utf8");
const bundledCaseCenter = caseCenterSource.replace(/^export\s+/gm, "");
const bundledWorker = serviceWorkerSource
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*["']\.\/case-center\.js["'];\s*/m, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*["']\.\/package-management\.js["'];\s*/m, "")
  .replace(/^export\s+/gm, "");
const serviceWorkerBundle = `${bundledCaseCenter}\n\n${packageManagementSource.replace(/^export\s+/gm, "")}\n\n${bundledWorker}`;

// Validate syntax during the application build without executing Chrome APIs.
new Function(serviceWorkerBundle);

const distributedFiles = new Map([
  ["manifest.json", Buffer.from(JSON.stringify(distributedManifest, null, 2) + "\n")],
  ["panel-bridge.js", await readFile(join(root, "src", "panel-bridge.js"))],
  ["case-center.js", Buffer.from(caseCenterSource)],
  ["service-worker.js", Buffer.from(serviceWorkerBundle)],
]);
const archive = {};

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const [file, content] of distributedFiles) {
  await writeFile(join(output, file), content);
  archive[`alc-pnr-connector/${file}`] = new Uint8Array(content);
}
for (const app of ["inteligencia", "atendimento"]) {
  const downloads = join(root, "..", "..", "apps", app, "public", "downloads");
  await mkdir(downloads, { recursive: true });
  await writeFile(join(downloads, `alc-pnr-connector-v${version}.zip`), zipSync(archive, { level: 6 }));
}
console.log(`ALC PNR Connector v${version} gerado em extensions/pnr-connector/dist e apps/inteligencia/public/downloads`);
