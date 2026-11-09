import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  getOwnerGuardianProfile,
  updateOwnerGuardianProfile,
} from "@/modules/families/application/owner-guardian-profile";
import { getOrganizationUsage } from "@/modules/saas-billing/application/organization-usage";

const disposablePgEnabled = process.env.ZALTYKO_PG_INTEGRATION === "1";
const describeDisposablePg = describe.skipIf(!disposablePgEnabled);
const snapshotTables = ["audit_log", "families", "family_guardians", "family_members", "guardians", "outbox_events", "people"] as const;

function assertDisposableTarget() {
  if (
    process.env.ZALTYKO_PG_INTEGRATION !== "1" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_OS !== "Linux" ||
    process.env.NODE_ENV !== "test"
  ) throw new Error("This suite is restricted to the disposable GitHub Linux database");

  const connectionString = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  const configuredUrls = [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT];
  let parsed: URL;
  try { parsed = new URL(connectionString ?? ""); }
  catch { throw new Error("The disposable PostgreSQL target is invalid"); }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.username !== "supabase_admin" || parsed.port === "" || !parsed.password ||
    parsed.pathname !== "/postgres" || configuredUrls.some((value) => value !== connectionString)
  ) throw new Error("The integration suite refuses an unexpected PostgreSQL identity");

  const forbidden = [
    "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL", "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY", "E2E_TARGET_SUPABASE_PROJECT_REF", "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY", "VERCEL_TOKEN",
  ];
  const active = forbidden.filter((name) => Boolean(process.env[name]));
  if (active.length) throw new Error(`The integration runner contains forbidden external credentials: ${active.join(", ")}`);
}

async function snapshot(organizationId: string) {
  const queries = sql.join(snapshotTables.map((table) => sql`
    select ${table}::text as table_name,
      count(*)::int as count,
      md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) as content_hash
    from ${sql.identifier("zaltyko")}.${sql.identifier(table)} as row_data
    where row_data.organization_id = ${organizationId}::uuid
  `), sql` union all `);
  const result = await db.execute(sql`select * from (${queries}) rows order by table_name`);
  return Object.fromEntries(result.rows.map((row) => [String(row.table_name), {
    count: Number(row.count),
    contentHash: String(row.content_hash),
  }])) as Record<(typeof snapshotTables)[number], { count: number; contentHash: string }>;
}

async function seedFixture() {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const locationId = randomUUID();
  const athletePersonId = randomUUID();
  const guardianPersonId = randomUUID();
  const athleteId = randomUUID();
  const guardianId = randomUUID();
  const familyId = randomUUID();
  const groupId = randomUUID();

  await db.execute(sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-profile-${userId}@example.invalid`})`);
  await db.execute(sql`insert into zaltyko.organizations (id, name) values (${organizationId}::uuid, ${`CI guardian profile ${organizationId}`})`);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone)
    values (${locationId}::uuid, ${organizationId}::uuid, ${`ci-profile-${organizationId.slice(0, 8)}`}, 'CI profile site', 'Europe/Madrid')
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
    values (${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'owner', 'active', 'all')
  `);
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values
      (${athletePersonId}::uuid, ${organizationId}::uuid, 'Synthetic', 'Athlete'),
      (${guardianPersonId}::uuid, ${organizationId}::uuid, 'Ana', 'López')
  `);
  await db.execute(sql`insert into zaltyko.athletes (id, organization_id, person_id) values (${athleteId}::uuid, ${organizationId}::uuid, ${athletePersonId}::uuid)`);
  await db.execute(sql`
    insert into zaltyko.groups (id, organization_id, location_id, name, capacity, status)
    values (${groupId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, 'CI profile group', 10, 'active')
  `);
  await db.execute(sql`
    insert into zaltyko.group_memberships (organization_id, group_id, athlete_id, status, starts_on)
    values (${organizationId}::uuid, ${groupId}::uuid, ${athleteId}::uuid, 'active', (now() at time zone 'Europe/Madrid')::date)
  `);
  await db.execute(sql`insert into zaltyko.families (id, organization_id) values (${familyId}::uuid, ${organizationId}::uuid)`);
  await db.execute(sql`insert into zaltyko.guardians (id, organization_id, person_id) values (${guardianId}::uuid, ${organizationId}::uuid, ${guardianPersonId}::uuid)`);
  await db.execute(sql`
    insert into zaltyko.family_members (organization_id, family_id, athlete_id, relationship, starts_on)
    values (${organizationId}::uuid, ${familyId}::uuid, ${athleteId}::uuid, 'other', (now() at time zone 'Europe/Madrid')::date)
  `);
  await db.execute(sql`
    insert into zaltyko.family_guardians (organization_id, family_id, guardian_id, relationship)
    values (${organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid, 'parent')
  `);
  return { organizationId, userId, memberId, locationId, guardianId, actor: { userId, memberId } };
}

