import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const runnerSource = readFileSync(
  resolve(process.cwd(), "scripts/run-e2e-local.ts"),
  "utf8"
);

describe("local E2E runner wiring", () => {
  it("forwards telemetry-off through the sanitized child environment", () => {
    expect(runnerSource).toContain(
      'safeEnvironment.NEXT_TELEMETRY_DISABLED = "1"'
    );
    expect(runnerSource).toContain("...safeEnvironment,");
  });

  it("uses lockfile-installed CLIs directly and preflights images before start", () => {
    expect(runnerSource).toContain("verifyInstalledRunnerPackages(root)");
    expect(runnerSource).toContain("process.execPath");
    expect(runnerSource).toContain('localCliPath(root, "playwright")');
    expect(runnerSource).not.toContain('run("pnpm"');
    expect(runnerSource).not.toContain('spawnSync("pnpm"');
    expect(
      runnerSource.indexOf("const missingImages = findMissingImages(")
    ).toBeLessThan(
      runnerSource.indexOf('localProject(["start", "--exclude", "supavisor"])')
    );
  });

  it("marks stack start attempted before the command and stops the same workdir", () => {
    expect(runnerSource).toMatch(
      /stackStartAttempted = true;\s*await run\(\s*supabaseCli,\s*localProject\(\["start", "--exclude", "supavisor"\]\)/
    );
    expect(runnerSource).toContain('localProject(["stop", "--no-backup"])');
    expect(runnerSource).toContain("cleanupLocalProject({");
    expect(runnerSource).toContain("preserved at ${projectDirectory}");
  });

  it("installs SIGINT and SIGTERM handlers for the entire stack lifecycle", () => {
    expect(runnerSource).toContain('process.on("SIGINT", onSigint)');
    expect(runnerSource).toContain('process.on("SIGTERM", onSigterm)');
    expect(runnerSource).toContain('process.off("SIGINT", onSigint)');
    expect(runnerSource).toContain('process.off("SIGTERM", onSigterm)');
  });
});
