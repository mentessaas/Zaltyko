import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  E2E_DOMAIN_MIGRATIONS,
  E2E_LOCAL_SCHEMA_POST_SNAPSHOT_MIGRATIONS,
  E2E_LOCAL_SCHEMA_SNAPSHOT,
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
    expect(localRunner).toContain("E2E_LOCAL_SCHEMA_SNAPSHOT");
    expect(localRunner).not.toContain("E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS");
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
    expect(localRunner).not.toContain(
      "E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS"
    );
    expect(localRunner).toContain("E2E_LOCAL_SCHEMA_POST_SNAPSHOT_MIGRATIONS");
    expect(sandboxMigrationRunner).not.toContain(
      "E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS"
    );
  });

  it("replays only the byte-pinned guarded snapshot and reviewed overlays in local E2E", () => {
    const snapshotPath = resolve(
      process.cwd(),
      "supabase",
      "schema-snapshots",
      E2E_LOCAL_SCHEMA_SNAPSHOT.filename
    );
    const snapshot = readFileSync(snapshotPath);
    expect(createHash("sha256").update(snapshot).digest("hex")).toBe(
      E2E_LOCAL_SCHEMA_SNAPSHOT.sha256
    );
    expect(snapshot.toString("utf8")).toContain(
      "current_setting('app.schema_snapshot_replay', true) IS DISTINCT FROM 'ci-empty-replay'"
    );

    const localRunner = readFileSync(
      resolve(process.cwd(), "scripts/run-e2e-local.ts"),
      "utf8"
    );
    expect(localRunner).toContain(
      "SET app.schema_snapshot_replay = 'ci-empty-replay';"
    );
    expect(localRunner).toContain("writeFileSync(");
    expect(E2E_LOCAL_SCHEMA_POST_SNAPSHOT_MIGRATIONS).toEqual([
      {
        filename: "20261024193934_rls_guard_missing_public_tables.sql",
        sha256:
          "005d16a4b2f87727c2c47b3affe5ccd5433323fdcf02404135cbf5d11be07959",
      },
      {
        filename: "20261024223700_seed_owner_bootstrap_sport_profiles.sql",
        sha256:
          "d8c2a0b81a0d7f75f1f94ebd0f131ab85775a6e7904e2606a980570cbc02c225",
      },
    ]);

    for (const migration of E2E_LOCAL_SCHEMA_POST_SNAPSHOT_MIGRATIONS) {
      const source = readFileSync(
        resolve(process.cwd(), "supabase", "migrations", migration.filename)
      );
      expect(createHash("sha256").update(source).digest("hex")).toBe(
        migration.sha256
      );
    }
  });
});
