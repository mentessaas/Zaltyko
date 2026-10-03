import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, "scripts/ci/check-e2e-readiness.sh");
const REPOSITORY = "mentessaas/Zaltyko";
const makeTestCredential = () => randomBytes(24).toString("hex");

const REQUIRED_SECRETS =
  readFileSync(SCRIPT, "utf8")
    .match(/^for name in ([^;]+); do$/m)?.[1]
    ?.split(/\s+/)
    .filter(Boolean) ?? [];

if (REQUIRED_SECRETS.length === 0) {
  throw new Error("Could not read required staging variable names from script");
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runReadiness(options: {
  event: string;
  author?: string;
  actor?: string;
  headRepository?: string;
  ref?: string;
  withTestSecrets?: boolean;
}) {
  const directory = mkdtempSync(path.join(tmpdir(), "zaltyko-e2e-readiness-"));
  temporaryDirectories.push(directory);
  const outputPath = path.join(directory, "github-output.txt");
  const env: NodeJS.ProcessEnv = { ...process.env };

  for (const name of REQUIRED_SECRETS) env[name] = "";
  if (options.withTestSecrets) {
    for (const name of REQUIRED_SECRETS) env[name] = makeTestCredential();
    env.STRIPE_SECRET_KEY = ["sk", "test", makeTestCredential()].join("_");
    env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = [
      "pk",
      "test",
      makeTestCredential(),
    ].join("_");
    env.E2E_TARGET_SUPABASE_PROJECT_REF = `sandbox-${makeTestCredential()}`;
  }

  env.GITHUB_OUTPUT = outputPath;
  env.GITHUB_REPOSITORY = REPOSITORY;
  env.GITHUB_REF = options.ref ?? "refs/pull/1/merge";
  env.E2E_EVENT_NAME = options.event;
  env.E2E_PR_AUTHOR = options.author ?? "human-maintainer";
  env.E2E_HEAD_REPOSITORY = options.headRepository ?? REPOSITORY;
  env.GITHUB_ACTOR = options.actor ?? env.E2E_PR_AUTHOR;

  const result = spawnSync("bash", [SCRIPT], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  const output = readFileSync(outputPath, "utf8");
  return { result, output };
}

describe("authenticated E2E credentials readiness", () => {
  it("checks out the repository before running its readiness script", () => {
    const workflow = readFileSync(
      path.join(ROOT, ".github/workflows/ci.yml"),
      "utf8"
    );
    const jobStart = workflow.indexOf("  e2e-readiness:\n");
    const checkout = workflow.indexOf("- uses: actions/checkout@", jobStart);
    const script = workflow.indexOf(
      "run: bash scripts/ci/check-e2e-readiness.sh",
      jobStart
    );

    expect(jobStart).toBeGreaterThanOrEqual(0);
    expect(checkout).toBeGreaterThan(jobStart);
    expect(script).toBeGreaterThan(checkout);
  });

  it("skips only the authenticated suite for a Dependabot PR even when a maintainer reruns it", () => {
    const { result, output } = runReadiness({
      event: "pull_request",
      author: "dependabot[bot]",
      actor: "human-maintainer",
    });

    expect(result.status).toBe(0);
    expect(output).toBe("enabled=false\n");
    expect(result.stdout).toContain("skipped for Dependabot");
  });

  it("fails closed for a same-repository human PR without staging secrets", () => {
    const { result } = runReadiness({
      event: "pull_request",
      author: "human-maintainer",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "requires staging-only secrets for same-repository pull requests"
    );
  });

  it("skips authenticated E2E for an external fork without repository secrets", () => {
    const { result, output } = runReadiness({
      event: "pull_request",
      author: "contributor",
      headRepository: "contributor/Zaltyko",
    });

    expect(result.status).toBe(0);
    expect(output).toBe("enabled=false\n");
    expect(result.stdout).toContain("external fork");
  });

  it("fails closed on main when staging secrets are missing", () => {
    const { result } = runReadiness({ event: "push", ref: "refs/heads/main" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "requires all staging-only secrets before main can pass"
    );
  });

  it("enables authenticated E2E when complete test-mode staging secrets exist", () => {
    const { result, output } = runReadiness({
      event: "pull_request",
      withTestSecrets: true,
    });

    expect(result.status).toBe(0);
    expect(output).toBe("enabled=true\n");
  });
});
