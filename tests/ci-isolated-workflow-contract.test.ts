import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = resolve(process.cwd(), ".github/workflows/ci-isolated.yml");
const vitestConfigPath = resolve(process.cwd(), "vitest.config.ts");
const sharedSetupPath = resolve(process.cwd(), "tests/setup.ts");
const lockfileGuardPath = resolve(process.cwd(), "scripts/ci/validate-lockfile-refresh.cjs");

const lockfileGuard = require(lockfileGuardPath) as {
  MAX_GIT_OUTPUT_BYTES: number;
  TARGET_VERSIONS: Array<{ name: string; from: string; to: string; integrity: string }>;
  assertGitOutputWithinLimit: (output: string | Buffer) => string | Buffer;
  execGit: (args: string[], run?: (...args: unknown[]) => string) => string;
  validateLockfileRefresh: (input: {
    beforeText: string;
    afterText: string;
    changedFiles: string[];
  }) => void;
};

describe("isolated CI workflow contract", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const vitestConfig = readFileSync(vitestConfigPath, "utf8");
  const sharedSetup = readFileSync(sharedSetupPath, "utf8");

  it("runs only on manual dispatch with read-only repository permissions", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:/);
    expect(workflow).toContain("resolution_mode:");
    expect(workflow).toContain("default: checks");
    expect(workflow).toContain("- lockfile-refresh");
    expect(workflow).toContain("expected_sha:");
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(workflow).toMatch(/persist-credentials:\s*false/);
    expect(workflow).not.toMatch(/^\s*(push|pull_request|schedule):/m);
  });

  it("keeps the existing checks unconditional and isolates the optional lockfile refresh", () => {
    const checksJob = workflow.match(/  static-and-unit:([\s\S]*?)(?=\n  lockfile-refresh:|$)/)?.[1] ?? "";
    const refreshJob = workflow.match(/  lockfile-refresh:([\s\S]*)$/)?.[1] ?? "";
    const checksJobHeader = checksJob.split("\n    steps:")[0] ?? "";
    expect(checksJobHeader).not.toMatch(/^\s+if:/m);
    expect(refreshJob).toContain("if: ${{ inputs.resolution_mode == 'lockfile-refresh' }}");
    const refreshActions = [...refreshJob.matchAll(/^\s+uses:\s*(\S+)/gm)].map((match) => match[1]);
    expect(refreshActions).toEqual([
      "actions/checkout@v7",
      "pnpm/action-setup@v6",
      "actions/setup-node@v7",
    ]);
    expect(refreshJob).toContain("contents: read");
    expect(refreshJob).toContain("persist-credentials: false");
    expect(refreshJob).toContain("EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(refreshJob).toContain("DISPATCH_SHA: ${{ github.sha }}");
    expect(refreshJob).toContain("DISPATCH_REF: ${{ github.ref }}");
    expect(refreshJob).toContain("[[ \"$EXPECTED_SHA\" =~ ^[0-9a-f]{40}$ ]]");
    expect(refreshJob).toContain("[[ \"$DISPATCH_SHA\" == \"$head_sha\" ]]");
    expect(refreshJob).toContain("[[ \"$EXPECTED_SHA\" == \"$head_sha\" ]]");
    expect(refreshJob).toContain("version: 9.15.9");
    expect(refreshJob).toContain('node-version: "22"');
    expect(refreshJob).toContain("pnpm update --depth 99 --lockfile-only --no-save --ignore-scripts");
    expect(refreshJob).toContain("node scripts/ci/validate-lockfile-refresh.cjs");
    expect(refreshJob).not.toMatch(/\bsecrets\.|cache:|upload-artifact|git push|git commit|pnpm (?:build|typecheck|test)\b/i);
  });

  it("uses local placeholders and avoids cache, provider credentials, and deployments", () => {
    expect(workflow).toContain("http://127.0.0.1:54321");
    expect(workflow).toContain("postgresql://local:local@127.0.0.1:54322/local_ci");
    expect(workflow).not.toMatch(/\bsecrets\./i);
    const checksJob = workflow.match(/  static-and-unit:([\s\S]*?)(?=\n  lockfile-refresh:|$)/)?.[1] ?? "";
    const actions = [...checksJob.matchAll(/^\s+uses:\s*(\S+)/gm)].map((match) => match[1]);
    expect(actions).toEqual([
      "actions/checkout@v7",
      "pnpm/action-setup@v6",
      "actions/setup-node@v7",
    ]);
    expect(workflow).not.toMatch(/^\s*cache:/m);
    expect(workflow).not.toMatch(/\b(STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|E2E_TARGET_SUPABASE_PROJECT_REF|VERCEL_TOKEN)\b/);
  });

  it("excludes only the remote PostgreSQL suites from isolated CI through the web project config", () => {
    const webProjectStart = vitestConfig.indexOf('name: "web"');
    const mobileProjectStart = vitestConfig.indexOf('name: "mobile"');
    expect(webProjectStart).toBeGreaterThanOrEqual(0);
    expect(mobileProjectStart).toBeGreaterThan(webProjectStart);
    const webProjectConfig = vitestConfig.slice(webProjectStart, mobileProjectStart);
    expect(webProjectConfig).toContain('process.env.CI_ISOLATED === "1"');
    expect(webProjectConfig).toContain('"tests/saas-preview-regularization-pg.test.ts"');
    expect(webProjectConfig).toContain('"tests/saas-preview-readonly-boundaries-pg.test.ts"');
    expect(webProjectConfig).not.toContain("--exclude");

    const unitStep = workflow.match(/- name: Unit tests\n([\s\S]*?)(?=\n      - name:|$)/)?.[1] ?? "";
    expect(unitStep).toContain('CI_ISOLATED: "1"');
    expect(unitStep).toMatch(/--preserve-env=[^\n]*\bCI_ISOLATED\b/);
    expect(unitStep).toContain("pnpm vitest run");
    expect(unitStep).not.toContain("--exclude");
  });

  it("keeps Drizzle schema and SQL implementations real in shared test setup", () => {
    expect(sharedSetup).not.toMatch(/vi\.mock\(\s*["']drizzle-orm(?:\/pg-core)?["']/);
  });

  it("keeps static gates and runs checks in the network namespace", () => {
    expect(workflow).toContain("sudo unshare --net");
    expect(workflow).toContain('ip link set lo up && test "$(ip -o link show | wc -l)" -eq 1');
    expect(workflow.match(/run: sudo --preserve-env=[^\n]* unshare --net -- bash -euc/g)).toHaveLength(7);
    for (const check of [
      "pnpm exec vitest run tests/ci-isolated-workflow-contract.test.ts",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm vitest run",
      "pnpm validate:rls",
      "pnpm check:migrations",
      "pnpm gate:all",
    ]) {
      expect(workflow).toContain(check);
    }
    expect(workflow.match(/if: always\(\) && !cancelled\(\) && steps\.dependencies\.outcome == 'success' && steps\.network-isolation\.outcome == 'success'/g)).toHaveLength(7);
    expect(workflow).not.toMatch(/continue-on-error:/);
  });

  it("includes a semantic, fail-closed lockfile guard and focused guard cases", () => {
    expect(lockfileGuard.MAX_GIT_OUTPUT_BYTES).toBe(4 * 1024 * 1024);
    expect(lockfileGuard.TARGET_VERSIONS.map(({ name, from, to }) => ({ name, from, to }))).toEqual([
      { name: "follow-redirects", from: "1.16.0", to: "1.16.1" },
      { name: "hono", from: "4.13.7", to: "4.13.11" },
    ]);
    expect(lockfileGuard.assertGitOutputWithinLimit).toBeTypeOf("function");
    expect(lockfileGuard.execGit).toBeTypeOf("function");
    expect(lockfileGuard.validateLockfileRefresh).toBeTypeOf("function");
  });
});
