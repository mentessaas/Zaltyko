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
    expect(runner).toContain("trap cleanup EXIT");
    expect(runner).toContain("-h 127.0.0.1");
    expect(runner).toContain('SOURCE_DB="zaltyko_restore_source"');
    expect(runner).toContain('TARGET_DB="zaltyko_restore_target"');
    expect(runner).toContain("env -i");
    expect(runner).not.toMatch(/\.env(?:\.local)?/);
    expect(runner).not.toMatch(/supabase\.co|vercel\.app|stripe\.com/i);
  });

  it("backs up, hashes, restores, and compares the structural catalog", () => {
    expect(runner).toContain("pg_dump");
    expect(runner).toContain("pg_restore --exit-on-error");
    expect(runner).toContain("shasum -a 256 -c");
    expect(runner).not.toContain("cmp -s");
    expect(verifier).toContain("assert.deepEqual(targetCatalog, sourceCatalog");
  });

  it("preserves the temporary cluster if stop or path validation fails", () => {
    expect(runner).toContain("PG_START_ATTEMPTED=1");
    expect(runner).toContain(
      'if run_clean pg_ctl -D "${PG_DATA}" -m fast stop'
    );
    expect(runner).toMatch(
      /if run_clean pg_ctl -D "\$\{PG_DATA\}" -m fast stop[\s\S]*?else[\s\S]*?preserve_dir=1/
    );
    expect(runner).toContain("preserve_dir=1");
    expect(runner).toContain("if ((preserve_dir == 0)); then");
    expect(runner).toMatch(
      /if \(\(preserve_dir == 0\)\); then[\s\S]*?rm -rf -- "\$\{RUN_DIR\}"/
    );
    expect(
      runner.indexOf('if run_clean pg_ctl -D "${PG_DATA}" -m fast stop')
    ).toBeLessThan(runner.indexOf('rm -rf -- "${RUN_DIR}"'));
    expect(runner).toContain("recovery path: ${RUN_DIR}");
  });

  it("requires matching PostgreSQL major versions across local tools", () => {
    expect(runner).toContain("pg_tool_major_version()");
    expect(runner).toContain(
      'PG_MAJOR_VERSION="$(pg_tool_major_version initdb)"'
    );
    expect(runner).toContain(
      "for command in postgres pg_ctl psql createdb pg_dump pg_restore; do"
    );
    expect(runner).toContain(
      '"${tool_major_version}" != "${PG_MAJOR_VERSION}"'
    );
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
