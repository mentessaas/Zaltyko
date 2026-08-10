/**
 * Aggregate runner: invokes A2 and A3 in sequence and exits non-zero if either
 * gate reports a finding. Useful in CI:
 *
 *   pnpm gate:all
 *
 * Equivalent to:
 *
 *   pnpm gate:reads --strict && pnpm gate:auth --strict
 *
 * but with a unified report at the end so reviewers can scan both summaries.
 */
import { spawnSync } from "node:child_process";
import * as path from "node:path";

const HERE = __dirname;
const TARGET_DIR = path.join(HERE, "..", "..", "..", "node_modules", ".bin", "tsx");
function runGate(script: string, args: string[]): number {
  const proc = spawnSync("node", [TARGET_DIR, script, ...args], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
  return proc.status ?? 1;
}

function main() {
  const readsStatus = runGate(path.join(HERE, "unbounded-reads.ts"), ["--strict"]);
  const authStatus = runGate(path.join(HERE, "auth-before-validate.ts"), ["--strict"]);

  if (readsStatus !== 0 || authStatus !== 0) {
    process.stdout.write(`\n[gates] violations — A2=${readsStatus}, A3=${authStatus}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("\n[gates] all clean.\n");
  }
}

main();
