/**
 * Operational runner for the static-gate suite.
 *
 * ZAL-617 mandates two things that this runner provides:
 *
 *   1. Each scheduled run produces a durable artifact that survives the
 *      process exit. The gates themselves only print to stdout, which is
 *      fine for CI logs but useless for cost-waste triage beyond a couple
 *      of days. This runner saves the JSON report from every gate into
 *      `docs/audit/evidence/gates/<UTC-timestamp>.json` so the calibration
 *      report's 3-day retention floor can be raised to 14 days.
 *
 *   2. Retention: artifacts older than `retentionDays` (default 14, set
 *      via `--retention-days` or `GATE_RETENTION_DAYS`) are pruned on
 *      every invocation. This keeps the working set bounded and makes
 *      the helper self-cleaning.
 *
 * What this runner is NOT:
 *   - It is NOT a CI gate. It runs all gates in advisory mode (no `--strict`
 *     exit) and never blocks the build. The existing `pnpm gate:all`
 *     script remains the CI-blocking entrypoint.
 *   - It does not change the provider or add a secondary provider (out of
 *     scope per ZAL-358 / ZAL-617 description).
 *
 * Usage:
 *   pnpm gate:operational                       # run all gates + retention
 *   pnpm gate:operational -- --retention-days 30
 *   pnpm gate:operational -- --dry-run         # skip writes, just prune
 *   GATE_RETENTION_DAYS=21 pnpm gate:operational
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";

import { applyRetention } from "./lib/retention";
import { runTsx } from "./lib/run-tsx";

const HERE = __dirname;
const REPO_ROOT = path.resolve(HERE, "..", "..");

const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, "docs", "audit", "evidence", "gates");

interface GateSpec {
  /** Logical name used in the manifest and file path. */
  name: string;
  /** Path to the gate entrypoint, resolved relative to REPO_ROOT. */
  script: string;
}

const GATES: ReadonlyArray<GateSpec> = [
  { name: "unbounded-reads", script: "scripts/gates/unbounded-reads.ts" },
  { name: "auth-before-validate", script: "scripts/gates/auth-before-validate.ts" },
  { name: "orphan-app-route", script: "scripts/gates/orphan-app-route.ts" },
];

interface GateRunResult {
  gate: string;
  /** Raw stdout captured when the gate was spawned with `--json`. */
  json: unknown | null;
  /** Spawn status: 0 = clean, 1 = violations (in --strict mode), null = launch failed. */
  status: number | null;
  /** Error message if the spawn itself failed. */
  error: string | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  /** Wall-clock UTC ISO timestamp at which the gate started. */
  startedAt: string;
}

function parseRetentionDays(argv: string[]): number {
  const env = process.env.GATE_RETENTION_DAYS;
  if (env) {
    const n = Number.parseInt(env, 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(`GATE_RETENTION_DAYS must be a positive integer, got "${env}"`);
    }
    return n;
  }
  const flagIdx = argv.indexOf("--retention-days");
  if (flagIdx >= 0) {
    const raw = argv[flagIdx + 1];
    const n = Number.parseInt(raw ?? "", 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(`--retention-days expects a positive integer, got "${raw}"`);
    }
    return n;
  }
  return DEFAULT_RETENTION_DAYS;
}

function parseDryRun(argv: string[]): boolean {
  return argv.includes("--dry-run");
}

function utcTimestampSlug(d: Date = new Date()): string {
  // YYYYMMDDTHHMMSSZ — sortable, filename-safe, no spaces or colons.
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Run one gate with `--json` and parse its stdout. We deliberately invoke the
 * gate script via `runTsx` (not require) so each gate gets its own Node
 * process and there is no shared TypeScript checker state. The gates already
 * exit non-zero on `--strict` violations; here we capture that but do not
 * treat it as a runner failure — operational mode is informational.
 */
function runGate(spec: GateSpec): GateRunResult {
  const startedAt = new Date();
  const scriptAbs = path.join(REPO_ROOT, spec.script);
  const proc = runTsx(scriptAbs, ["--json"], { stdio: "pipe" });
  const durationMs = Date.now() - startedAt.getTime();

  if (proc.error || proc.status === null) {
    return {
      gate: spec.name,
      json: null,
      status: proc.status,
      error: proc.error?.message ?? `signal ${proc.signal ?? "unknown"}`,
      signal: proc.signal ?? null,
      durationMs,
      startedAt: startedAt.toISOString(),
    };
  }

  let parsed: unknown = null;
  const stdout = proc.stdout ?? "";
  if (stdout.trim()) {
    try {
      parsed = JSON.parse(stdout);
    } catch (err) {
      parsed = { __parse_error: (err as Error).message, stdout: stdout.slice(0, 4096) };
    }
  }

  return {
    gate: spec.name,
    json: parsed,
    status: proc.status,
    error: null,
    signal: proc.signal ?? null,
    durationMs,
    startedAt: startedAt.toISOString(),
  };
}

interface RunManifest {
  schemaVersion: 1;
  generatedAt: string;
  retentionDays: number;
  repoRoot: string;
  runnerVersion: string;
  dryRun: boolean;
  retention: { kept: number; removed: number; symlinks: number };
  gates: GateRunResult[];
}

const RUNNER_VERSION = "1.0.0";

function main() {
  const argv = process.argv.slice(2);
  const dryRun = parseDryRun(argv);
  const retentionDays = parseRetentionDays(argv);
  const outputDir = DEFAULT_OUTPUT_DIR;

  if (!dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const retention = applyRetention(outputDir, retentionDays);

  // Run the gates regardless of dryRun so the operator gets a fresh snapshot;
  // dry-run only suppresses the write step. If we skipped the runs in
  // dry-run mode, an operator could mistake the helper for a "no-op".
  const gates: GateRunResult[] = GATES.map(runGate);

  const manifest: RunManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    retentionDays,
    repoRoot: REPO_ROOT,
    runnerVersion: RUNNER_VERSION,
    dryRun,
    retention: {
      kept: retention.kept.length,
      removed: retention.removed.length,
      symlinks: retention.symlinks.length,
    },
    gates,
  };

  const slug = utcTimestampSlug();
  const filename = `${slug}.json`;
  const fullPath = path.join(outputDir, filename);

  if (!dryRun) {
    fs.writeFileSync(fullPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  // Compact stdout summary so operators see what happened even without opening
  // the artifact file. We surface exit statuses because a gate that returns
  // status=1 means it found violations — operational mode does not fail the
  // process on that, but the operator should know.
  process.stdout.write(`[gate:operational] retention=${retentionDays}d dir=${path.relative(REPO_ROOT, outputDir)}\n`);
  process.stdout.write(`[gate:operational] pruned ${retention.removed.length} file(s), kept ${retention.kept.length}, symlinks/nested=${retention.symlinks.length}\n`);
  for (const g of gates) {
    const status = g.status === null ? "launch-failed" : g.status === 0 ? "ok" : "violations";
    process.stdout.write(
      `[gate:operational] ${g.gate} status=${status} duration=${g.durationMs}ms\n`,
    );
  }
  if (dryRun) {
    process.stdout.write(`[gate:operational] dry-run: would write ${path.relative(REPO_ROOT, fullPath)}\n`);
  } else {
    process.stdout.write(`[gate:operational] wrote ${path.relative(REPO_ROOT, fullPath)}\n`);
  }
}

main();