import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const { load } = require("js-yaml");

const ROOT = process.cwd();
const WORKFLOW_PATH = path.join(ROOT, ".github/workflows/postgres-integration.yml");
const SCRIPT_PATH = path.join(ROOT, "scripts/ci/run-postgres-integration.sh");
const PLANNER_PATH = path.join(ROOT, "scripts/ci/postgres_integration_plan.py");
const REPLAY_PATH = path.join(ROOT, "scripts/ci/verify-sandbox-schema-replay.sh");

const workflowText = readFileSync(WORKFLOW_PATH, "utf8");
const workflow = load(workflowText) as {
  name: string;
  on: Record<string, { branches?: string[] }>;
  permissions: Record<string, string>;
  jobs: Record<
    string,
    {
      name: string;
      "runs-on": string;
      environment?: unknown;
      services?: unknown;
      env?: Record<string, string>;
      permissions?: Record<string, string>;
      steps: Array<{ name?: string; uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string> }>;
    }
  >;
};
const script = readFileSync(SCRIPT_PATH, "utf8");
const replayScript = readFileSync(REPLAY_PATH, "utf8");

const REMOTE_SANDBOX_SUITES = [
  "tests/saas-preview-regularization-pg.test.ts",
  "tests/saas-preview-readonly-boundaries-pg.test.ts",
];
const OWN_HARNESS_SUITES = ["tests/lib/stripe-charge-collection-concurrency.real-pg.test.ts"];
const EXCLUDED_SUITES = [...REMOTE_SANDBOX_SUITES, ...OWN_HARNESS_SUITES];
const FRESH_DATABASE_SUITES = ["tests/saas-reconciliation-service-pg.test.ts"];
const PG_SUITE_PATTERN = /-pg\.test\.ts$|-postgres\.integration\.test\.ts$/;

const FORBIDDEN_ENV = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_DB_URL",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2E_TARGET_SUPABASE_PROJECT_REF",
  "DATABASE_URL",
  "DATABASE_URL_POOL",
  "DATABASE_URL_DIRECT",
  "STRIPE_SECRET_KEY",
  "STRIPE_SAAS_TEST_SECRET_KEY",
  "STRIPE_SAAS_LIVE_SECRET_KEY",
  "VERCEL_TOKEN",
  "ZALTYKO_SANDBOX_READONLY_TESTS",
];

