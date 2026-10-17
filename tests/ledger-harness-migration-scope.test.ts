import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration =
  "20261014001209_monthly_athlete_tariff_coverage_and_invoice_line_enrollments.sql";

describe("monthly tariff migration in local ledger harnesses", () => {
  it.each([
    "scripts/run-zaltyko-ledger-services-local.sh",
    "scripts/run-zaltyko-canonical-stack-local.sh",
  ])(
    "applies the additive migration after existing prerequisites in %s",
    (path) => {
      const runner = readFileSync(resolve(process.cwd(), path), "utf8");
      const migrationIndex = runner.indexOf(migration);

      expect(migrationIndex).toBeGreaterThan(0);
      expect(runner.indexOf(migration, migrationIndex + migration.length)).toBe(
        -1
      );
      expect(
        runner.indexOf("20261006093047_add_internal_billing_ledger.sql")
      ).toBeLessThan(migrationIndex);
      expect(
        runner.indexOf(
          "20261013100000_model_sport_profiles_and_complementary_activities.sql"
        )
      ).toBeLessThan(migrationIndex);
    }
  );

  it("keeps the ledger harness on its existing legacy invoice assertions", () => {
    const ledgerRunner = readFileSync(
      resolve(process.cwd(), "scripts/run-zaltyko-ledger-services-local.sh"),
      "utf8"
    );
    const canonicalRunner = readFileSync(
      resolve(process.cwd(), "scripts/run-zaltyko-canonical-stack-local.sh"),
      "utf8"
    );
    const legacyLedgerCheck = readFileSync(
      resolve(process.cwd(), "supabase/tests/zaltyko_ledger_foundation.sql"),
      "utf8"
    );
    const preMigrationFixture = readFileSync(
      resolve(
        process.cwd(),
        "supabase/tests/zaltyko_monthly_athlete_tariff_pre_migration.sql"
      ),
      "utf8"
    );
    const migrationSchemaCheck = readFileSync(
      resolve(
        process.cwd(),
        "supabase/tests/zaltyko_monthly_athlete_tariff_schema.sql"
      ),
      "utf8"
    );
    const migrationSource = readFileSync(
      resolve(process.cwd(), "supabase/migrations", migration),
      "utf8"
    );

    expect(ledgerRunner).toContain("scripts/verify-zaltyko-ledger-services.ts");
    expect(canonicalRunner).toContain("zaltyko_ledger_foundation.sql");
    expect(legacyLedgerCheck).toContain("'membership', 1, 10000");
    expect(preMigrationFixture).toContain("SYNTH-MONTHLY-LEGACY");
    expect(preMigrationFixture).toContain("enrollment_id, price_plan_id");
    expect(migrationSchemaCheck).toContain("old_line.enrollment_id");
    expect(migrationSchemaCheck).toContain("old_line.location_id is not null");
    expect(migrationSchemaCheck).toContain("old_line.athlete_id is not null");
    expect(migrationSource).not.toMatch(/update\s+zaltyko\.invoice_lines/i);
  });
});
