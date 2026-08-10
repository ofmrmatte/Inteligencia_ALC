#!/usr/bin/env node
import "dotenv/config";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.error("Public CI environment validation failed.");
  for (const name of missing) {
    console.error(`Missing GitHub Actions repository variable: ${name}`);
  }
  process.exit(1);
}

console.log("Public CI environment validation passed.");
