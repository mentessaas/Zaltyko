import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const runnerSource = readFileSync(
  resolve(process.cwd(), "scripts/run-e2e-local.ts"),
  "utf8"
);
const playwrightConfigSource = readFileSync(
  resolve(process.cwd(), "playwright.config.ts"),
  "utf8"
);
const localSetupSpec = readFileSync(
  resolve(process.cwd(), "tests/e2e-owner-local-setup.spec.ts"),
  "utf8"
);

describe("local E2E runner wiring", () => {
  it("excludes only the pooler and management UI services", () => {
    const start = runnerSource.split(
      'localProject(["start", "--exclude", "'
    )[1];
    expect(start?.split('"')[0].split(",")).toEqual([
      "supavisor",
      "studio",
      "postgres-meta",
    ]);
    expect(runnerSource).not.toContain("--ignore-health-check");
  });

  it("forwards telemetry-off through the sanitized child environment", () => {
    expect(runnerSource).toContain(
      'safeEnvironment.NEXT_TELEMETRY_DISABLED = "1"'
    );
    expect(runnerSource).toContain("...safeEnvironment,");
  });

  it("uses lockfile-installed CLIs directly and preflights images before start", () => {
    expect(runnerSource).toContain("verifyInstalledRunnerPackages(root)");
    expect(runnerSource).toContain('localNodeCliInvocation(root, "playwright"');
    expect(runnerSource).toContain('localNodeCliInvocation(root, "next"');
    expect(runnerSource).toContain(
      "runAllowExitCode(\n      playwrightCli.command"
    );
    expect(runnerSource).toMatch(
      /const buildTimeoutMs =\s*process\.env\.GITHUB_ACTIONS === "true"\s*\?\s*LOCAL_E2E_TIMEOUTS\.ciBuild\s*:\s*LOCAL_E2E_TIMEOUTS\.build/
    );
    expect(runnerSource).toMatch(
      /withBuildDiagnostic\(\s*\(\) =>\s*withBuildHostResourceMetrics\(\s*\(\) =>\s*run\(\s*nextBuild\.command,\s*nextBuild\.args,\s*\{\s*\.\.\.childEnv,\s*NODE_ENV: "production",\s*ZALTYKO_E2E_WEBPACK_BUILD_WORKER: "true",\s*\},\s*buildTimeoutMs,\s*abortController\.signal,\s*"pipe",\s*progress\.push\s*\)/
    );
    expect(playwrightConfigSource).toContain(
      'localCliEntrypoint(process.cwd(), "next")'
    );
    expect(playwrightConfigSource).toContain(
      "quoteShellArgument(process.execPath)"
    );
    expect(playwrightConfigSource).toContain("quoteShellArgument(nextCli)");
    expect(runnerSource).not.toContain('run("pnpm"');
    expect(runnerSource).not.toContain('spawnSync("pnpm"');
    expect(
      runnerSource.indexOf("const missingImages = findMissingImages(")
    ).toBeLessThan(
      runnerSource.indexOf(
        'localProject(["start", "--exclude", "supavisor,studio,postgres-meta"])'
      )
    );
  });

  it("marks stack start attempted before the command and stops the same workdir", () => {
    expect(runnerSource).toMatch(
      /stackStartAttempted = true;\s*await run\(\s*supabaseCli,\s*localProject\(\["start", "--exclude", "supavisor,studio,postgres-meta"\]\)/
    );
    expect(runnerSource).toContain('localProject(["stop", "--no-backup"])');
    expect(runnerSource).toContain("cleanupLocalProject({");
    expect(runnerSource).toContain("preserved at ${projectDirectory}");
  });

  it("scopes host metrics to the synthetic Linux build callback without child env flags", () => {
    const metricsSource = readFileSync(
      resolve(
        process.cwd(),
        "scripts/lib/local-build-host-resource-metrics.ts"
      ),
      "utf8"
    );
    expect(runnerSource).toContain("withBuildHostResourceMetrics(");
    expect(runnerSource).toContain("platform: process.platform");
    expect(runnerSource).toContain("env: process.env");
    expect(runnerSource).toContain("emit: (metrics) =>");
    expect(metricsSource).toContain('env.GITHUB_ACTIONS === "true"');
    expect(metricsSource).toContain('env.RUNNER_OS === "Linux"');
    expect(metricsSource).toContain('env.CI === "true"');
    expect(metricsSource).toContain("browserProjects.some(");
    expect(runnerSource).not.toMatch(/ZALTYKO_E2E_BUILD_HOST_METRICS/);
    expect(runnerSource).not.toMatch(/buildHostResourceMetrics:\s*"true"/);
    expect(runnerSource).toMatch(
      /withBuildDiagnostic\(\s*\(\) =>\s*withBuildHostResourceMetrics\(\s*\(\) =>\s*run\(/
    );
  });

  it("installs SIGINT and SIGTERM handlers for the entire stack lifecycle", () => {
    expect(runnerSource).toContain('process.on("SIGINT", onSigint)');
    expect(runnerSource).toContain('process.on("SIGTERM", onSigterm)');
    expect(runnerSource).toContain('process.off("SIGINT", onSigint)');
    expect(runnerSource).toContain('process.off("SIGTERM", onSigterm)');
  });

  it("blocks service workers only for the local Supabase and public read-only suites", () => {
    expect(playwrightConfigSource).toMatch(
      /isPublicReadOnlyRun \|\| isLocalSupabaseRun\s*\? \{ serviceWorkers: "block" as const \}/
    );
    expect(localSetupSpec).toMatch(
      /esta suite no valida el comportamiento del SW/i
    );
    expect(localSetupSpec).not.toContain("navigator.serviceWorker.controller");
  });
});
