import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const runner = readFileSync(
  resolve(process.cwd(), "scripts/run-zaltyko-synthetic-restore-local.sh"),
  "utf8"
);
const verifier = readFileSync(
  resolve(process.cwd(), "scripts/verify-zaltyko-synthetic-restore-local.ts"),
  "utf8"
);

describe("synthetic local restore runner contract", () => {
  it("uses two loopback databases and an isolated disposable cluster", () => {
    expect(runner).toContain("mktemp -d /tmp/zaltyko-restore.");
    expect(runner).toContain('trap cleanup EXIT');
    expect(runner).toContain("-h 127.0.0.1");
    expect(runner).toContain('SOURCE_DB="zaltyko_restore_source"');
    expect(runner).toContain('TARGET_DB="zaltyko_restore_target"');
    expect(runner).toContain("env -i");
    expect(runner).not.toMatch(/\.env(?:\.local)?/);
    expect(runner).not.toMatch(/supabase\.co|vercel\.app|stripe\.com/i);
  });

  it("backs up, hashes, restores, and compares the schema dump", () => {
    expect(runner).toContain("pg_dump");
    expect(runner).toContain("pg_restore --exit-on-error");
    expect(runner).toContain("shasum -a 256 -c");
    expect(runner).toContain("cmp -s");
    expect(runner).toContain("rm -rf -- \"${RUN_DIR}\"");
  });

  it("includes local-only consent and monthly coverage migrations", () => {
    expect(runner).toContain(
      "20261013235142_owner_signup_consent_canonical.sql"
    );
    expect(runner).toContain(
      "20261014001209_monthly_athlete_tariff_coverage_and_invoice_line_enrollments.sql"
    );
    expect(runner).toContain("verify-zaltyko-operational-services.ts");
  });

  it("checks financial reconciliation, RLS, and immutable history", () => {
    expect(verifier).toContain("assert.deepEqual(targetCatalog, sourceCatalog");
    expect(verifier).toContain("assert.deepEqual(targetLedger, sourceLedger");
    expect(verifier).toContain("verifyRls(sourcePool)");
    expect(verifier).toContain("verifyImmutability(targetPool)");
    expect(verifier).toContain("invoice_line_enrollments");
    expect(verifier).toContain("owner_signup_consent_audits");
  });
});
