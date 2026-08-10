#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const auditGroups = {
  ci: [
    "audit:dashboard",
    "audit:dead-code",
  ],
  db: [
    "audit:module-isolation",
    "audit:dedupe",
    "audit:row-counts",
    "audit:raw-data",
    "audit:supabase",
  ],
};

auditGroups.all = [...auditGroups.ci, ...auditGroups.db];

const group = process.argv[2] || "all";
const auditScripts = auditGroups[group];

if (!auditScripts) {
  console.error(`Grupo de auditoria inválido: ${group}`);
  console.error(`Use um destes: ${Object.keys(auditGroups).join(", ")}`);
  process.exit(1);
}

const groupLabels = {
  ci: "auditorias offline para CI/Dependabot",
  db: "auditorias PostgreSQL read-only",
  all: "todas as auditorias",
};

console.log(`Executando ${groupLabels[group]}.`);

/*
Classificacao:
- audit:dashboard: STATIC/OFFLINE
- audit:dead-code: STATIC/OFFLINE
- audit:module-isolation: DATABASE READ-ONLY
- audit:dedupe: DATABASE READ-ONLY
- audit:row-counts: DATABASE READ-ONLY
- audit:raw-data: DATABASE READ-ONLY
- audit:supabase: DATABASE READ-ONLY
*/

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
