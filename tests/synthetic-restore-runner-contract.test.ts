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
const seeder = readFileSync(
  resolve(
    process.cwd(),
    "scripts/seed-zaltyko-synthetic-restore-monthly-invoice.ts"
  ),
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
    expect(verifier).toMatch(
      /assert\.deepEqual\(\s*targetCatalog,\s*sourceCatalog/
    );
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
    expect(runner).toContain(
      "seed-zaltyko-synthetic-restore-monthly-invoice.ts"
    );
    expect(runner).toContain("DOTENV_CONFIG_PATH=/dev/null");
  });

  it("seeds the restore invoice and payment through billing services", () => {
    expect(seeder).toContain("getMonthlyInvoiceOptions");
    expect(seeder).toContain("issueMonthlyInvoice");
    expect(seeder).toContain("recordManualPaymentForCharge");
    expect(seeder).toContain('servicePeriod: "2026-11"');
    expect(seeder).toContain("amountCents: 1");
    expect(seeder).toContain('url.hostname, "127.0.0.1"');
    expect(seeder).toContain('url.pathname, "/zaltyko_restore_source"');
    expect(seeder).not.toMatch(
      /\b(?:insert\s+into|update|delete\s+from)\s+zaltyko\./i
    );
    expect(seeder).not.toMatch(/pool\.query|client\.query/);
  });

  it("checks the November ledger and tracks October void as restore fidelity only", () => {
    expect(verifier).toContain("synthetic-restore-november-invoice-001");
    expect(verifier).toContain("synthetic-restore-november-payment-001");
    expect(verifier).toContain("2026-11-01");
    expect(verifier).toContain("2026-10-01");
    expect(verifier).toContain("octoberVoidGuard");
    expect(verifier).toContain("validVoidLifecycleClaimed: false");
    expect(verifier).toContain('invoices.rows[0].status, "partially_paid"');
  });

  it("checks financial reconciliation, RLS, and immutable history", () => {
    expect(verifier).toMatch(
      /assert\.deepEqual\(\s*targetCatalog,\s*sourceCatalog/
    );
    expect(verifier).toMatch(
      /assert\.deepEqual\(\s*targetLedger,\s*sourceLedger/
    );
    expect(verifier).toContain("verifyRls(sourcePool)");
    expect(verifier).toContain("verifyImmutability(targetPool)");
    expect(verifier).toContain("invoice_line_enrollments");
    expect(verifier).toContain("owner_signup_consent_audits");
  });
});
