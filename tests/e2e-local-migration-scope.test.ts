import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  E2E_DOMAIN_MIGRATIONS,
  E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS,
} from "../scripts/lib/e2e-domain-migrations";

const ownerConsentMigration =
  "20261013235142_owner_signup_consent_canonical.sql";

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
});
