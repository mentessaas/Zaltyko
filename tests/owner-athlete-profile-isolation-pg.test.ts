import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  getOwnerAthleteProfile,
  updateOwnerAthleteProfile,
} from "@/modules/athletes/application/owner-athlete-profile";

const disposablePgEnabled = process.env.ZALTYKO_PG_INTEGRATION === "1";
const describeDisposablePg = describe.skipIf(!disposablePgEnabled);

const snapshotTables = [
  "athletes",
  "audit_log",
  "families",
  "family_guardians",
  "family_members",
  "group_memberships",
  "groups",
  "guardians",
  "member_location_scopes",
  "organization_members",
  "outbox_events",
  "people",
] as const;

function assertDisposableTarget() {
  if (
    process.env.ZALTYKO_PG_INTEGRATION !== "1" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_OS !== "Linux" ||
    process.env.NODE_ENV !== "test"
  ) {
    throw new Error("This suite is restricted to the disposable GitHub Linux database");
  }

  const connectionString = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  const configuredUrls = [
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_POOL,
    process.env.DATABASE_URL_DIRECT,
  ];
  let parsed: URL;
  try {
    parsed = new URL(connectionString ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.username !== "supabase_admin" ||
    !parsed.port ||
    !parsed.password ||
    parsed.pathname !== "/postgres" ||
    configuredUrls.some((value) => value !== connectionString)
  ) {
    throw new Error("The integration suite refuses an unexpected PostgreSQL identity");
  }

  const forbidden = [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TARGET_SUPABASE_PROJECT_REF",
    "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY",
    "VERCEL_TOKEN",
  ];
  const activeForbidden = forbidden.filter((name) => Boolean(process.env[name]));
  if (activeForbidden.length > 0) {
    throw new Error(
      `The integration runner contains forbidden external credential variables: ${activeForbidden.join(", ")}`
    );
  }
}

async function snapshot(organizationId: string) {
  const queries = sql.join(
    snapshotTables.map((table) => sql`
      select ${table}::text as table_name,
        count(*)::int as count,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) as content_hash
      from ${sql.identifier("zaltyko")}.${sql.identifier(table)} as row_data
      where row_data.organization_id = ${organizationId}::uuid
    `),
    sql` union all `
  );
  const result = await db.execute(sql`select * from (${queries}) rows order by table_name`);
  return result.rows;
}

async function seedFixture() {
  const organizationId = randomUUID();
  const ownerUserId = randomUUID();
  const managerAUserId = randomUUID();
  const managerBUserId = randomUUID();
  const ownerMemberId = randomUUID();
  const managerAMemberId = randomUUID();
  const managerBMemberId = randomUUID();
  const locationAId = randomUUID();
  const locationBId = randomUUID();
  const familyAtBothSitesId = randomUUID();
  const familyWithoutTargetAnchorId = randomUUID();
  const athleteBPersonId = randomUUID();
  const athleteBId = randomUUID();
  const siblingAPersonId = randomUUID();
  const siblingAId = randomUUID();
  const unanchoredPersonId = randomUUID();
  const unanchoredAthleteId = randomUUID();
  const secondSiblingPersonId = randomUUID();
  const secondSiblingAId = randomUUID();
  const groupAId = randomUUID();
  const groupBId = randomUUID();
  const guardianBId = randomUUID();
  const guardianUnanchoredId = randomUUID();

  await db.execute(sql`
    insert into auth.users (id, email)
    values
      (${ownerUserId}::uuid, ${`ci-athlete-isolation-owner-${ownerUserId}@example.invalid`}),
      (${managerAUserId}::uuid, ${`ci-athlete-isolation-a-${managerAUserId}@example.invalid`}),
      (${managerBUserId}::uuid, ${`ci-athlete-isolation-b-${managerBUserId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${`CI profile isolation ${organizationId}`})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name)
    values
      (${locationAId}::uuid, ${organizationId}::uuid, ${`ci-profile-a-${locationAId.slice(0, 8)}`}, 'CI profile site A'),
      (${locationBId}::uuid, ${organizationId}::uuid, ${`ci-profile-b-${locationBId.slice(0, 8)}`}, 'CI profile site B')
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    )
    values
      (${ownerMemberId}::uuid, ${organizationId}::uuid, ${ownerUserId}::uuid, 'owner', 'active', 'all'),
      (${managerAMemberId}::uuid, ${organizationId}::uuid, ${managerAUserId}::uuid, 'manager', 'active', 'selected'),
      (${managerBMemberId}::uuid, ${organizationId}::uuid, ${managerBUserId}::uuid, 'manager', 'active', 'selected')
  `);
  await db.execute(sql`
    insert into zaltyko.member_location_scopes (
      organization_id, member_id, location_id
    )
    values
      (${organizationId}::uuid, ${managerAMemberId}::uuid, ${locationAId}::uuid),
      (${organizationId}::uuid, ${managerBMemberId}::uuid, ${locationBId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values
      (${athleteBPersonId}::uuid, ${organizationId}::uuid, 'Target B', 'Synthetic'),
      (${siblingAPersonId}::uuid, ${organizationId}::uuid, 'Sibling A', 'Synthetic'),
      (${unanchoredPersonId}::uuid, ${organizationId}::uuid, 'Unanchored target', 'Synthetic'),
      (${secondSiblingPersonId}::uuid, ${organizationId}::uuid, 'Second sibling A', 'Synthetic')
  `);
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id)
    values
      (${athleteBId}::uuid, ${organizationId}::uuid, ${athleteBPersonId}::uuid),
      (${siblingAId}::uuid, ${organizationId}::uuid, ${siblingAPersonId}::uuid),
      (${unanchoredAthleteId}::uuid, ${organizationId}::uuid, ${unanchoredPersonId}::uuid),
      (${secondSiblingAId}::uuid, ${organizationId}::uuid, ${secondSiblingPersonId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.groups (id, organization_id, location_id, name, capacity, status)
    values
      (${groupAId}::uuid, ${organizationId}::uuid, ${locationAId}::uuid, 'CI profile group A', 10, 'active'),
      (${groupBId}::uuid, ${organizationId}::uuid, ${locationBId}::uuid, 'CI profile group B', 10, 'active')
  `);
  await db.execute(sql`
    insert into zaltyko.group_memberships (
      organization_id, group_id, athlete_id, status, starts_on
    )
    values
      (${organizationId}::uuid, ${groupAId}::uuid, ${siblingAId}::uuid, 'active', current_date),
      (${organizationId}::uuid, ${groupBId}::uuid, ${athleteBId}::uuid, 'active', current_date),
      (${organizationId}::uuid, ${groupAId}::uuid, ${secondSiblingAId}::uuid, 'active', current_date)
  `);
  await db.execute(sql`
    insert into zaltyko.families (id, organization_id)
    values
      (${familyAtBothSitesId}::uuid, ${organizationId}::uuid),
      (${familyWithoutTargetAnchorId}::uuid, ${organizationId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.guardians (id, organization_id, person_id)
    values
      (${guardianBId}::uuid, ${organizationId}::uuid, ${athleteBPersonId}::uuid),
      (${guardianUnanchoredId}::uuid, ${organizationId}::uuid, ${unanchoredPersonId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.family_guardians (
      organization_id, family_id, guardian_id, relationship, is_active
    )
    values
      (${organizationId}::uuid, ${familyAtBothSitesId}::uuid, ${guardianBId}::uuid, 'parent', true),
      (${organizationId}::uuid, ${familyWithoutTargetAnchorId}::uuid, ${guardianUnanchoredId}::uuid, 'parent', true)
  `);
  await db.execute(sql`
    insert into zaltyko.family_members (
      organization_id, family_id, athlete_id, relationship, starts_on
    )
    values
      (${organizationId}::uuid, ${familyAtBothSitesId}::uuid, ${athleteBId}::uuid, 'other', current_date),
      (${organizationId}::uuid, ${familyAtBothSitesId}::uuid, ${siblingAId}::uuid, 'other', current_date),
      (${organizationId}::uuid, ${familyWithoutTargetAnchorId}::uuid, ${unanchoredAthleteId}::uuid, 'other', current_date),
      (${organizationId}::uuid, ${familyWithoutTargetAnchorId}::uuid, ${secondSiblingAId}::uuid, 'other', current_date)
  `);

  return {
    organizationId,
    locationAId,
    locationBId,
    athleteBId,
    unanchoredAthleteId,
    owner: { userId: ownerUserId, memberId: ownerMemberId },
    managerA: { userId: managerAUserId, memberId: managerAMemberId },
    managerB: { userId: managerBUserId, memberId: managerBMemberId },
  };
}

describeDisposablePg("Owner athlete profile site isolation on disposable PostgreSQL", () => {
  it("anchors reads to the target athlete and keeps shared-person writes all-site scoped", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    const beforeRejectedReads = await snapshot(fixture.organizationId);

    const deniedSiblingSite = await getOwnerAthleteProfile({
      organizationId: fixture.organizationId,
      locationId: fixture.locationAId,
      athleteId: fixture.athleteBId,
      actor: fixture.managerA,
    }).then(
      () => null,
      (error: unknown) => error
    );
    expect(deniedSiblingSite).toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(String(deniedSiblingSite)).not.toContain("Target B");

    const targetAtOwnSite = await getOwnerAthleteProfile({
      organizationId: fixture.organizationId,
      locationId: fixture.locationBId,
      athleteId: fixture.athleteBId,
      actor: fixture.managerB,
    });
    expect(targetAtOwnSite).toEqual({
      athleteId: fixture.athleteBId,
      givenName: "Target B",
      familyName: "Synthetic",
    });

    const deniedUnanchoredTarget = await getOwnerAthleteProfile({
      organizationId: fixture.organizationId,
      locationId: fixture.locationAId,
      athleteId: fixture.unanchoredAthleteId,
      actor: fixture.managerA,
    }).then(
      () => null,
      (error: unknown) => error
    );
    expect(deniedUnanchoredTarget).toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(String(deniedUnanchoredTarget)).not.toContain("Unanchored target");
    expect(await snapshot(fixture.organizationId)).toEqual(beforeRejectedReads);

    const beforeWrongAllSiteContext = await snapshot(fixture.organizationId);
    const allSiteWrongContext = await getOwnerAthleteProfile({
      organizationId: fixture.organizationId,
      locationId: fixture.locationAId,
      athleteId: fixture.athleteBId,
      actor: fixture.owner,
    }).then(
      () => null,
      (error: unknown) => error
    );
    expect(allSiteWrongContext).toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeWrongAllSiteContext);
    await expect(
      getOwnerAthleteProfile({
        organizationId: fixture.organizationId,
        locationId: fixture.locationBId,
        athleteId: fixture.athleteBId,
        actor: fixture.owner,
      })
    ).resolves.toMatchObject({ athleteId: fixture.athleteBId, givenName: "Target B" });

    const beforeDeniedSharedWrite = await snapshot(fixture.organizationId);
    const deniedSharedPersonWrite = await updateOwnerAthleteProfile({
      organizationId: fixture.organizationId,
      locationId: fixture.locationBId,
      athleteId: fixture.athleteBId,
      actor: fixture.managerB,
      expectedGivenName: "Target B",
      expectedFamilyName: "Synthetic",
      givenName: "Target B changed",
      familyName: "Synthetic",
      idempotencyKey: `ci-profile-site-union-${randomUUID()}`,
    }).then(
      () => null,
      (error: unknown) => error
    );
    expect(deniedSharedPersonWrite).toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeDeniedSharedWrite);
  }, 45_000);
});
