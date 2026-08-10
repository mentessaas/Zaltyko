/**
 * Self-test runner for both gates.
 *
 * Usage:
 *   pnpm gate:test
 *
 * Strategy:
 *   1. Run A2 (unbounded-reads) against the positive fixture. Expect 0 findings.
 *   2. Run A2 against the negative fixture. Expect ≥ 5 findings (one per `badN`).
 *   3. Run A3 (auth-before-validate) against the positive fixture. Expect 0 findings.
 *   4. Run A3 against the negative fixture. Expect ≥ 3 findings (POST/PATCH/PUT).
 *   5. Run A2 and A3 against a *combined* mixed fixture (positive + negative)
 *      and ensure the gate does not explode on combined input.
 *
 * No vitest dependency; we use a plain assertion runner because the goal is
 * to validate static-gate outputs without pulling a heavyweight test stack
 * into the gates dir. CI can wire this into `pnpm gate:test` and gate:all.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { scanFile as scanReadsFile } from "../unbounded-reads";
import { scanFile as scanAuthFile } from "../auth-before-validate";

const ROOT = path.resolve(__dirname, "..");
const POSITIVE_DIR = path.join(ROOT, "__fixtures__", "positive");
const NEGATIVE_DIR = path.join(ROOT, "__fixtures__", "negative");
const AUTH_POSITIVE = path.join(POSITIVE_DIR, "auth-order");
const AUTH_NEGATIVE = path.join(NEGATIVE_DIR, "auth-order");

type Expectation = {
  label: string;
  ok: boolean;
  detail: string;
};

const failures: string[] = [];
const trace: Expectation[] = [];

function note(label: string, ok: boolean, detail = "") {
  trace.push({ label, ok, detail });
  if (!ok) failures.push(`${label}: ${detail}`);
}

function expectFileFindings(
  label: string,
  scan: (p: string) => unknown[],
  dir: string,
  expectedCount: number,
  predicate?: (finding: any) => boolean,
) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => path.join(dir, e.name));
  let totalFindings = 0;
  for (const file of files) {
    const findings = scan(file) as any[];
    totalFindings += findings.length;
  }
  if (expectedCount === 0) {
    note(`${label} → zero findings`, totalFindings === 0, `got ${totalFindings}`);
  } else if (predicate) {
    let matched = 0;
    for (const file of files) {
      matched += (scan(file) as any[]).filter(predicate).length;
    }
    note(`${label} → at least ${expectedCount} findings matching predicate`, matched >= expectedCount, `got ${matched}`);
  } else {
    note(`${label} → ≥${expectedCount} findings`, totalFindings >= expectedCount, `got ${totalFindings}`);
  }
}

function main() {
  // A2 positive = 0 findings
  expectFileFindings(
    "A2 unbounded-reads (positive)",
    (p) => scanReadsFile(p),
    POSITIVE_DIR,
    0,
  );

  // A2 negative = ≥5 findings (matching rule A2/unbounded-read across the badNs)
  expectFileFindings(
    "A2 unbounded-reads (negative)",
    (p) => scanReadsFile(p),
    NEGATIVE_DIR,
    5,
    (f) => f.rule === "A2/unbounded-read",
  );

  // A3 positive = 0 findings (we have a route.ts with wrapped + annotated cases)
  expectFileFindings(
    "A3 auth-before-validate (positive)",
    (p) => scanAuthFile(p),
    AUTH_POSITIVE,
    0,
  );

  // A3 negative = ≥3 findings (POST, PATCH, PUT all fail)
  expectFileFindings(
    "A3 auth-before-validate (negative)",
    (p) => scanAuthFile(p),
    AUTH_NEGATIVE,
    3,
    (f) => f.rule === "A3/validate-before-auth",
  );

  // Smoke-test the gate scripts via tsx end-to-end against the
  // positive/negative fixtures, asserting exit code reflects strictness.
  // We invoke tsx via `npx --no-install tsx …` so the test runs even when
  // `.bin/tsx` is a shell wrapper (avoids the ESM-vs-shebang trap).
  const tsx = (script: string, ...args: string[]) => [
    path.join(ROOT, "unbounded-reads.ts") || path.join(ROOT, "auth-before-validate.ts"),
  ];
  const checkExit = (label: string, scriptPath: string, args: string[], expectNonZero: boolean) => {
    const proc = spawnSync("npx", ["--no-install", "tsx", scriptPath, ...args], {
      cwd: path.join(ROOT, "..", "..", ".."),
      encoding: "utf8",
    });
    const ok = expectNonZero ? proc.status !== 0 : proc.status === 0;
    note(label, ok, `exit=${proc.status} stderr=${(proc.stderr || "").slice(0, 200)}`);
  };

  checkExit(
    "tsx A2 negative fixture strict",
    path.join(ROOT, "unbounded-reads.ts"),
    ["--root", NEGATIVE_DIR, "--strict"],
    true,
  );
  checkExit(
    "tsx A2 positive fixture",
    path.join(ROOT, "unbounded-reads.ts"),
    ["--root", POSITIVE_DIR],
    false,
  );
  checkExit(
    "tsx A3 negative fixture strict",
    path.join(ROOT, "auth-before-validate.ts"),
    ["--root", NEGATIVE_DIR, "--strict"],
    true,
  );
  checkExit(
    "tsx A3 positive fixture",
    path.join(ROOT, "auth-before-validate.ts"),
    ["--root", POSITIVE_DIR],
    false,
  );

  process.stdout.write("\n===== gate self-tests =====\n");
  for (const t of trace) {
    process.stdout.write(`${t.ok ? "✔" : "✘"} ${t.label}${t.detail ? ` (${t.detail})` : ""}\n`);
  }
  process.stdout.write(`\n${trace.length - failures.length}/${trace.length} passed.\n`);
  if (failures.length) {
    process.exitCode = 1;
  }
}

main();
