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
  batches: Array<{ source: "replay" | "discovered"; suites: string[] }>;
  replay_suites: string[];
  discovered_suites: string[];
  excluded_suites: Array<{ path: string; reason: string }>;
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

function runPlanner(command: "plan" | "verify-pins", root = ROOT) {
  const result = spawnSync("python3", ["-I", PLANNER_PATH, command, "--root", root], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return result;
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
  for (const suite of options.suites) writeFileSync(path.join(root, suite), "// synthetic\n");
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
    const cliCalls = script.match(/"\$CLI" --workdir "\$CI_WORKDIR"[^\n]*(?:\\\n[^\n]*)*/g) ?? [];
    const databaseCalls = cliCalls.filter((call) => /migration up|db query/.test(call));
    expect(databaseCalls.length).toBeGreaterThanOrEqual(3);
    for (const call of databaseCalls) expect(call).toContain('--db-url "$LOCAL_DB_URL"');
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
    // Ordered exactly like the reviewed replay.
    const order = ["Marker-guarded", "RLS hardening migration\"", "Owner bootstrap reference seed\"", "Synthetic two-academy"].map(
      (needle) => script.indexOf(needle, script.indexOf("# 3. Same sources"))
    );
    expect(order.every((value, index) => value > (order[index - 1] ?? 0))).toBe(true);
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

  it("runs every run_disposable_postgres_suites suite in the reviewed order, then new suites", () => {
    const result = runPlanner("plan");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout) as Plan;

    const replaySuites = replayFunctionSuites(replayScript);
    expect(replaySuites.length).toBeGreaterThanOrEqual(19);
    expect(plan.replay_suites).toEqual(replaySuites);
    const replayBatches = plan.batches.filter((batch) => batch.source === "replay");
    expect(replayBatches.flatMap((batch) => batch.suites)).toEqual(replaySuites);
    expect(replayBatches.length).toBe((replayScript.match(/pnpm exec vitest run --project web/g) ?? []).length);

    const firstDiscovered = plan.batches.findIndex((batch) => batch.source === "discovered");
    if (firstDiscovered >= 0) {
      expect(plan.batches.slice(firstDiscovered).every((batch) => batch.source === "discovered")).toBe(true);
      for (const batch of plan.batches.slice(firstDiscovered)) expect(batch.suites).toHaveLength(1);
    }

    const onDisk = readdirSync(path.join(ROOT, "tests"))
      .filter((file) => /-pg\.test\.ts$|-postgres\.integration\.test\.ts$/.test(file))
      .map((file) => `tests/${file}`)
      .sort();
    const planned = plan.batches.flatMap((batch) => batch.suites);
    expect([...planned, ...plan.excluded_suites.map((item) => item.path)].sort()).toEqual(onDisk);
    expect(plan.suite_count).toBe(planned.length);
    expect(new Set(planned).size).toBe(planned.length);
  });

  it("always keeps the two remote-sandbox suites out of the disposable run", () => {
    const result = runPlanner("plan");
    const plan = JSON.parse(result.stdout) as Plan;
    expect(plan.excluded_suites.map((item) => item.path).sort()).toEqual([...REMOTE_SANDBOX_SUITES].sort());
    for (const item of plan.excluded_suites) expect(item.reason).toMatch(/remote SaaS preview sandbox/);
    const planned = plan.batches.flatMap((batch) => batch.suites);
    for (const suite of REMOTE_SANDBOX_SUITES) expect(planned).not.toContain(suite);
    expect(script).not.toMatch(/ZALTYKO_SANDBOX_READONLY_TESTS=1/);
    expect(script).toContain("CI_ISOLATED=1");
  });

  it("discovers a new PostgreSQL suite and runs it alone after the replay batches", () => {
    const root = writeSyntheticRoot({
      replaySuites: ["tests/a-pg.test.ts", "tests/b-postgres.integration.test.ts"],
      suites: [
        "tests/a-pg.test.ts",
        "tests/b-postgres.integration.test.ts",
        "tests/new-feature-pg.test.ts",
        "tests/new-ledger-postgres.integration.test.ts",
        "tests/unrelated.test.ts",
        ...REMOTE_SANDBOX_SUITES,
      ],
    });
    const result = runPlanner("plan", root);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout) as Plan;
    expect(plan.batches).toEqual([
      { source: "replay", suites: ["tests/a-pg.test.ts", "tests/b-postgres.integration.test.ts"] },
      { source: "discovered", suites: ["tests/new-feature-pg.test.ts"] },
      { source: "discovered", suites: ["tests/new-ledger-postgres.integration.test.ts"] },
    ]);
    expect(plan.suite_count).toBe(4);
  });

  it("fails closed on a stale exclusion or a remote-sandbox suite in the replay batches", () => {
    const stale = writeSyntheticRoot({
      replaySuites: ["tests/a-pg.test.ts"],
      suites: ["tests/a-pg.test.ts", REMOTE_SANDBOX_SUITES[0]],
    });
    const staleResult = runPlanner("plan", stale);
    expect(staleResult.status).toBe(1);
    expect(staleResult.stderr).toContain("Stale exclusion");

    const remote = writeSyntheticRoot({
      replaySuites: ["tests/a-pg.test.ts", REMOTE_SANDBOX_SUITES[1]],
      suites: ["tests/a-pg.test.ts", ...REMOTE_SANDBOX_SUITES],
    });
    const remoteResult = runPlanner("plan", remote);
    expect(remoteResult.status).toBe(1);
    expect(remoteResult.stderr).toContain("remote-sandbox suite cannot run on disposable Postgres");
  });
});

