#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

interface Gate {
  name: string;
  args: string[];
}

const requiredFiles = [
  "next.config.mjs",
  "vercel.json",
  "package.json",
  ".env.example",
  "middleware.ts",
  "public/sw.js",
  "src/lib/authz.ts",
  "src/lib/plans/catalog.ts",
  "src/app/layout.tsx",
];

const requiredDocumentedEnvVars = [
  "DATABASE_URL_POOL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "CRON_SECRET",
  "NEXTAUTH_SECRET",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "STRIPE_SECRET_KEY",
];

const gates: Gate[] = [
  { name: "API authorization inventory", args: ["audit:api-routes:strict"] },
  { name: "RLS source coverage", args: ["validate:rls"] },
  { name: "Migration ledgers", args: ["check:migrations"] },
  { name: "TypeScript", args: ["typecheck"] },
  { name: "ESLint", args: ["lint"] },
  { name: "Unit and integration tests", args: ["exec", "vitest", "run"] },
  { name: "Production build", args: ["build"] },
];

function staticPreflight(): string[] {
  const errors: string[] = [];

  for (const file of requiredFiles) {
    if (!existsSync(file)) errors.push(`Missing required file: ${file}`);
  }

  if (existsSync(".env.example")) {
    const envExample = readFileSync(".env.example", "utf8");
    for (const variable of requiredDocumentedEnvVars) {
      if (!envExample.includes(variable)) {
        errors.push(`Undocumented required environment variable: ${variable}`);
      }
    }
  }

  return errors;
}

function runGate(gate: Gate): boolean {
  console.log(`\n[release-gate] ${gate.name}`);
  const result = spawnSync("pnpm", gate.args, {
    cwd: process.cwd(),
    env: { ...process.env, CI: "1" },
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[release-gate] FAIL: ${result.error.message}`);
    return false;
  }

  if (result.status !== 0) {
    console.error(`[release-gate] FAIL: ${gate.name} exited with ${result.status ?? "unknown status"}`);
    return false;
  }

  console.log(`[release-gate] PASS: ${gate.name}`);
  return true;
}

const preflightErrors = staticPreflight();
if (preflightErrors.length > 0) {
  console.error("[release-gate] Static preflight failed:");
  preflightErrors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

console.log("[release-gate] Static preflight passed");

for (const gate of gates) {
  if (!runGate(gate)) process.exit(1);
}

console.log("\n[release-gate] PASS: all production invariants are green");