async function addThirtyActiveAthletes(organizationId: string) {
  await db.execute(sql`
    with new_people as (
      insert into zaltyko.people (organization_id, given_name, family_name)
      select ${organizationId}::uuid, 'Synthetic capacity', series.n::text
      from generate_series(1, 30) as series(n)
      returning id
    )
    insert into zaltyko.athletes (organization_id, person_id)
    select ${organizationId}::uuid, new_people.id from new_people
  `);
}

describeDisposablePg("Owner guardian profile against disposable PostgreSQL", () => {
  it("preserves six-microsecond optimistic versions and read-only idempotent recovery", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    const scope = {
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      guardianId: fixture.guardianId,
      actor: fixture.actor,
    };
    const before = await getOwnerGuardianProfile(scope);
    expect(before).toMatchObject({ guardianId: fixture.guardianId, givenName: "Ana", familyName: "López" });
    expect(before.updatedAt).toMatch(/\.\d{6}Z$/u);

    const command = {
      ...scope,
      expectedGivenName: before.givenName,
      expectedFamilyName: before.familyName,
      expectedUpdatedAt: before.updatedAt,
      givenName: " Ana   Mari\u0301a ",
      familyName: "López Ruiz",
      idempotencyKey: `ci-profile-${randomUUID()}`,
    };
    const updated = await updateOwnerGuardianProfile(command);
    expect(updated).toMatchObject({ givenName: "Ana María", familyName: "López Ruiz", replayed: false });
    expect(updated.updatedAt).toMatch(/\.\d{6}Z$/u);

    const event = await db.execute(sql`
      select aggregate_type, aggregate_id, payload
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and event_name = 'guardian.profile_updated'
        and idempotency_key = ${command.idempotencyKey}
    `);
    expect(event.rows).toHaveLength(1);
    expect(event.rows[0]).toMatchObject({ aggregate_type: "guardian", aggregate_id: fixture.guardianId });
    expect(event.rows[0]?.payload).not.toHaveProperty("guardianId");
    expect(JSON.stringify(event.rows[0]?.payload)).not.toContain("Ana María");
    expect(JSON.stringify(event.rows[0]?.payload)).not.toContain("López Ruiz");

    const afterUpdate = await snapshot(fixture.organizationId);
    const replay = await updateOwnerGuardianProfile(command);
    expect(replay).toMatchObject({
      givenName: "Ana María",
      familyName: "López Ruiz",
      updatedAt: updated.updatedAt,
      replayed: true,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(afterUpdate);

    await addThirtyActiveAthletes(fixture.organizationId);
    const usage = await db.transaction((tx) => getOrganizationUsage(tx, fixture.organizationId));
    expect(usage.readOnly).toBe(true);
    const beforeReadonlyReplay = await snapshot(fixture.organizationId);
    expect(await updateOwnerGuardianProfile(command)).toMatchObject({ replayed: true });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeReadonlyReplay);

    await expect(updateOwnerGuardianProfile({
      ...scope,
      expectedGivenName: updated.givenName,
      expectedFamilyName: updated.familyName,
      expectedUpdatedAt: updated.updatedAt,
      givenName: "Blocked",
      familyName: "Change",
      idempotencyKey: `ci-profile-readonly-${randomUUID()}`,
    })).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeReadonlyReplay);
  }, 45_000);
});
