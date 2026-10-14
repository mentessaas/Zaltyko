import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8"
);
const readiness = readFileSync(
  resolve(process.cwd(), "scripts/ci/check-e2e-readiness.sh"),
  "utf8"
);

describe("remote E2E protected environment contract", () => {
  it("puts both secret-bearing jobs behind the same sandbox environment", () => {
    const readinessJob = workflow
      .split("  e2e-readiness:\n")[1]
      ?.split("\n  e2e-local-owner:")[0];
    const authenticatedJob = workflow
      .split("  e2e-auth:\n")[1]
      ?.split("\n  e2e-auth-required-gate:")[0];

    expect(readinessJob).toContain("environment:\n      name: e2e-sandbox");
    expect(authenticatedJob).toContain("environment:\n      name: e2e-sandbox");
  });

  it("fails readiness for every PR with missing E2E credentials", () => {
    expect(readiness).toMatch(
      /elif \[\[ "\$event_name" == "pull_request" \]\]; then[\s\S]*?enabled=false[\s\S]*?exit 1/
    );
    expect(readiness).not.toMatch(
      /skipped for (?:Dependabot|an external fork)/
    );
  });

  it("fails the stable PR gate when readiness or E2E is skipped or fails", () => {
    const gate = workflow.split("  e2e-auth-required-gate:\n")[1];

    expect(gate).toContain("name: E2E Authenticated PR Required Gate");
    expect(gate).toContain("needs: [e2e-readiness, e2e-auth]");
    expect(gate).toContain("always() && github.event_name == 'pull_request'");
    expect(gate).toContain("needs.e2e-readiness.result");
    expect(gate).toContain("needs.e2e-auth.result");
    expect(gate).toContain('!= "success"');
    expect(gate).toContain("exit 1");
    expect(
      workflow.indexOf("Verify contact write and idempotency in sandbox")
    ).toBeLessThan(workflow.indexOf("  e2e-auth-required-gate:"));
  });
});
