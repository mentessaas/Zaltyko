import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { bootstrapOrganization } from "@/modules/organizations/application/bootstrap-organization";

function assertDisposableTarget() {
  const connection = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  const target = new URL(connection ?? "");
  if (process.env.ZALTYKO_PG_INTEGRATION !== "1" || process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_OS !== "Linux" || process.env.NODE_ENV !== "test" || !["postgres:", "postgresql:"].includes(target.protocol) || !["127.0.0.1", "localhost", "::1"].includes(target.hostname) || target.username !== "supabase_admin" || !target.password || !target.port || target.pathname !== "/postgres" || target.search || [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some(value => value !== connection)) throw new Error("Disposable GitHub Linux loopback Postgres is required");
  for (const name of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL", "SUPABASE_PROJECT_REF", "SUPABASE_SERVICE_ROLE_KEY", "E2E_TARGET_SUPABASE_PROJECT_REF", "STRIPE_SAAS_TEST_SECRET_KEY", "STRIPE_SAAS_LIVE_SECRET_KEY", "VERCEL_TOKEN"]) {
    if (process.env[name]) throw new Error("External credentials are forbidden");
  }
}

const userId = randomUUID();
const command = { userId, organizationName: "Club sintético México", locationName: "Sede Tijuana", countryCode: "MX", defaultCurrency: "MXN" as const, timezone: "America/Tijuana", primaryDiscipline: "artistic" as const, additionalDisciplines: ["rhythmic" as const], complementaryActivities: [], idempotencyKey: `ci-mx-${randomUUID()}` };
const profileCandidate = () => readFileSync(resolve(process.cwd(), "docs/deployment/candidates/20261104121000_mx_general_identity_candidate.sql"), "utf8");

async function userSnapshot() {
  return (await db.execute(sql`select
    (select count(*)::int from zaltyko.organization_members where user_id = ${userId}::uuid) as members,
    (select count(*)::int from zaltyko.organization_bootstrap_commands where user_id = ${userId}::uuid) as commands`)).rows[0];
}

describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1")("international bootstrap on disposable Postgres", () => {
  beforeAll(async () => {
    assertDisposableTarget();
    await db.execute(sql`insert into auth.users(id,email) values (${userId}::uuid,${`ci-mx-${userId}@example.invalid`})`);
  });

  it("rejects unsupported currency/timezone before creating any membership or receipt", async () => {
    const before = await userSnapshot();
    await expect(bootstrapOrganization({ ...command, timezone: undefined })).rejects.toMatchObject({ status: 422 });
    await expect(bootstrapOrganization({ ...command, timezone: "Europe/Madrid" })).rejects.toMatchObject({ status: 422 });
    await expect(bootstrapOrganization({ ...command, defaultCurrency: "EUR" })).rejects.toMatchObject({ status: 422 });
    expect(await userSnapshot()).toEqual(before);
  });

  it("installs only the reviewed identity candidate idempotently and keeps Mexican settings on replay", async () => {
    await db.execute(sql.raw(profileCandidate()));
    await db.execute(sql.raw(profileCandidate()));
    const first = await bootstrapOrganization(command);
    expect(first.administrativeMarket).toEqual({ countryCode: "MX", defaultCurrency: "MXN", timezone: "America/Tijuana" });
    expect(first.sportCoverage.mode).toBe("general_identity_only");
    expect(await bootstrapOrganization(command)).toEqual(first);
    expect(await userSnapshot()).toEqual({ members: 1, commands: 1 });
    const data = await db.execute(sql`select o.country_code,o.default_currency,l.timezone,
      (select count(*)::int from zaltyko.organization_sports s where s.organization_id=o.id) as sports,
      (select count(*)::int from zaltyko.programs p where p.organization_id=o.id) as programs,
      (select count(*)::int from zaltyko.organization_sports s join zaltyko.sport_profiles p on p.id=s.sport_profile_id where s.organization_id=o.id and p.country_code='ES') as spanish_profiles
      from zaltyko.organizations o join zaltyko.locations l on l.organization_id=o.id where o.id=${first.organizationId}::uuid`);
    expect(data.rows).toEqual([{ country_code: "MX", default_currency: "MXN", timezone: "America/Tijuana", sports: 1, programs: 2, spanish_profiles: 0 }]);
    const before = await userSnapshot();
    await expect(bootstrapOrganization({ ...command, timezone: "America/Cancun" })).rejects.toMatchObject({ status: 409 });
    expect(await userSnapshot()).toEqual(before);
  });
});
