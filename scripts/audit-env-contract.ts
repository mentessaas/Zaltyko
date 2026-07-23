#!/usr/bin/env tsx
/* eslint-disable no-console */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function collect(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return collect(file);
    return /\.(ts|tsx|mjs)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)
      ? [file]
      : [];
  });
}

const files = [
  ...collect("src"),
  ...["middleware.ts", "next.config.mjs", "instrumentation.ts", "instrumentation-client.ts", "sentry.server.config.ts", "sentry.edge.config.ts"].filter((file) => {
    try { return statSync(file).isFile(); } catch { return false; }
  }),
];

const used = new Set<string>();
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    used.add(match[1]);
  }
}

const example = readFileSync(".env.example", "utf8");
const documented = new Set<string>();
for (const line of example.split("\n")) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
  if (match) documented.add(match[1]);
}

const missing = [...used].filter((name) => !documented.has(name)).sort();
if (missing.length > 0) {
  console.error("[env-contract] Variables usadas en runtime pero ausentes de .env.example:");
  for (const name of missing) console.error(`- ${name}`);
  process.exit(1);
}

console.log(`[env-contract] PASS: ${used.size} variables de runtime documentadas; valores no inspeccionados.`);
