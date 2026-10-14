import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci-isolated.yml"),
  "utf8"
);

describe("isolated CI workflow contract", () => {
  it("runs only by manual dispatch and has read-only repository permission", () => {
    expect(workflow).toMatch(/^on:\n  workflow_dispatch:\s*$/m);
    expect(workflow).not.toMatch(
      /^  (push|pull_request|schedule|workflow_run):/m
    );
    expect(workflow).toMatch(/^permissions:\n  contents: read\s*$/m);
    expect(workflow).not.toMatch(
      /\b(?:write-all|contents:\s*write|actions:\s*write|deployments:\s*write)\b/i
    );
  });

  it("does not consume secrets or start provider and browser workflows", () => {
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./i);
    expect(workflow).not.toMatch(
      /\b(?:vercel|supabase\/setup-cli|playwright|test:e2e|e2e:prepare|STRIPE_|E2E_)/i
    );
    expect(workflow).toMatch(/persist-credentials:\s*false/);
  });

  it("points application endpoints to loopback placeholders", () => {
    expect(workflow).toMatch(
      /NEXT_PUBLIC_APP_URL:\s*http:\/\/127\.0\.0\.1:3000/
    );
    expect(workflow).toMatch(
      /NEXT_PUBLIC_SUPABASE_URL:\s*http:\/\/127\.0\.0\.1:54321/
    );
    expect(workflow).toMatch(
      /DATABASE_URL:\s*postgresql:\/\/local:local@127\.0\.0\.1:54322\/local_ci/
    );
    expect(workflow).not.toMatch(/https:\/\//i);
  });

  it("retains the unit, type, lint, and static isolation gates", () => {
    for (const command of [
      "pnpm lint",
      "pnpm typecheck",
      "pnpm vitest run",
      "pnpm validate:rls",
      "pnpm check:migrations",
      "pnpm gate:all",
    ]) {
      expect(workflow).toContain(command);
    }
  });
});