type Plan = {
  batches: Array<{ source: "replay" | "discovered"; database: "shared" | "fresh"; suites: string[] }>;
  replay_suites: string[];
  discovered_suites: string[];
  excluded_suites: Array<{ path: string; category: string; reason: string }>;
  fresh_database_suites: Array<{ path: string; reason: string }>;
  suite_count: number;
};

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeTemporaryRoot(prefix: string) {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function runPlanner(command: "plan" | "verify-pins" | "verify-reports", root = ROOT, extraArgs: string[] = []) {
  return spawnSync("python3", ["-I", PLANNER_PATH, command, "--root", root, ...extraArgs], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

/** Synthetic roots have no real fresh-database suite unless a test adds one. */
function runSyntheticPlan(root: string, fresh: Record<string, string> = {}) {
  return runPlanner("plan", root, ["--fresh-database-suites-json", JSON.stringify(fresh)]);
}

/** Ordered `apply_migration "$X_NAME"` steps of the integration script. */
function scriptAppliedMigrations(text: string) {
  return [...text.matchAll(/^\s*apply_migration "\$([A-Z0-9_]+_NAME)"/gm)].map((match) => match[1]);
}

/** Ordered destinations `$CI_WORKDIR/supabase/migrations/$X_NAME` of the replay. */
function replayMigrationDestinations(text: string) {
  const beforeSuites = text.slice(0, text.indexOf("\nrun_disposable_postgres_suites() {"));
  const sequence: string[] = [];
  for (const match of beforeSuites.matchAll(/\$CI_WORKDIR\/supabase\/migrations\/\$([A-Z0-9_]+_NAME)\b/g)) {
    if (sequence.at(-1) !== match[1]) sequence.push(match[1]);
  }
  return sequence;
}

function listPgSuitesOnDisk(root: string) {
  return (readdirSync(path.join(root, "tests"), { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => PG_SUITE_PATTERN.test(file))
    .map((file) => `tests/${file}`)
    .sort();
}

/** Independent reading of run_disposable_postgres_suites, in order. */
function replayFunctionSuites(text: string) {
  const body = text.match(/^run_disposable_postgres_suites\(\) \{\n([\s\S]*?)^\}$/m)?.[1] ?? "";
  return [...body.matchAll(/tests\/[A-Za-z0-9._-]+\.test\.ts/g)].map((match) => match[0]);
}

function writeSyntheticRoot(options: { suites: string[]; replaySuites: string[] }) {
  const root = makeTemporaryRoot("zaltyko-pg-plan-");
  mkdirSync(path.join(root, "scripts/ci"), { recursive: true });
  mkdirSync(path.join(root, "tests"), { recursive: true });
  const replay = [
    "#!/usr/bin/env bash",
    "run_disposable_postgres_suites() {",
    "  ZALTYKO_PG_INTEGRATION=1 NODE_ENV=test \\",
    `  pnpm exec vitest run --project web ${options.replaySuites.join(" ")} \\`,
    '    || return "$?"',
    "}",
    "",
  ].join("\n");
  writeFileSync(path.join(root, "scripts/ci/verify-sandbox-schema-replay.sh"), replay);
  for (const suite of options.suites) {
    mkdirSync(path.dirname(path.join(root, suite)), { recursive: true });
    writeFileSync(path.join(root, suite), "// synthetic\n");
  }
  return root;
}

describe("Postgres integration workflow contract", () => {
  const job = workflow.jobs["postgres-integration"];

  it("runs as its own non-required workflow on PRs and pushes to main", () => {
    expect(workflow.name).toBe("Postgres integration");
    expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "push"]);
    expect(workflow.on.pull_request.branches).toEqual(["main"]);
    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(Object.keys(workflow.jobs)).toEqual(["postgres-integration"]);
    expect(job.name).toBe("Postgres integration");
    expect(job["runs-on"]).toBe("ubuntu-latest");
  });

  it("uses no secrets, environments, service containers or remote database configuration", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(job.permissions).toEqual({ contents: "read" });
    expect(workflowText).not.toMatch(/\$\{\{\s*(secrets|vars)\./);
    expect(workflowText).not.toMatch(/secrets\s*:\s*inherit/);
    expect(job.environment).toBeUndefined();
    expect(job.services).toBeUndefined();
    expect(job.env).toBeUndefined();
    for (const name of FORBIDDEN_ENV) {
      expect(workflowText).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    for (const step of job.steps) {
      expect(step.env).toBeUndefined();
    }
    const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
  });

  it("pins every action to a full commit SHA", () => {
    const uses = job.steps.flatMap((step) => (step.uses ? [step.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const reference of uses) expect(reference).toMatch(/@[0-9a-f]{40}\b/);
    expect(workflowText.match(/^\s*(?:-\s*)?uses:/gm)?.length).toBe(uses.length);
  });

  it("installs only the checksum-verified CLI pinned by the reviewed replay", () => {
    const version = replayScript.match(/^readonly SUPABASE_CLI_VERSION="([0-9.]+)"$/m)?.[1];
    expect(version).toBeTruthy();
    const runs = job.steps.map((step) => step.run ?? "").join("\n");
    expect(runs).toContain(
      `https://github.com/supabase/cli/releases/download/v${version}/supabase_${version}_linux_amd64.tar.gz`
    );
    expect(runs).toContain("python3 scripts/ci/test_install_schema_replay_supabase_cli.py");
    expect(runs).toContain(
      `python3 scripts/ci/install_schema_replay_supabase_cli.py "$RUNNER_TEMP/supabase_${version}_linux_amd64.tar.gz"`
    );
    expect(job.steps.at(-1)?.run).toBe("bash scripts/ci/run-postgres-integration.sh");
  });

  it("builds only a one-run native loopback database and never links a remote project", () => {
    expect(script).toContain("--runtime native");
    expect(script).toContain("--exclude rest,auth,realtime,storage,functions,studio,mail,analytics,pooler");
    expect(script).not.toMatch(/supabase link|--linked|db push|--project-ref|db dump|db pull/);
    expect(script).not.toMatch(/\bcurl\b|\bwget\b/);
    // Join shell line continuations so each CLI invocation is one logical line.
    const logicalLines = script.replace(/\\\n\s*/g, " ").split("\n");
    const databaseCalls = logicalLines.filter(
      (line) => line.includes('"$CLI"') && /\b(?:migration up|db query|db reset|db push)\b/.test(line)
    );
    expect(databaseCalls.some((line) => line.includes("migration up"))).toBe(true);
    expect(databaseCalls.some((line) => line.includes("db query"))).toBe(true);
    for (const call of databaseCalls) {
      expect(call).toContain('--db-url "$LOCAL_DB_URL"');
      expect(call).not.toMatch(/--linked|--project-ref|db push|db reset/);
    }
    // Loopback-only target and supabase_admin principal, as in the replay.
    expect(script).toContain('parsed.hostname not in {"127.0.0.1", "localhost", "::1"}');
    expect(script).toContain('admin.username != "supabase_admin"');
    expect(script).toContain('query=urlencode([("sslmode", "disable")])');
  });

  it("refuses leaked credentials and the remote sandbox switch before doing anything", () => {
    for (const name of FORBIDDEN_ENV) expect(script).toMatch(new RegExp(`\\b${name}\\b`));
    const ghCheck = script.indexOf('[[ "${GITHUB_ACTIONS:-}" == "true" ]]');
    const credentialCheck = script.indexOf("for forbidden in");
    const firstCommand = script.indexOf("python3 \"$PLANNER\"");
    expect(ghCheck).toBeGreaterThan(-1);
    expect(credentialCheck).toBeGreaterThan(ghCheck);
    expect(firstCommand).toBeGreaterThan(credentialCheck);

    const leaked = `postgres://example:${"x".repeat(24)}@db.example.invalid:5432/postgres`;
    const result = spawnSync("bash", [SCRIPT_PATH], {
      cwd: ROOT,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", GITHUB_ACTIONS: "true", DATABASE_URL: leaked },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected external database, provider or sandbox configuration");
    expect(`${result.stdout}${result.stderr}`).not.toContain(leaked);

    const outsideActions = spawnSync("bash", [SCRIPT_PATH], {
      cwd: ROOT,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    });
    expect(outsideActions.status).toBe(1);
    expect(outsideActions.stderr).toContain("GitHub Actions is required.");
  });

  it("reuses the replay sources read-only and sanitizes every captured log", () => {
    expect(script).not.toMatch(/(?:>|>>|\btee\b|\bsed -i\b|\bmv\b|\brm\b)[^\n]*(?:verify-sandbox-schema-replay\.sh|schema-snapshot-manifest\.json|sandbox-tenant-isolation\.sql)/);
    expect(script).toContain("python3 \"$PLANNER\" verify-pins");
    expect(script).toContain("SET app.schema_snapshot_replay = 'ci-empty-replay';");
    for (const step of [
      '"Marker-guarded current-state baseline"',
      '"RLS hardening migration"',
      '"Owner bootstrap reference seed"',
      '"Synthetic two-academy RLS isolation check"',
    ]) {
      expect(script).toContain(step);
    }
    // Same migration steps and order as the reviewed replay; its two guard
    // probes only prove refusals and are not applied here.
    const replaySteps = replayMigrationDestinations(replayScript);
    expect(replaySteps.slice(-2)).toEqual(["GUARD_PROBE_NAME", "UNMARKED_PROBE_NAME"]);
    expect(scriptAppliedMigrations(script)).toEqual(replaySteps.slice(0, -2));
    expect(script).toContain('"<redacted-connection>"');
    expect(script).toContain('"<redacted-jwt>"');
    expect(script).toContain('"<redacted-key>"');
    expect(script).toContain('"<redacted-long-value>"');
    // vitest output is captured to a file and only printed through the sanitizer.
    expect(script).toMatch(/"\$\{suites\[@\]\}" >"\$SUITE_LOG_DIR\/\$label\.log" 2>&1/);
    expect(script).not.toMatch(/\bcat\b[^\n]*(?:SUITE_LOG_DIR|START_LOG|REPLAY_LOG|STATUS_LOG)/);
    expect(script).not.toMatch(/(?:echo|printf)[^\n]*\$LOCAL_DB_URL/);
  });

  it("verifies the pinned replay sources against the reviewed manifest", () => {
    const result = runPlanner("verify-pins");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const pins = JSON.parse(result.stdout) as Record<string, string>;
    expect(pins.BASELINE_PATH).toBe(`supabase/schema-snapshots/${pins.MIGRATION_NAME}`);
    expect(pins.TENANT_FIXTURE_PATH).toBe("scripts/ci/sandbox-tenant-isolation.sql");
  });

  it("refuses a replay script that differs from the manifest pin", () => {
    const root = makeTemporaryRoot("zaltyko-pg-pins-");
    mkdirSync(path.join(root, "scripts/ci"), { recursive: true });
    mkdirSync(path.join(root, "supabase"), { recursive: true });
    copyFileSync(
      path.join(ROOT, "supabase/schema-snapshot-manifest.json"),
      path.join(root, "supabase/schema-snapshot-manifest.json")
    );
    writeFileSync(path.join(root, "scripts/ci/verify-sandbox-schema-replay.sh"), `${replayScript}\n# drift\n`);
    const result = runPlanner("verify-pins", root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("The replay script differs from the manifest pin.");
  });

  it("refuses a replay whose migration steps or name constants drifted", () => {
    const writeReplay = (text: string) => {
      const root = makeTemporaryRoot("zaltyko-pg-drift-");
      mkdirSync(path.join(root, "scripts/ci"), { recursive: true });
      writeFileSync(path.join(root, "scripts/ci/verify-sandbox-schema-replay.sh"), text);
      return root;
    };
    const tenantStep = 'cat -- "$ROLE_GUARD_FILE" "$ROOT/scripts/ci/sandbox-tenant-isolation.sql" \\\n';
    expect(replayScript).toContain(tenantStep);

    // An extra migration step using an existing constant.
    const extraStep = replayScript.replace(
      tenantStep,
      'cp -- "$ROLE_GUARD_FILE" "$CI_WORKDIR/supabase/migrations/$RLS_HARDENING_MIGRATION_NAME"\n' + tenantStep
    );
    const extraResult = runPlanner("verify-pins", writeReplay(extraStep));
    expect(extraResult.status).toBe(1);
    expect(extraResult.stderr).toContain("The replay migration steps drifted from the reviewed sequence");

    // A new name constant.
    const extraConstant = replayScript.replace(
      /^(readonly TENANT_MIGRATION_NAME=.*)$/m,
      '$1\nreadonly EXTRA_STEP_NAME="20261024223799_extra_step.sql"'
    );
    const constantResult = runPlanner("verify-pins", writeReplay(extraConstant));
    expect(constantResult.status).toBe(1);
    expect(constantResult.stderr).toContain("different set of migration name constants: EXTRA_STEP_NAME");
  });

  it("runs every run_disposable_postgres_suites suite in the reviewed order, then new suites", () => {
    const result = runPlanner("plan");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout) as Plan;

    const replaySuites = replayFunctionSuites(replayScript);
    expect(replaySuites.length).toBeGreaterThan(0);
    expect(plan.replay_suites).toEqual(replaySuites);
    const replayBatches = plan.batches.filter((batch) => batch.source === "replay");
    expect(replayBatches.flatMap((batch) => batch.suites)).toEqual(replaySuites);
    expect(replayBatches.length).toBe((replayScript.match(/pnpm exec vitest run --project web/g) ?? []).length);

    const firstDiscovered = plan.batches.findIndex((batch) => batch.source === "discovered");
    if (firstDiscovered >= 0) {
      expect(plan.batches.slice(firstDiscovered).every((batch) => batch.source === "discovered")).toBe(true);
      for (const batch of plan.batches.slice(firstDiscovered)) expect(batch.suites).toHaveLength(1);
    }

    const onDisk = listPgSuitesOnDisk(ROOT);
    const planned = plan.batches.flatMap((batch) => batch.suites);
    expect([...planned, ...plan.excluded_suites.map((item) => item.path)].sort()).toEqual(onDisk);
    expect(plan.suite_count).toBe(planned.length);
    expect(new Set(planned).size).toBe(planned.length);
  });

  it("keeps the remote-sandbox and own-harness suites out of the disposable run", () => {
    const result = runPlanner("plan");
    const plan = JSON.parse(result.stdout) as Plan;
    expect(plan.excluded_suites.map((item) => item.path).sort()).toEqual([...EXCLUDED_SUITES].sort());
    for (const item of plan.excluded_suites) {
      if (REMOTE_SANDBOX_SUITES.includes(item.path)) {
        expect(item.category).toBe("remote-sandbox");
        expect(item.reason).toMatch(/remote SaaS preview sandbox/);
      } else {
        expect(item.category).toBe("own-harness");
        expect(item.reason).toMatch(/run-charge-concurrency-test\.sh/);
        expect(item.reason).toMatch(/CHARGE_CONCURRENCY_TEST/);
        expect(item.reason).toMatch(/TRUNCATE/);
      }
    }
    const planned = plan.batches.flatMap((batch) => batch.suites);
    for (const suite of EXCLUDED_SUITES) expect(planned).not.toContain(suite);
    expect(script).toMatch(/\bCHARGE_CONCURRENCY_TEST\b/);
    expect(script).not.toMatch(/ZALTYKO_SANDBOX_READONLY_TESTS=1/);
    expect(script).toContain("CI_ISOLATED=1");
  });

  it("runs the SaaS reconciliation suite alone on its own fresh database", () => {
    const plan = JSON.parse(runPlanner("plan").stdout) as Plan;
    expect(plan.fresh_database_suites.map((item) => item.path)).toEqual(FRESH_DATABASE_SUITES);
    const freshBatches = plan.batches.filter((batch) => batch.database === "fresh");
    expect(freshBatches).toEqual(FRESH_DATABASE_SUITES.map((suite) => ({ source: "discovered", database: "fresh", suites: [suite] })));
    expect(plan.batches.slice(-freshBatches.length)).toEqual(freshBatches);
  });

  it("discovers a new PostgreSQL suite and runs it alone after the replay batches", () => {
    const root = writeSyntheticRoot({
      replaySuites: ["tests/a-pg.test.ts", "tests/b-postgres.integration.test.ts"],
      suites: [
        "tests/a-pg.test.ts",
        "tests/b-postgres.integration.test.ts",
        "tests/new-feature-pg.test.ts",
        "tests/new-ledger-postgres.integration.test.ts",
        "tests/sub/x-pg.test.ts",
        "tests/unrelated.test.ts",
        ...EXCLUDED_SUITES,
      ],
    });
    const result = runSyntheticPlan(root);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout) as Plan;
    expect(plan.batches).toEqual([
      { source: "replay", database: "shared", suites: ["tests/a-pg.test.ts", "tests/b-postgres.integration.test.ts"] },
      { source: "discovered", database: "shared", suites: ["tests/new-feature-pg.test.ts"] },
      { source: "discovered", database: "shared", suites: ["tests/new-ledger-postgres.integration.test.ts"] },
      { source: "discovered", database: "shared", suites: ["tests/sub/x-pg.test.ts"] },
    ]);
    expect(plan.suite_count).toBe(5);
    expect(listPgSuitesOnDisk(root)).toContain("tests/sub/x-pg.test.ts");
  });

  it("runs suites marked for a fresh database alone, last, each on a rebuilt database", () => {
    const root = writeSyntheticRoot({
      replaySuites: ["tests/a-pg.test.ts"],
      suites: [
        "tests/a-pg.test.ts",
        "tests/global-claims-pg.test.ts",
        "tests/z-shared-pg.test.ts",
        ...EXCLUDED_SUITES,
      ],
    });
    const result = runSyntheticPlan(root, { "tests/global-claims-pg.test.ts": "Asserts no claimable rows in the whole database." });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout) as Plan;
    expect(plan.batches).toEqual([
      { source: "replay", database: "shared", suites: ["tests/a-pg.test.ts"] },
      { source: "discovered", database: "shared", suites: ["tests/z-shared-pg.test.ts"] },
      { source: "discovered", database: "fresh", suites: ["tests/global-claims-pg.test.ts"] },
    ]);

    for (const invalid of [
      { "tests/missing-pg.test.ts": "stale" },
      { "tests/a-pg.test.ts": "already a replay suite" },
      { "tests/global-claims-pg.test.ts": " " },
    ]) {
      const refused = runSyntheticPlan(root, invalid);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("PostgreSQL integration plan refused");
    }

    // The runner rebuilds the schema on a new stack, after stopping the previous one.
    const builder = script.slice(script.indexOf("build_database() {"));
    expect(builder.indexOf("stack stop")).toBeLessThan(builder.indexOf("stack start"));
    expect(script).toMatch(/fresh\) database_count=\$\(\(database_count \+ 1\)\); build_database/);
  });

  it("runs PostgreSQL suite files sequentially, never in parallel", async () => {
    expect(script).toContain("pnpm exec vitest run --project web --no-file-parallelism");
    const config = (await import("../vitest.config")).default as unknown as { test?: { maxWorkers?: number } };
    expect(config.test?.maxWorkers).toBe(1);
  });

  it("fails closed on a stale exclusion or a remote-sandbox suite in the replay batches", () => {
    const stale = writeSyntheticRoot({
      replaySuites: ["tests/a-pg.test.ts"],
      suites: ["tests/a-pg.test.ts", ...EXCLUDED_SUITES.slice(1)],
    });
    const staleResult = runSyntheticPlan(stale);
    expect(staleResult.status).toBe(1);
    expect(staleResult.stderr).toContain("Stale exclusion");

    const remote = writeSyntheticRoot({
      replaySuites: ["tests/a-pg.test.ts", REMOTE_SANDBOX_SUITES[1]],
      suites: ["tests/a-pg.test.ts", ...EXCLUDED_SUITES],
    });
    const remoteResult = runSyntheticPlan(remote);
    expect(remoteResult.status).toBe(1);
    expect(remoteResult.stderr).toContain("remote-sandbox suite cannot run on disposable Postgres");
  });

  describe("verify-reports", () => {
    const plan = {
      batches: [
        { source: "replay", database: "shared", suites: ["tests/a-pg.test.ts", "tests/b-pg.test.ts"] },
        { source: "discovered", database: "fresh", suites: ["tests/c-pg.test.ts"] },
      ],
      discovered_suites: ["tests/c-pg.test.ts"],
      fresh_database_suites: [{ path: "tests/c-pg.test.ts", reason: "synthetic" }],
      excluded_suites: [],
    };
    type Assertion = { status: string };
    type FileResult = { name: string; status: string; assertionResults: Assertion[] };
    const passed = (count: number) => Array.from({ length: count }, () => ({ status: "passed" }));
    const file = (suite: string, status: string, assertionResults: Assertion[]): FileResult => ({
      name: `/synthetic-root/${suite}`,
      status,
      assertionResults,
    });

    function verify(reports: FileResult[][]) {
      const directory = makeTemporaryRoot("zaltyko-pg-reports-");
      const reportDir = path.join(directory, "reports");
      mkdirSync(reportDir);
      reports.forEach((testResults, index) =>
        writeFileSync(path.join(reportDir, `batch-0${index + 1}.json`), JSON.stringify({ testResults }))
      );
      const planFile = path.join(directory, "plan.json");
      writeFileSync(planFile, JSON.stringify(plan));
      const summaryFile = path.join(directory, "summary.md");
      const result = runPlanner("verify-reports", "/synthetic-root", [
        "--plan",
        planFile,
        "--reports",
        reportDir,
        "--summary",
        summaryFile,
      ]);
      return { ...result, summary: readFileSync(summaryFile, "utf8") };
    }

    const healthy = () => [
      [file("tests/a-pg.test.ts", "passed", passed(3)), file("tests/b-pg.test.ts", "passed", passed(2))],
      [file("tests/c-pg.test.ts", "passed", passed(4))],
    ];

    it("accepts a run where every planned suite passed and reports counts", () => {
      const result = verify(healthy());
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("PASS: 3 PostgreSQL suites, 9 tests on disposable local Postgres.");
      expect(result.summary).toContain("| `tests/c-pg.test.ts` | discovered | fresh | 4 | 0 | 0 | ok |");
    });

    it("refuses a suite whose tests were all skipped", () => {
      const reports = healthy();
      reports[1] = [file("tests/c-pg.test.ts", "passed", [{ status: "skipped" }, { status: "skipped" }])];
      const result = verify(reports);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("tests/c-pg.test.ts: no passed tests");
    });

    it("refuses a batch report with empty testResults", () => {
      const reports = healthy();
      reports[1] = [];
      const result = verify(reports);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("tests/c-pg.test.ts: no vitest result");
    });

    it("refuses a failed file without assertions (import or hook failure)", () => {
      const reports = healthy();
      reports[0][1] = file("tests/b-pg.test.ts", "failed", []);
      const result = verify(reports);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("tests/b-pg.test.ts: failed (0 failed test(s))");
    });

    it("refuses a reported file that was not planned", () => {
      const reports = healthy();
      reports[1].push(file("tests/unplanned-pg.test.ts", "passed", passed(1)));
      const result = verify(reports);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("tests/unplanned-pg.test.ts: reported but not planned");
    });

    it("refuses skipped tests mixed with passed ones", () => {
      const reports = healthy();
      reports[0][0] = file("tests/a-pg.test.ts", "passed", [...passed(2), { status: "todo" }]);
      const result = verify(reports);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("tests/a-pg.test.ts: 1 skipped/todo test(s)");
    });
  });
});

