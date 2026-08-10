#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const auditScripts = [
  "audit:dashboard",
  "audit:dead-code",
  "audit:module-isolation",
  "audit:dedupe",
  "audit:row-counts",
  "audit:raw-data",
  "audit:supabase",
];

let failed = false;

for (const script of auditScripts) {
  console.log(`\n== npm run ${script} ==`);
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
