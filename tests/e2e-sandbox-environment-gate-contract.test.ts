import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const { load } = require("js-yaml") as {
  load: (source: string) => Record<string, unknown>;
};

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8"
);
const parsedWorkflow = load(workflow) as {
  jobs: Record<string, { if?: unknown }>;
};

describe("synthetic E2E CI contract", () => {
  it("parses as YAML with no duplicate keys", () => {
    expect(() => load(workflow)).not.toThrow();
    expect(() => load("job:\n  if: false\n  if: true\n")).toThrow(
      /duplicated mapping key/i
    );
  });

  it("disables remote Sandbox provisioning on the default workflow", () => {
    const readinessJob = workflow
      .split("  e2e-readiness:\n")[1]
      ?.split("\n  e2e-local-owner:")[0];
    const authenticatedJob = workflow
      .split("  e2e-auth:\n")[1]
      ?.split("\n  e2e-auth-required-gate:")[0];

    expect(readinessJob).toContain("if: ${{ false }}");
    expect(authenticatedJob.match(/^    if:/gm)).toHaveLength(1);
    expect(parsedWorkflow.jobs["e2e-readiness"]?.if).toBe("${{ false }}");
    expect(parsedWorkflow.jobs["e2e-auth"]?.if).toBe("${{ false }}");
    const gate = workflow.split("  e2e-auth-required-gate:\n")[1];
    expect(gate).not.toContain("e2e-readiness");
    expect(gate).not.toContain("e2e-auth");
  });

  it("runs the synthetic local Owner journey as a blocking three-browser matrix", () => {
    const localJob = workflow
      .split("  e2e-local-owner:\n")[1]
      ?.split("\n  validate-rls:")[0];

    expect(localJob).toContain("project: [chromium, firefox, webkit]");
    expect(localJob).not.toContain("continue-on-error");
    expect(localJob).toContain(
      "pnpm exec tsx scripts/ci/preload-local-e2e-images.ts"
    );
    expect(localJob).toContain("E2E_LOCAL_PROJECT: ${{ matrix.project }}");
    expect(localJob).toContain("pnpm test:e2e:local");
  });

  it("fails the stable PR and push gate when the local E2E matrix is skipped or fails", () => {
    const gate = workflow.split("  e2e-auth-required-gate:\n")[1];

    expect(gate).toContain("name: Local Synthetic Owner E2E Required Gate");
    expect(gate).toContain("needs: [e2e-local-owner]");
    expect(gate).toContain(
      "github.event_name == 'pull_request' || github.event_name == 'push'"
    );
    expect(gate).toContain("needs.e2e-local-owner.result");
    expect(gate).toContain('!= "success"');
    expect(gate).toContain("exit 1");
  });
});
