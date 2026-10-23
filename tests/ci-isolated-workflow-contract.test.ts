import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = resolve(process.cwd(), ".github/workflows/ci-isolated.yml");

describe("isolated CI workflow contract", () => {
  const workflow = readFileSync(workflowPath, "utf8");

  it("runs only on manual dispatch with read-only repository permissions", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:/);
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(workflow).toMatch(/persist-credentials:\s*false/);
    expect(workflow).not.toMatch(/^\s*(push|pull_request|schedule):/m);
  });

  it("uses local placeholders and avoids cache, provider credentials, and deployments", () => {
    expect(workflow).toContain("http://127.0.0.1:54321");
    expect(workflow).toContain("postgresql://local:local@127.0.0.1:54322/local_ci");
    expect(workflow).not.toMatch(/\bsecrets\./i);
    const actions = [...workflow.matchAll(/^\s+uses:\s*(\S+)/gm)].map((match) => match[1]);
    expect(actions).toEqual([
      "actions/checkout@v7",
      "pnpm/action-setup@v6",
      "actions/setup-node@v7",
    ]);
    expect(workflow).not.toMatch(/^\s*cache:/m);
    expect(workflow).not.toMatch(/\b(STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|E2E_TARGET_SUPABASE_PROJECT_REF|VERCEL_TOKEN)\b/);
  });

  it("keeps static gates, excludes remote-only PostgreSQL suites, and runs checks in the network namespace", () => {
    expect(workflow).toContain("sudo unshare --net");
    expect(workflow).toContain('ip link set lo up && test "$(ip -o link show | wc -l)" -eq 1');
    expect(workflow.match(/run: sudo --preserve-env=[^\n]* unshare --net -- bash -euc/g)).toHaveLength(7);
    for (const check of [
      "pnpm exec vitest run tests/ci-isolated-workflow-contract.test.ts",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm vitest run --exclude 'tests/saas-preview-{regularization,readonly-boundaries}-pg.test.ts'",
      "pnpm validate:rls",
      "pnpm check:migrations",
      "pnpm gate:all",
    ]) {
      expect(workflow).toContain(check);
    }
    expect(workflow.match(/if: always\(\) && !cancelled\(\) && steps\.dependencies\.outcome == 'success' && steps\.network-isolation\.outcome == 'success'/g)).toHaveLength(7);
    expect(workflow).not.toMatch(/continue-on-error:/);
  });
});
