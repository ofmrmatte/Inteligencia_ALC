import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, "dist");
const resolvedOutput = await realpath(output).catch(() => output);
if (relative(root, resolvedOutput).startsWith(`..${sep}`) || relative(root, resolvedOutput) === ".." || resolvedOutput === root) {
  throw new Error("Destino do build fora de extension-pnr.");
}
const manifest = JSON.parse(await readFile(join(root, "src", "manifest.json"), "utf8"));
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (manifest.version !== version) throw new Error("Versões do manifest e package.json divergem.");
const files = ["manifest.json", "panel-bridge.js", "case-center.js", "service-worker.js"];
const archive = {};

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  const content = await readFile(join(root, "src", file));
  await writeFile(join(output, file), content);
  archive[`alc-pnr-connector/${file}`] = new Uint8Array(content);
}
const downloads = join(root, "..", "public", "downloads");
await mkdir(downloads, { recursive: true });
await writeFile(join(downloads, `alc-pnr-connector-v${version}.zip`), zipSync(archive, { level: 6 }));
console.log(`ALC PNR Connector v${version} gerado em extension-pnr/dist e public/downloads`);
