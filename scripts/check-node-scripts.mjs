#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCRIPT_DIRS = ["scripts"];
const excluded = new Set(["scripts/logs"]);

async function listScripts(dir) {
  const entries = await readdir(path.join(ROOT, dir), { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const relativePath = path.join(dir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (!excluded.has(relativePath)) output.push(...await listScripts(relativePath));
    } else if (entry.isFile() && relativePath.endsWith(".mjs")) {
      output.push(relativePath);
    }
  }
  return output;
}

let failed = false;
for (const script of (await Promise.all(SCRIPT_DIRS.map(listScripts))).flat().sort()) {
  const result = spawnSync(process.execPath, ["--check", script], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failed = true;
    console.error(`node --check failed: ${script}`);
    if (result.stderr) console.error(result.stderr.trim());
  }
}

if (failed) process.exit(1);
console.log("Node script syntax check passed.");
