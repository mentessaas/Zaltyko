import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const { load } = require("js-yaml");
const workflow = load(readFileSync(".github/workflows/ci.yml", "utf8"));

describe("pilot CI reliability without reducing gates", () => {
  it("serializes the full browser matrix without increasing job timeout", () => {
    const job = workflow.jobs["e2e-local-owner"];
    expect(job.strategy["max-parallel"]).toBe(1);
    expect(job.strategy["fail-fast"]).toBe(false);
    expect(job.strategy.matrix.project).toEqual([
      "chromium",
      "firefox",
      "webkit",
    ]);
    expect(job["timeout-minutes"]).toBe(30);
  });

  it("installs real mobile dependencies before the combined required unit suite", () => {
    const steps = workflow.jobs.test.steps;
    const nodeSetup = steps.find(
      (step: { name?: string }) => step.name === "Setup Node.js"
    );
    expect(nodeSetup.with["node-version"]).toBe("22");
    const install = steps.findIndex(
      (step: { name?: string }) =>
        step.name === "Install mobile dependencies for combined unit suite"
    );
    const test = steps.findIndex(
      (step: { run?: string }) => step.run === "pnpm vitest run --coverage"
    );
    expect(install).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(test);
    expect(steps[install]["working-directory"]).toBe("mobile");
    expect(steps[install].run).toBe(
      "pnpm install --frozen-lockfile --ignore-workspace"
    );
    expect(steps[install]["continue-on-error"]).toBeUndefined();
    expect(steps[test]["continue-on-error"]).toBeUndefined();
  });

  it("retains the dedicated full mobile test job", () => {
    const job = workflow.jobs["mobile-quality"];
    expect(job.defaults.run["working-directory"]).toBe("mobile");
    expect(
      job.steps.some((step: { name?: string }) => step.name === "Test mobile")
    ).toBe(true);
  });
});
