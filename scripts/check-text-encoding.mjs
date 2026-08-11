#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = spawnSync("git", ["ls-files", "-z"], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (tracked.status !== 0) {
  console.error("Unable to list tracked files.");
  if (tracked.stderr) console.error(tracked.stderr.trim());
  process.exit(tracked.status || 1);
}

const textExtensions = new Set([
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

const ignoredPathParts = new Set([".next", "coverage", "dist", "node_modules", "scripts/logs"]);
const mojibakePatterns = [
  /\u00C3[\u0080-\u00BF]/u,
  /\u00C2(?:[\u00A0-\u00BF]|\s)/u,
  /\u00E2(?:\u20AC|\u201A|\u0192|\u201E|\u2026|\u2020|\u2021|\u02C6|\u2030|\u0160|\u2039|\u0152|\u017D|\u2018|\u2019|\u201C|\u201D|\u2022|\u2013|\u2014|\u02DC|\u2122|\u0161|\u203A|\u0153)/u,
  /\uFFFD/u,
];

function extensionOf(file) {
  const lower = file.toLowerCase();
  const index = lower.lastIndexOf(".");
  return index >= 0 ? lower.slice(index) : "";
}

function shouldInspect(file) {
  const normalized = file.replace(/\\/g, "/");
  if ([...ignoredPathParts].some((part) => normalized === part || normalized.startsWith(`${part}/`))) return false;
  if (normalized.endsWith(".env.example")) return true;
  return textExtensions.has(extensionOf(normalized));
}

const failures = [];
const files = tracked.stdout.split("\0").filter(Boolean).filter(shouldInspect);

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (mojibakePatterns.some((pattern) => pattern.test(line))) {
      failures.push({
        file,
        line: index + 1,
        text: line.trim().slice(0, 160),
      });
    }
  });
}

if (failures.length > 0) {
  console.error("Potential text encoding corruption found:");
  for (const failure of failures) {
    console.error(`${failure.file}:${failure.line}: ${failure.text}`);
  }
  process.exit(1);
}

console.log(`Text encoding check passed for ${files.length} tracked text files.`);
