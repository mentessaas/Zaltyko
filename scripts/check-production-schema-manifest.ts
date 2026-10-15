#!/usr/bin/env tsx
/* eslint-disable no-console */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  checkProductionSchemaManifest,
  parseStaticCheckSource,
  PRODUCTION_SCHEMA_CANDIDATE,
} from "./lib/production-schema-manifest";

// Local files / pinned local Git objects only. No dotenv, DB or network imports.
try {
  const source = parseStaticCheckSource(process.argv.slice(2));
  const root = process.cwd();
  const manifest: unknown = JSON.parse(
    readFileSync(
      resolve(root, "docs/deployment/production-schema-manifest-5d072d19.json"),
      "utf8"
    )
  );
  const result = checkProductionSchemaManifest(manifest, (filename) =>
    source === "worktree"
      ? readFileSync(resolve(root, "supabase/migrations", filename))
      : execFileSync(
          "git",
          [
            "--no-replace-objects",
            "show",
            `${PRODUCTION_SCHEMA_CANDIDATE}:supabase/migrations/${filename}`,
          ],
          {
            cwd: root,
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer: 2_000_000,
            // Partial clones must fail on absent objects instead of fetching.
            env: {
              ...process.env,
              GIT_NO_LAZY_FETCH: "1",
              GIT_TERMINAL_PROMPT: "0",
            },
          }
        )
  );
  console.log(JSON.stringify({ source, ...result }, null, 2));
  process.exitCode = result.status === "PASS" ? 0 : 1;
} catch {
  console.error(
    JSON.stringify({
      status: "BLOCKED",
      mode: "static-only",
      schemaReadiness: "NOT_VERIFIED",
      activationAllowed: false,
      code: "INPUT_UNAVAILABLE_OR_ARGUMENTS_INVALID",
    })
  );
  process.exitCode = 1;
}
