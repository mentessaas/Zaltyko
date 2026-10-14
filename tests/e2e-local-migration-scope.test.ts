import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  E2E_DOMAIN_MIGRATIONS,
  E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS,
  E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS,
} from "../scripts/lib/e2e-domain-migrations";

const ownerConsentMigration =
  "20261013235142_owner_signup_consent_canonical.sql";
const monthlyAthleteTariffMigration =
  "20261014001209_monthly_athlete_tariff_coverage_and_invoice_line_enrollments.sql";

describe("local Owner E2E migration boundary", () => {
  it("keeps canonical signup consent out of the shared sandbox allowlist", () => {
    expect(E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS).toEqual([ownerConsentMigration]);
    expect(E2E_DOMAIN_MIGRATIONS).not.toContain(ownerConsentMigration);

    const localRunner = readFileSync(
      resolve(process.cwd(), "scripts/run-e2e-local.ts"),
      "utf8"
    );
    const sandboxMigrationRunner = readFileSync(
      resolve(process.cwd(), "scripts/apply-e2e-domain-migrations.ts"),
      "utf8"
    );
    expect(localRunner).toContain("E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS");
    expect(sandboxMigrationRunner).not.toContain(
      "E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS"
    );
  });

  it("keeps athlete tariff coverage in the isolated local runner only", () => {
    expect(E2E_DOMAIN_MIGRATIONS).toHaveLength(16);
    expect(E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS).toEqual([
      monthlyAthleteTariffMigration,
    ]);
    expect(E2E_DOMAIN_MIGRATIONS).not.toContain(monthlyAthleteTariffMigration);
    expect(E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS).not.toContain(
      monthlyAthleteTariffMigration
    );
    expect(() =>
      readFileSync(
        resolve(
          process.cwd(),
          "supabase/migrations",
          monthlyAthleteTariffMigration
        ),
        "utf8"
      )
    ).not.toThrow();

    const localRunner = readFileSync(
      resolve(process.cwd(), "scripts/run-e2e-local.ts"),
      "utf8"
    );
    const sandboxMigrationRunner = readFileSync(
      resolve(process.cwd(), "scripts/apply-e2e-domain-migrations.ts"),
      "utf8"
    );
    expect(localRunner).toContain(
      "E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS"
    );
    expect(sandboxMigrationRunner).not.toContain(
      "E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS"
    );
  });
});
