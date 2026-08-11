/**
 * Self-test runner for all gates (A2, A3, A4).
 *
 * Usage:
 *   pnpm gate:test
 *
 * Strategy:
 *   1. Run A2 (unbounded-reads) against the positive fixture. Expect 0 findings.
 *   2. Run A2 against the negative fixture. Expect ≥ 5 findings (one per `badN`).
 *   3. Run A3 (auth-before-validate) against the positive fixture. Expect 0 findings.
 *   4. Run A3 against the negative fixture. Expect ≥ 3 findings (POST/PATCH/PUT).
 *   5. Run A4 (orphan-app-route) against the positive fixture. Expect 0 findings.
 *   6. Run A4 against the negative fixture. Expect ≥ 3 findings (one per leak shape).
 *   7. Run A2/A3/A4 against combined mixed fixtures and ensure no gate explodes.
 *   8. Exercise the CI entrypoint (`pnpm gate:all`) directly so a runner that
 *      cannot launch its children cannot fake a green run.
 *
 * No vitest dependency; we use a plain assertion runner because the goal is
 * to validate static-gate outputs without pulling a heavyweight test stack
 * into the gates dir. CI can wire this into `pnpm gate:test` and gate:all.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { runTsx } from "../lib/run-tsx";
import { scanFile as scanReadsFile } from "../unbounded-reads";
import { scanFile as scanAuthFile } from "../auth-before-validate";
import { scanFile as scanOrphanFile } from "../orphan-app-route";

const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "..", "..");
const POSITIVE_DIR = path.join(ROOT, "__fixtures__", "positive");
const NEGATIVE_DIR = path.join(ROOT, "__fixtures__", "negative");
const AUTH_POSITIVE = path.join(POSITIVE_DIR, "auth-order");
const AUTH_NEGATIVE = path.join(NEGATIVE_DIR, "auth-order");
const ORPHAN_POSITIVE = path.join(ROOT, "__fixtures__", "orphan-app-route", "positive");
const ORPHAN_NEGATIVE = path.join(ROOT, "__fixtures__", "orphan-app-route", "negative");

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

function listFilesRecursive(dir: string, predicate: (p: string) => boolean = () => true): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop() as string;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && predicate(full)) {
        out.push(full);
      }
    }
  }
  return out;
}

function expectFileFindings(
  label: string,
  scan: (p: string) => unknown[],
  dir: string,
  expectedCount: number,
  predicate?: (finding: any) => boolean,
  options: { recursive?: boolean; fileFilter?: (p: string) => boolean } = {},
) {
  const isRecursive = options.recursive ?? false;
  const fileFilter = options.fileFilter ?? (() => true);
  const files = isRecursive
    ? listFilesRecursive(dir, fileFilter)
    : fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => path.join(dir, e.name));
  let totalFindings = 0;
  for (const file of files) {
    let findings: unknown[];
    try {
      findings = scan(file) as any[];
    } catch (err) {
      // iCloud dataless / unreadable files should not crash the test;
      // treat them as zero findings (the gate itself does the same).
      if ((err as NodeJS.ErrnoException).errno === -11) continue;
      throw err;
    }
    totalFindings += findings.length;
  }
  if (expectedCount === 0) {
    note(`${label} → zero findings`, totalFindings === 0, `got ${totalFindings}`);
  } else if (predicate) {
    let matched = 0;
    for (const file of files) {
      let findings: unknown[];
      try {
        findings = scan(file) as any[];
      } catch (err) {
        if ((err as NodeJS.ErrnoException).errno === -11) continue;
        throw err;
      }
      matched += findings.filter(predicate).length;
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

  // A4 positive = 0 findings (whitelisted + escape hatch + page-auth + parent-layout)
  expectFileFindings(
    "A4 orphan-app-route (positive)",
    (p) => scanOrphanFile(p),
    ORPHAN_POSITIVE,
    0,
    undefined,
    { recursive: true, fileFilter: (p) => p.endsWith("page.tsx") },
  );

  // A4 negative = ≥3 findings (one per leak shape: no-auth, no-layout, whitelist-shaped-but-bare)
  expectFileFindings(
    "A4 orphan-app-route (negative)",
    (p) => scanOrphanFile(p),
    ORPHAN_NEGATIVE,
    3,
    (f) => f.rule === "A4/orphan-app-route",
    { recursive: true, fileFilter: (p) => p.endsWith("page.tsx") },
  );

  // Smoke-test the gate scripts end-to-end against the positive/negative
  // fixtures, asserting the exit code reflects strictness.
  //
  // Two things this deliberately does NOT do, because both previously hid a
  // broken CI entrypoint behind a green run:
  //   1. It does not shell out to `npx` (cwd-sensitive; hangs inside this repo).
  //   2. It does not treat `status !== 0` as success — a spawn that never ran
  //      reports `status === null`, which would satisfy a `!== 0` assertion.
  const checkExit = (label: string, scriptPath: string, args: string[], expectNonZero: boolean) => {
    const proc = runTsx(scriptPath, args, { cwd: REPO_ROOT, stdio: "pipe" });
    let ok: boolean;
    let detail: string;
    if (proc.error || proc.status === null) {
      ok = false;
      detail = `failed to launch: ${proc.error?.message ?? `signal ${proc.signal}`}`;
    } else {
      ok = expectNonZero ? proc.status === 1 : proc.status === 0;
      detail = `exit=${proc.status} stderr=${(proc.stderr || "").slice(0, 200)}`;
    }
    note(label, ok, detail);
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
  checkExit(
    "tsx A4 negative fixture strict",
    path.join(ROOT, "orphan-app-route.ts"),
    ["--root", ORPHAN_NEGATIVE, "--strict"],
    true,
  );
  checkExit(
    "tsx A4 positive fixture",
    path.join(ROOT, "orphan-app-route.ts"),
    ["--root", ORPHAN_POSITIVE],
    false,
  );

  // Exercise the CI entrypoint itself (`pnpm gate:all`). Until now nothing
  // covered run-all.ts, so a runner that could not launch its child gates still
  // produced a fully green self-test run — the exact gap that let a broken
  // `gate:all` ship twice. Scoped to fixtures via --root to stay fast.
  //
  // The *positive* case is the load-bearing one: a gate that fails to launch
  // also exits 1, so it is indistinguishable from "found violations" on the
  // negative fixtures. Only "clean tree must exit 0" catches a broken runner.
  const checkRunAll = (label: string, root: string, expectNonZero: boolean) => {
    const proc = runTsx(path.join(ROOT, "run-all.ts"), ["--root", root], {
      cwd: REPO_ROOT,
      stdio: "pipe",
    });
    const combined = `${proc.stdout || ""}${proc.stderr || ""}`;
    if (proc.error || proc.status === null) {
      note(label, false, `failed to launch: ${proc.error?.message ?? `signal ${proc.signal}`}`);
      return;
    }
    // A runner that cannot spawn its gates must not look like a clean pass.
    const launchFailed = combined.includes("[gates] failed to run");
    const ok = !launchFailed && (expectNonZero ? proc.status === 1 : proc.status === 0);
    note(label, ok, `exit=${proc.status}${launchFailed ? " (child gate failed to launch)" : ""}`);
  };

  checkRunAll("gate:all entrypoint — negative fixtures exit 1", NEGATIVE_DIR, true);
  checkRunAll("gate:all entrypoint — positive fixtures exit 0", POSITIVE_DIR, false);

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
