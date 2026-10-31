import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const { load } = require("js-yaml");

describe("release stays locked during synthetic CI", () => {
  it("disables Git deployments for this candidate", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.git.deploymentEnabled).toBe(false);
    expect(config.crons).toEqual([]);
  });

  it("keeps the deployment workflow credential-free and fail-closed", () => {
    const source = readFileSync(".github/workflows/deploy.yml", "utf8");
    const workflow = load(source);
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(workflow.jobs)).toEqual(["deployment-locked"]);
    expect(workflow.jobs["deployment-locked"].steps).toHaveLength(1);
    expect(workflow.jobs["deployment-locked"].steps[0].run).toContain("exit 1");
    expect(source).not.toMatch(/secrets\.|vercel (deploy|build|pull)|uses:/);
  });
});
