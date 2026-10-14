import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const runnerSource = readFileSync(
  resolve(process.cwd(), "scripts/run-e2e-local.ts"),
  "utf8"
);

describe("local E2E runner safety", () => {
  it("forces Next telemetry off in the sanitized child environment", () => {
    expect(runnerSource).toContain(
      'safeEnvironment.NEXT_TELEMETRY_DISABLED = "1"'
    );
    expect(runnerSource).toContain("...safeEnvironment,");
  });

  it("stops the exact isolated project after any start attempt", () => {
    expect(runnerSource).toContain(
      "const localProject = (args: string[]) => ["
    );
    expect(runnerSource).toContain('"--workdir",\n  projectDirectory,');
    expect(runnerSource).toContain('localProject(["start"])');
    expect(runnerSource).toContain('localProject(["stop", "--no-backup"])');
    expect(runnerSource).toContain("let stackStartAttempted = false;");
    expect(runnerSource).toMatch(
      /stackStartAttempted = true;\s*run\("supabase", localProject\(\["start"\]\)\);/
    );
    expect(runnerSource).toContain("if (stackStartAttempted)");
  });

  it("preserves the project directory when stopping the stack fails", () => {
    expect(runnerSource).toMatch(
      /catch \(error\) \{\s*preserveProjectDirectory = true;/
    );
    expect(runnerSource).toMatch(
      /if \(!preserveProjectDirectory\) \{\s*rmSync\(projectDirectory/
    );
  });
});
