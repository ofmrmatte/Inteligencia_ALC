#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PRODUCT_NAME = "Inteligência ALC";
const APP_DIR = path.join(ROOT, "app");

async function listPages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await listPages(fullPath));
    if (entry.isFile() && entry.name === "page.tsx") output.push(fullPath);
  }
  return output;
}

const failures = [];
for (const page of await listPages(APP_DIR)) {
  const content = await readFile(page, "utf8");
  const relativePath = path.relative(ROOT, page).replace(/\\/g, "/");
  const metadataTitleMatch = content.match(/export\s+const\s+metadata[\s\S]*?title:\s*["'`]([^"'`]+)["'`]/);
  if (!metadataTitleMatch) continue;
  const title = metadataTitleMatch[1];
  if (title.includes(PRODUCT_NAME)) {
    failures.push(`${relativePath}: page metadata title must not include "${PRODUCT_NAME}" because app/layout.tsx owns the suffix.`);
  }
}

if (failures.length) {
  console.error("Metadata title check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Metadata title check passed.");
