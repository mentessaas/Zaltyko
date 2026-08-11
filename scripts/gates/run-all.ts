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
import * as path from "node:path";

import { runTsx } from "./lib/run-tsx";

const HERE = __dirname;

// tsx is resolved through Node's module resolver rather than `npx` or a
// `node_modules/.bin` path — see lib/run-tsx.ts for why both of those break.
function runGate(script: string, args: string[]): number {
  const proc = runTsx(script, args, { stdio: "inherit" });
  if (proc.error || proc.status === null) {
    // Failing to launch the gate is not "no violations found" — surface it.
    process.stderr.write(
      `[gates] failed to run ${path.basename(script)}: ${proc.error?.message ?? `signal ${proc.signal}`}\n`,
    );
    return 1;
  }
  return proc.status;
}

function main() {
  // Extra CLI args (e.g. `--root <dir>`) are forwarded to both gates so this
  // entrypoint can be exercised against fixtures in the self-tests.
  const forwarded = process.argv.slice(2);
  const readsStatus = runGate(path.join(HERE, "unbounded-reads.ts"), ["--strict", ...forwarded]);
  const authStatus = runGate(path.join(HERE, "auth-before-validate.ts"), ["--strict", ...forwarded]);

  if (readsStatus !== 0 || authStatus !== 0) {
    process.stdout.write(`\n[gates] violations — A2=${readsStatus}, A3=${authStatus}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("\n[gates] all clean.\n");
  }
}

main();
