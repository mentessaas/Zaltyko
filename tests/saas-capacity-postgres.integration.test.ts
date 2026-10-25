import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getOrganizationUsage } from "@/modules/saas-billing/application/organization-usage";
import { createOperationalGroup } from "@/modules/groups/application/group-management-service";
import { createAthleteForGroup } from "@/modules/groups/application/group-membership-service";
import { createScheduledClass } from "@/modules/scheduling/application/class-management-service";
import { createEnrollment } from "@/modules/enrollments/application/enrollment-service";
import { recordAttendance } from "@/modules/attendance/application/attendance-service";
import { getOwnerSessionAttendance } from "@/modules/attendance/application/owner-session-attendance";
import { associateOwnerFamily } from "@/modules/families/application/owner-family-association";
import {
  bootstrapOrganization,
  type BootstrapOrganizationCommand,
} from "@/modules/organizations/application/bootstrap-organization";
import {
  getOwnerContractualConsentRequirement,
  recordOwnerSignupConsent,
} from "@/modules/organizations/application/owner-signup-consent";
import {
  getOwnerAthleteProfile,
  updateOwnerAthleteProfile,
} from "@/modules/athletes/application/owner-athlete-profile";

const snapshotTables = [
  "athletes",
  "attendance_records",
  "audit_log",
  "class_template_groups",
  "class_template_weekdays",
  "class_templates",
  "enrollments",
  "enrollment_status_history",
  "families",
  "family_guardians",
  "family_members",
  "family_payers",
  "group_membership_history",
  "group_memberships",
  "groups",
  "guardians",
  "member_location_scopes",
  "organization_members",
  "outbox_events",
  "people",
  "session_staff",
  "sessions",
  "staff_profiles",
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
    parsed.protocol !== "postgres:" &&
    parsed.protocol !== "postgresql:"
  ) {
    throw new Error("The disposable PostgreSQL target must use PostgreSQL");
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error("The integration suite refuses non-loopback PostgreSQL");
  }
  if (
    parsed.username !== "supabase_admin" ||
    parsed.port === null ||
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
  // The parent shell rejects STRIPE_SECRET_KEY before Vitest starts. The
  // shared setup mutates this name inside Vitest's worker, so it is not a
  // reliable external-credential signal here.
  if (activeForbidden.length > 0) {
    // Names are safe to log; secret values are deliberately never included.
    throw new Error(
      `The integration runner contains forbidden external credential variables: ${activeForbidden.join(", ")}`
    );
  }
}

async function snapshot(organizationId: string) {
  const rows = sql.join(
    snapshotTables.map((table) => sql`
      select ${table}::text as table_name,
        count(*)::int as count,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]')) as content_hash
      from ${sql.identifier("zaltyko")}.${sql.identifier(table)} r
      where r.organization_id = ${organizationId}::uuid
    `),
    sql` union all `
  );
  const result = await db.execute(
    sql`select * from (${rows}) snapshots order by table_name`
  );
  return result.rows;
}

async function snapshotOwnerConsent(userId: string) {
  const result = await db.execute(sql`
    select
      (select count(*)::int from zaltyko.owner_signup_consents
        where user_id = ${userId}::uuid) as consent_count,
      (select count(*)::int from zaltyko.owner_signup_consent_audits
        where user_id = ${userId}::uuid) as audit_count
  `);
  return result.rows[0];
}

async function snapshotAthleteProfileWrites(organizationId: string) {
  const rows = sql.join(
    ["people", "athletes", "audit_log", "outbox_events"].map((table) => sql`
      select ${table}::text as table_name,
        count(*)::int as count,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]')) as content_hash
      from ${sql.identifier("zaltyko")}.${sql.identifier(table)} r
      where r.organization_id = ${organizationId}::uuid
    `),
    sql` union all `
  );
  const result = await db.execute(
    sql`select * from (${rows}) snapshots order by table_name`
  );
  return result.rows;
}

async function snapshotBootstrap(organizationId: string, userId: string) {
  const result = await db.execute(sql`
    select * from (
      select 'organizations'::text as table_name, count(*)::int as row_count,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]')) as content_hash
      from zaltyko.organizations r where r.id = ${organizationId}::uuid
      union all
      select 'locations', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.locations r where r.organization_id = ${organizationId}::uuid
      union all
      select 'organization_members', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.organization_members r where r.organization_id = ${organizationId}::uuid
      union all
      select 'organization_sports', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.organization_sports r where r.organization_id = ${organizationId}::uuid
      union all
      select 'programs', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.programs r where r.organization_id = ${organizationId}::uuid
      union all
      select 'audit_log', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.audit_log r where r.organization_id = ${organizationId}::uuid
      union all
      select 'outbox_events', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.outbox_events r where r.organization_id = ${organizationId}::uuid
      union all
      select 'organization_bootstrap_commands', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.organization_bootstrap_commands r where r.user_id = ${userId}::uuid
    ) snapshots
    order by table_name
  `);
  return result.rows;
}

async function usage(organizationId: string) {
  return db.transaction((tx) => getOrganizationUsage(tx, organizationId));
}

function assertFreeUsage(
  value: Awaited<ReturnType<typeof usage>>,
  expected: [number, number, number],
  readOnly = false
) {
  expect(value.planCode).toBe("free");
  expect(value.readOnly).toBe(readOnly);
  expect(value.resources.map((item) => item.current)).toEqual(expected);
  expect(value.resources.map((item) => item.limit)).toEqual([30, 3, 10]);
}

async function oneCapacityWinner<T>(attempts: Array<() => Promise<T>>) {
  const results = await Promise.allSettled(attempts.map((attempt) => attempt()));
  const winners = results.flatMap((result, index) =>
    result.status === "fulfilled" ? [{ index, value: result.value }] : []
  );
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  expect(winners).toHaveLength(1);
  expect(failures).toHaveLength(1);
  expect(failures[0]?.reason).toMatchObject({
    code: "CAPACITY_FULL",
    status: 409,
  });
  return winners[0]!;
}

function futureLocalDateAndWeekday() {
  const candidate = new Date(Date.now() + 5 * 86_400_000);
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
  }).format(candidate);
  const weekday = new Date(date + "T12:00:00.000Z").getUTCDay() || 7;
  return { date, weekday };
}

async function seedFreeAcademy() {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const locationId = randomUUID();
  const groupIds = [randomUUID(), randomUUID()];
  const classIds = Array.from({ length: 9 }, () => randomUUID());
  const athleteRows = Array.from({ length: 29 }, () => ({
    personId: randomUUID(),
    athleteId: randomUUID(),
  }));

  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${"ci-" + userId + "@example.invalid"})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${"CI capacity " + organizationId})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name)
    values (
      ${locationId}::uuid,
      ${organizationId}::uuid,
      'ci-capacity',
      'CI synthetic location'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    )
    values (
      ${memberId}::uuid,
      ${organizationId}::uuid,
      ${userId}::uuid,
      'owner',
      'active',
      'all'
    )
  `);

  const peopleValues = sql.join(
    athleteRows.map((row, index) => sql`(
      ${row.personId}::uuid,
      ${organizationId}::uuid,
      ${"Synthetic " + (index + 1)},
      'Capacity CI'
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values ${peopleValues}
  `);

  const athleteValues = sql.join(
    athleteRows.map((row) => sql`(
      ${row.athleteId}::uuid,
      ${organizationId}::uuid,
      ${row.personId}::uuid
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id)
    values ${athleteValues}
  `);

  const groupValues = sql.join(
    groupIds.map((id, index) => sql`(
      ${id}::uuid,
      ${organizationId}::uuid,
      ${locationId}::uuid,
      ${"Synthetic group " + (index + 1)},
      30,
      'active'
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.groups (
      id, organization_id, location_id, name, capacity, status
    )
    values ${groupValues}
  `);

  const classValues = sql.join(
    classIds.map((id, index) => sql`(
      ${id}::uuid,
      ${organizationId}::uuid,
      ${locationId}::uuid,
      ${"Synthetic class " + (index + 1)},
      30,
      'active',
      current_date
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    )
    values ${classValues}
  `);

  return {
    organizationId,
    locationId,
    actor: { userId, memberId },
    groupIds,
    classIds,
    athleteRows,
  };
}

async function seedEnrollmentEligibilityAcademy() {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const locationIds = [randomUUID(), randomUUID()];
  const groupIds = [randomUUID(), randomUUID()];
  const classTemplateIds = [randomUUID(), randomUUID()];
  const athletes = [0, 1].map(() => ({
    personId: randomUUID(),
    athleteId: randomUUID(),
  }));

  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${"ci-enrollment-" + userId + "@example.invalid"})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${"CI enrollment " + organizationId})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name)
    values
      (${locationIds[0]}::uuid, ${organizationId}::uuid, 'ci-enroll-a', 'CI enrollment site A'),
      (${locationIds[1]}::uuid, ${organizationId}::uuid, 'ci-enroll-b', 'CI enrollment site B')
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    )
    values (
      ${memberId}::uuid,
      ${organizationId}::uuid,
      ${userId}::uuid,
      'owner',
      'active',
      'all'
    )
  `);

  const peopleValues = sql.join(
    athletes.map((athlete, index) => sql`(
      ${athlete.personId}::uuid,
      ${organizationId}::uuid,
      ${"Enrollment athlete " + (index + 1)},
      'Synthetic'
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values ${peopleValues}
  `);
  const athleteValues = sql.join(
    athletes.map((athlete) => sql`(
      ${athlete.athleteId}::uuid,
      ${organizationId}::uuid,
      ${athlete.personId}::uuid
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id)
    values ${athleteValues}
  `);
  await db.execute(sql`
    insert into zaltyko.groups (
      id, organization_id, location_id, name, capacity, status
    )
    values
      (${groupIds[0]}::uuid, ${organizationId}::uuid, ${locationIds[0]}::uuid, 'CI enrollment group A', 10, 'active'),
      (${groupIds[1]}::uuid, ${organizationId}::uuid, ${locationIds[1]}::uuid, 'CI enrollment group B', 10, 'active')
  `);
  await db.execute(sql`
    insert into zaltyko.group_memberships (
      organization_id, group_id, athlete_id, status, starts_on
    )
    values
      (${organizationId}::uuid, ${groupIds[0]}::uuid, ${athletes[0]!.athleteId}::uuid, 'active', current_date),
      (${organizationId}::uuid, ${groupIds[1]}::uuid, ${athletes[1]!.athleteId}::uuid, 'active', current_date)
  `);
  await db.execute(sql`
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    )
    values
      (${classTemplateIds[0]}::uuid, ${organizationId}::uuid, ${locationIds[0]}::uuid, 'CI enrollment class A', 10, 'active', current_date),
      (${classTemplateIds[1]}::uuid, ${organizationId}::uuid, ${locationIds[1]}::uuid, 'CI enrollment class B', 10, 'active', current_date)
  `);
  const [dateRow] = (await db.execute(sql`select current_date::text as date`)).rows as Array<{
    date: string;
  }>;

  return {
    organizationId,
    classTemplateId: classTemplateIds[0]!,
    otherSiteClassTemplateId: classTemplateIds[1]!,
    targetLocationId: locationIds[0]!,
    otherSiteLocationId: locationIds[1]!,
    targetAthleteId: athletes[0]!.athleteId,
    otherSiteOnlyAthleteId: athletes[1]!.athleteId,
    startsOn: dateRow!.date,
    actor: { userId, memberId },
  };
}

async function seedAttendanceFixture() {
  const academy = await seedEnrollmentEligibilityAcademy();
  const enrollment = await createEnrollment({
    organizationId: academy.organizationId,
    locationId: academy.targetLocationId,
    athleteId: academy.targetAthleteId,
    classTemplateId: academy.classTemplateId,
    status: "active",
    startsOn: academy.startsOn,
    source: "owner",
    idempotencyKey: "ci-attendance-enrollment-" + randomUUID(),
    actor: academy.actor,
  });
  const sessionId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.sessions (
      id, organization_id, location_id, class_template_id, status, starts_at, ends_at
    )
    values (
      ${sessionId}::uuid,
      ${academy.organizationId}::uuid,
      ${academy.targetLocationId}::uuid,
      ${academy.classTemplateId}::uuid,
      'scheduled',
      now() + interval '2 days',
      now() + interval '2 days 1 hour'
    )
  `);

  return {
    ...academy,
    enrollmentId: enrollment.id,
    sessionId,
  };
}

async function seedAttendanceCoach(
  fixture: Awaited<ReturnType<typeof seedAttendanceFixture>>,
  assigned: boolean
) {
  const userId = randomUUID();
  const personId = randomUUID();
  const memberId = randomUUID();
  const staffProfileId = randomUUID();
  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${"ci-coach-" + userId + "@example.invalid"})
  `);
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values (
      ${personId}::uuid,
      ${fixture.organizationId}::uuid,
      'Synthetic',
      ${assigned ? "Assigned coach" : "Unassigned coach"}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    )
    values (
      ${memberId}::uuid,
      ${fixture.organizationId}::uuid,
      ${userId}::uuid,
      'coach',
      'active',
      'all'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.staff_profiles (id, organization_id, person_id, member_id, is_active)
    values (
      ${staffProfileId}::uuid,
      ${fixture.organizationId}::uuid,
      ${personId}::uuid,
      ${memberId}::uuid,
      true
    )
  `);
  if (assigned) {
    await db.execute(sql`
      insert into zaltyko.session_staff (organization_id, session_id, staff_profile_id)
      values (
        ${fixture.organizationId}::uuid,
        ${fixture.sessionId}::uuid,
        ${staffProfileId}::uuid
      )
    `);
  }
  return { userId, memberId, staffProfileId };
}

async function seedFamilyAssociationFixture() {
  const academy = await seedEnrollmentEligibilityAcademy();
  await Promise.all([
    createEnrollment({
      organizationId: academy.organizationId,
      locationId: academy.targetLocationId,
      athleteId: academy.targetAthleteId,
      classTemplateId: academy.classTemplateId,
      status: "active",
      startsOn: academy.startsOn,
      source: "owner",
      idempotencyKey: "ci-family-enrollment-a-" + randomUUID(),
      actor: academy.actor,
    }),
    createEnrollment({
      organizationId: academy.organizationId,
      locationId: academy.otherSiteLocationId,
      athleteId: academy.otherSiteOnlyAthleteId,
      classTemplateId: academy.otherSiteClassTemplateId,
      status: "active",
      startsOn: academy.startsOn,
      source: "owner",
      idempotencyKey: "ci-family-enrollment-b-" + randomUUID(),
      actor: academy.actor,
    }),
  ]);
  return academy;
}

describe("Free capacity guards on disposable PostgreSQL", () => {
  it("serializes last-slot writes, replays winners once, and leaves no partial rows on denials", async () => {
    assertDisposableTarget();
    const fixture = await seedFreeAcademy();
    const organizationId = fixture.organizationId;
    assertFreeUsage(await usage(organizationId), [29, 2, 9]);

    const beforeRaces = await snapshot(organizationId);
    const athleteCommands = [0, 1].map((index) => ({
      organizationId,
      groupId: fixture.groupIds[0]!,
      givenName: "Concurrent " + index,
      familyName: "Synthetic athlete",
      idempotencyKey: "ci-athlete-" + randomUUID(),
      actor: fixture.actor,
    }));
    const athleteWinner = await oneCapacityWinner(
      athleteCommands.map((command) => () => createAthleteForGroup(command))
    );
    const afterAthleteRace = await snapshot(organizationId);
    expect(afterAthleteRace).not.toEqual(beforeRaces);
    assertFreeUsage(await usage(organizationId), [30, 2, 9]);
    await expect(
      createAthleteForGroup(athleteCommands[athleteWinner.index]!)
    ).resolves.toMatchObject({ id: athleteWinner.value.id });
    expect(await snapshot(organizationId)).toEqual(afterAthleteRace);

    const groupCommands = [0, 1].map((index) => ({
      organizationId,
      locationId: fixture.locationId,
      programId: null,
      name: "Concurrent group " + index,
      capacity: 30,
      idempotencyKey: "ci-group-" + randomUUID(),
      actor: fixture.actor,
    }));
    const beforeGroupRace = await snapshot(organizationId);
    const groupWinner = await oneCapacityWinner(
      groupCommands.map((command) => () => createOperationalGroup(command))
    );
    const afterGroupRace = await snapshot(organizationId);
    expect(afterGroupRace).not.toEqual(beforeGroupRace);
    assertFreeUsage(await usage(organizationId), [30, 3, 9]);
    await expect(
      createOperationalGroup(groupCommands[groupWinner.index]!)
    ).resolves.toMatchObject({ id: groupWinner.value.id });
    expect(await snapshot(organizationId)).toEqual(afterGroupRace);

    const { date, weekday } = futureLocalDateAndWeekday();
    const classCommands = [0, 1].map((index) => ({
      organizationId,
      locationId: fixture.locationId,
      programId: null,
      name: "Concurrent class " + index,
      capacity: 30,
      effectiveFrom: date,
      effectiveTo: date,
      schedule: [{
        isoWeekday: weekday,
        startsAtLocal: "08:00",
        endsAtLocal: "09:00",
      }],
      idempotencyKey: "ci-class-" + randomUUID(),
      actor: fixture.actor,
    }));
    const beforeClassRace = await snapshot(organizationId);
    const classWinner = await oneCapacityWinner(
      classCommands.map((command) => () => createScheduledClass(command))
    );
    const afterClassRace = await snapshot(organizationId);
    expect(afterClassRace).not.toEqual(beforeClassRace);
    assertFreeUsage(await usage(organizationId), [30, 3, 10]);
    expect(classWinner.value.sessionCount).toBe(1);
    await expect(
      createScheduledClass(classCommands[classWinner.index]!)
    ).resolves.toMatchObject({
      classTemplate: { id: classWinner.value.classTemplate.id },
      sessionCount: 1,
    });
    expect(await snapshot(organizationId)).toEqual(afterClassRace);

    const fullSnapshot = await snapshot(organizationId);
    const rejectedAthlete = {
      organizationId,
      groupId: fixture.groupIds[0]!,
      givenName: "Blocked",
      familyName: "Athlete thirty one",
      idempotencyKey: "ci-block-athlete-" + randomUUID(),
      actor: fixture.actor,
    };
    await expect(createAthleteForGroup(rejectedAthlete)).rejects.toMatchObject({
      code: "CAPACITY_FULL",
      status: 409,
    });
    expect(await snapshot(organizationId)).toEqual(fullSnapshot);

    const rejectedGroup = {
      organizationId,
      locationId: fixture.locationId,
      programId: null,
      name: "Blocked group four",
      capacity: 30,
      idempotencyKey: "ci-block-group-" + randomUUID(),
      actor: fixture.actor,
    };
    await expect(createOperationalGroup(rejectedGroup)).rejects.toMatchObject({
      code: "CAPACITY_FULL",
      status: 409,
    });
    expect(await snapshot(organizationId)).toEqual(fullSnapshot);

    const rejectedClass = {
      organizationId,
      locationId: fixture.locationId,
      programId: null,
      name: "Blocked class eleven",
      capacity: 30,
      effectiveFrom: date,
      effectiveTo: date,
      schedule: [{
        isoWeekday: weekday,
        startsAtLocal: "10:00",
        endsAtLocal: "11:00",
      }],
      idempotencyKey: "ci-block-class-" + randomUUID(),
      actor: fixture.actor,
    };
    await expect(createScheduledClass(rejectedClass)).rejects.toMatchObject({
      code: "CAPACITY_FULL",
      status: 409,
    });
    expect(await snapshot(organizationId)).toEqual(fullSnapshot);

    const excessPersonId = randomUUID();
    const excessAthleteId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values (
        ${excessPersonId}::uuid,
        ${organizationId}::uuid,
        'Synthetic excess',
        'Athlete'
      )
    `);
    await db.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id)
      values (
        ${excessAthleteId}::uuid,
        ${organizationId}::uuid,
        ${excessPersonId}::uuid
      )
    `);
    const excessSnapshot = await snapshot(organizationId);
    assertFreeUsage(await usage(organizationId), [31, 3, 10], true);

    for (const [label, attempt] of [
      ["athlete", () => createAthleteForGroup({
        ...rejectedAthlete,
        givenName: "Blocked over-capacity",
        idempotencyKey: "ci-over-cap-athlete-" + randomUUID(),
      })],
      ["group", () => createOperationalGroup({
        ...rejectedGroup,
        name: "Blocked over-capacity group",
        idempotencyKey: "ci-over-cap-group-" + randomUUID(),
      })],
      ["class", () => createScheduledClass({
        ...rejectedClass,
        name: "Blocked over-capacity class",
        idempotencyKey: "ci-over-cap-class-" + randomUUID(),
      })],
    ] as const) {
      await expect(attempt(), label).rejects.toMatchObject({
        code: "PLAN_OVER_CAPACITY",
        status: 409,
      });
      expect(await snapshot(organizationId)).toEqual(excessSnapshot);
    }
  }, 45_000);

  it("creates an enrollment only when the athlete has an open relationship at that site", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const validCommand = {
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      athleteId: fixture.targetAthleteId,
      classTemplateId: fixture.classTemplateId,
      status: "active" as const,
      startsOn: fixture.startsOn,
      source: "owner" as const,
      idempotencyKey: "ci-enrollment-valid-" + randomUUID(),
      actor: fixture.actor,
    };

    const beforeValidEnrollment = await snapshot(fixture.organizationId);
    const enrollment = await createEnrollment(validCommand);
    expect(enrollment).toMatchObject({
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      athleteId: fixture.targetAthleteId,
      classTemplateId: fixture.classTemplateId,
      status: "active",
    });
    const afterValidEnrollment = await snapshot(fixture.organizationId);
    expect(afterValidEnrollment).not.toEqual(beforeValidEnrollment);
    expect(await createEnrollment(validCommand)).toMatchObject({
      id: enrollment.id,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(afterValidEnrollment);

    const beforeRejectedEnrollment = await snapshot(fixture.organizationId);
    await expect(createEnrollment({
      ...validCommand,
      athleteId: fixture.otherSiteOnlyAthleteId,
      idempotencyKey: "ci-enrollment-wrong-site-" + randomUUID(),
    })).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeRejectedEnrollment);
  }, 45_000);

  it("records attendance once under concurrent replay and rolls back partial writes", async () => {
    assertDisposableTarget();
    const fixture = await seedAttendanceFixture();
    const idempotencyKey = "ci-attendance-replay-" + randomUUID();
    const command = {
      organizationId: fixture.organizationId,
      expectedLocationId: fixture.targetLocationId,
      sessionId: fixture.sessionId,
      enrollmentId: fixture.enrollmentId,
      status: "present" as const,
      idempotencyKey,
      actor: fixture.actor,
    };

    const beforeRecording = await snapshot(fixture.organizationId);
    const concurrentResults = await Promise.all([
      recordAttendance(command),
      recordAttendance(command),
    ]);
    expect(concurrentResults[0]?.id).toBe(concurrentResults[1]?.id);
    expect(concurrentResults[0]).toMatchObject({
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      sessionId: fixture.sessionId,
      enrollmentId: fixture.enrollmentId,
      athleteId: fixture.targetAthleteId,
      status: "present",
    });

    const afterRecording = await snapshot(fixture.organizationId);
    expect(afterRecording).not.toEqual(beforeRecording);
    expect(await recordAttendance(command)).toMatchObject({
      id: concurrentResults[0]!.id,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(afterRecording);

    const persisted = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.attendance_records
          where organization_id = ${fixture.organizationId}::uuid
            and session_id = ${fixture.sessionId}::uuid
            and enrollment_id = ${fixture.enrollmentId}::uuid) as attendance_count,
        (select count(*)::int from zaltyko.outbox_events
          where organization_id = ${fixture.organizationId}::uuid
            and event_name = 'attendance.recorded'
            and idempotency_key = ${idempotencyKey}) as outbox_count,
        (select count(*)::int from zaltyko.audit_log
          where organization_id = ${fixture.organizationId}::uuid
            and idempotency_key = ${idempotencyKey}) as audit_count
    `);
    expect(persisted.rows[0]).toEqual({
      attendance_count: 1,
      outbox_count: 1,
      audit_count: 1,
    });

    const assignedCoach = await seedAttendanceCoach(fixture, true);
    const unassignedCoach = await seedAttendanceCoach(fixture, false);
    const beforeRosterRead = await snapshot(fixture.organizationId);
    await expect(getOwnerSessionAttendance({
      userId: fixture.actor.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      sessionId: fixture.sessionId,
    })).resolves.toEqual([
      {
        enrollmentId: fixture.enrollmentId,
        athleteName: "Enrollment athlete 1 Synthetic",
        attendanceStatus: "present",
      },
    ]);
    expect(await snapshot(fixture.organizationId)).toEqual(beforeRosterRead);

    const beforeCoachRead = await snapshot(fixture.organizationId);
    await expect(getOwnerSessionAttendance({
      userId: assignedCoach.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      sessionId: fixture.sessionId,
    })).resolves.toEqual([
      {
        enrollmentId: fixture.enrollmentId,
        athleteName: "Enrollment athlete 1 Synthetic",
        attendanceStatus: "present",
      },
    ]);
    expect(await snapshot(fixture.organizationId)).toEqual(beforeCoachRead);

    const beforeDeniedCoachRead = await snapshot(fixture.organizationId);
    await expect(getOwnerSessionAttendance({
      userId: unassignedCoach.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      sessionId: fixture.sessionId,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeDeniedCoachRead);

    const rollbackKey = "ci-attendance-rollback-" + randomUUID();
    await db.execute(sql`
      insert into zaltyko.audit_log (
        organization_id, location_id, actor_user_id, action, target_type, idempotency_key
      )
      values (
        ${fixture.organizationId}::uuid,
        ${fixture.targetLocationId}::uuid,
        ${fixture.actor.userId}::uuid,
        'ci.conflict.seed',
        'attendance',
        ${rollbackKey}
      )
    `);
    const beforeRollback = await snapshot(fixture.organizationId);
    let rollbackError: unknown;
    try {
      await recordAttendance({ ...command, idempotencyKey: rollbackKey });
    } catch (error) {
      rollbackError = error;
    }
    expect(rollbackError).toBeInstanceOf(Error);
    expect((rollbackError as Error & { cause?: unknown }).cause).toMatchObject({
      code: "23505",
      constraint: "audit_log_idempotency_uq",
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeRollback);
  }, 45_000);

  it("associates families atomically, replays once, and rejects a different site without partial rows", async () => {
    assertDisposableTarget();
    const fixture = await seedFamilyAssociationFixture();
    const firstKey = "ci-family-association-" + randomUUID();
    const command = {
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      athleteIds: [fixture.targetAthleteId],
      effectiveFrom: fixture.startsOn,
      payer: {
        givenName: "Synthetic",
        familyName: "Guardian A",
        relationship: "parent" as const,
      },
      idempotencyKey: firstKey,
      actor: fixture.actor,
    };

    const beforeAssociation = await snapshot(fixture.organizationId);
    const concurrentResults = await Promise.all([
      associateOwnerFamily(command),
      associateOwnerFamily(command),
    ]);
    expect(concurrentResults[0]?.family.id).toBe(concurrentResults[1]?.family.id);
    expect(concurrentResults[0]?.familyPayerId).toBe(concurrentResults[1]?.familyPayerId);
    expect(concurrentResults[0]?.guardianId).toBe(concurrentResults[1]?.guardianId);
    expect(concurrentResults.map((result) => result.replayed).sort()).toEqual([false, true]);

    const afterAssociation = await snapshot(fixture.organizationId);
    expect(afterAssociation).not.toEqual(beforeAssociation);
    await expect(associateOwnerFamily(command)).resolves.toMatchObject({
      family: { id: concurrentResults[0]!.family.id },
      familyPayerId: concurrentResults[0]!.familyPayerId,
      guardianId: concurrentResults[0]!.guardianId,
      replayed: true,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(afterAssociation);

    const associationRows = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.families
          where organization_id = ${fixture.organizationId}::uuid) as family_count,
        (select count(*)::int from zaltyko.family_members
          where organization_id = ${fixture.organizationId}::uuid
            and athlete_id = ${fixture.targetAthleteId}::uuid) as member_count,
        (select count(*)::int from zaltyko.family_guardians
          where organization_id = ${fixture.organizationId}::uuid) as family_guardian_count,
        (select count(*)::int from zaltyko.guardians
          where organization_id = ${fixture.organizationId}::uuid) as guardian_count,
        (select count(*)::int from zaltyko.family_payers
          where organization_id = ${fixture.organizationId}::uuid) as payer_count,
        (select count(*)::int from zaltyko.outbox_events
          where organization_id = ${fixture.organizationId}::uuid
            and event_name = 'family.owner_associated'
            and idempotency_key = ${firstKey}) as outbox_count,
        (select count(*)::int from zaltyko.audit_log
          where organization_id = ${fixture.organizationId}::uuid
            and idempotency_key = ${firstKey}) as audit_count
    `);
    expect(associationRows.rows[0]).toEqual({
      family_count: 1,
      member_count: 1,
      family_guardian_count: 1,
      guardian_count: 1,
      payer_count: 1,
      outbox_count: 1,
      audit_count: 1,
    });

    const beforeWrongSite = await snapshot(fixture.organizationId);
    await expect(associateOwnerFamily({
      ...command,
      athleteIds: [fixture.otherSiteOnlyAthleteId],
      idempotencyKey: "ci-family-wrong-site-" + randomUUID(),
    })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeWrongSite);

    const rollbackKey = "ci-family-rollback-" + randomUUID();
    await db.execute(sql`
      insert into zaltyko.audit_log (
        organization_id, location_id, actor_user_id, action, target_type, idempotency_key
      )
      values (
        ${fixture.organizationId}::uuid,
        ${fixture.otherSiteLocationId}::uuid,
        ${fixture.actor.userId}::uuid,
        'ci.conflict.seed',
        'family',
        ${rollbackKey}
      )
    `);
    const beforeRollback = await snapshot(fixture.organizationId);
    let rollbackError: unknown;
    try {
      await associateOwnerFamily({
        ...command,
        locationId: fixture.otherSiteLocationId,
        athleteIds: [fixture.otherSiteOnlyAthleteId],
        payer: {
          givenName: "Synthetic",
          familyName: "Guardian B",
          relationship: "parent",
        },
        idempotencyKey: rollbackKey,
      });
    } catch (error) {
      rollbackError = error;
    }
    expect(rollbackError).toBeInstanceOf(Error);
    expect((rollbackError as Error & { cause?: unknown }).cause).toMatchObject({
      code: "23505",
      constraint: "audit_log_idempotency_uq",
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeRollback);
  }, 45_000);

  it("bootstraps an Owner academy once from the seeded identity catalog", async () => {
    assertDisposableTarget();
    const userId = randomUUID();
    await db.execute(sql`
      insert into auth.users (id, email)
      values (${userId}::uuid, ${"ci-bootstrap-" + userId + "@example.invalid"})
    `);

    const command = {
      userId,
      organizationName: "CI Owner bootstrap " + userId,
      legalName: "CI Owner Academy",
      countryCode: "ES",
      locationName: "Sede principal",
      idempotencyKey: "ci-owner-bootstrap-" + randomUUID(),
      primaryDiscipline: "artistic",
      additionalDisciplines: ["rhythmic"],
      complementaryActivities: ["dance"],
    } satisfies BootstrapOrganizationCommand;

    const [created, concurrentReplay] = await Promise.all([
      bootstrapOrganization(command),
      bootstrapOrganization(command),
    ]);
    expect(concurrentReplay).toEqual(created);

    const academy = await db.execute(sql`
      select name, legal_name, country_code, default_currency, default_timezone, status
      from zaltyko.organizations
      where id = ${created.organizationId}::uuid
    `);
    expect(academy.rows).toEqual([{
      name: command.organizationName,
      legal_name: command.legalName,
      country_code: "ES",
      default_currency: "EUR",
      default_timezone: "Europe/Madrid",
      status: "trial",
    }]);

    const profileRows = await db.execute(sql`
      select profile.discipline_key, sport.role, profile.status,
        profile.configuration::text as configuration
      from zaltyko.organization_sports sport
      join zaltyko.sport_profiles profile
        on profile.country_code = sport.country_code
       and profile.id = sport.sport_profile_id
      where sport.organization_id = ${created.organizationId}::uuid
      order by profile.discipline_key
    `);
    expect(profileRows.rows).toEqual([
      {
        discipline_key: "artistic",
        role: "primary",
        status: "identity_only",
        configuration: "{}",
      },
      {
        discipline_key: "rhythmic",
        role: "additional",
        status: "identity_only",
        configuration: "{}",
      },
    ]);

    const createdSnapshot = await snapshotBootstrap(created.organizationId, userId);
    expect(createdSnapshot.map((row) => [row.table_name, row.row_count])).toEqual([
      ["audit_log", 1],
      ["locations", 1],
      ["organization_bootstrap_commands", 1],
      ["organization_members", 1],
      ["organization_sports", 2],
      ["organizations", 1],
      ["outbox_events", 1],
      ["programs", 3],
    ]);

    await expect(bootstrapOrganization({
      ...command,
      organizationName: command.organizationName + " changed",
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(await snapshotBootstrap(created.organizationId, userId)).toEqual(createdSnapshot);

    await expect(bootstrapOrganization({
      ...command,
      idempotencyKey: "ci-owner-bootstrap-second-" + randomUUID(),
    })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION", status: 409 });
    expect(await snapshotBootstrap(created.organizationId, userId)).toEqual(createdSnapshot);
  }, 45_000);

  it("persists Owner signup consent once and fails closed for an existing identity", async () => {
    assertDisposableTarget();
    const policyVersion = "v7-2026-10-24";
    await db.execute(sql`
      insert into zaltyko.owner_signup_consent_policy (singleton, policy_version, rollout_at)
      values (true, ${policyVersion}, now() - interval '1 day')
    `);

    const freshUserId = randomUUID();
    await db.execute(sql`
      insert into auth.users (id, email)
      values (${freshUserId}::uuid, ${"ci-consent-" + freshUserId + "@example.invalid"})
    `);
    const freshUser = {
      id: freshUserId,
      created_at: new Date().toISOString(),
      user_metadata: {
        legal_consent_version: policyVersion,
        legal_consent_proof: "signup:register-form-v1",
      },
    } as User;

    const beforeGrant = await snapshotOwnerConsent(freshUserId);
    const concurrentResults = await Promise.all([
      recordOwnerSignupConsent(freshUser, { requestKey: "ci-owner-consent-request" }),
      recordOwnerSignupConsent(freshUser, { requestKey: "ci-owner-consent-request" }),
    ]);
    expect(concurrentResults.sort()).toEqual(["already_active", "recorded"]);
    const afterGrant = await snapshotOwnerConsent(freshUserId);
    expect(afterGrant).toEqual({ consent_count: 1, audit_count: 1 });
    expect(afterGrant).not.toEqual(beforeGrant);
    await expect(
      getOwnerContractualConsentRequirement(freshUser)
    ).resolves.toEqual({
      policyVersion,
      requiresAcceptance: false,
      reason: "already_current",
    });
    expect(await snapshotOwnerConsent(freshUserId)).toEqual(afterGrant);

    const existingUserId = randomUUID();
    await db.execute(sql`
      insert into auth.users (id, email)
      values (${existingUserId}::uuid, ${"ci-consent-existing-" + existingUserId + "@example.invalid"})
    `);
    const existingUser = {
      id: existingUserId,
      created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      user_metadata: {},
    } as User;
    const beforeRejectedGrant = await snapshotOwnerConsent(existingUserId);
    await expect(recordOwnerSignupConsent(existingUser, {
      requestKey: "ci-owner-consent-existing",
    })).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(await snapshotOwnerConsent(existingUserId)).toEqual(beforeRejectedGrant);

    await expect(recordOwnerSignupConsent(existingUser, {
      requestKey: "ci-owner-consent-explicit",
      contractualAcceptance: { accepted: true, policyVersion },
    })).resolves.toBe("recorded");
    expect(await snapshotOwnerConsent(existingUserId)).toEqual({
      consent_count: 1,
      audit_count: 1,
    });
  }, 45_000);
});

describe("canonical athlete profiles on disposable PostgreSQL", () => {
  it("authorizes every linked site, serializes expected-name edits, and replays current values", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const otherSiteGroupId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.groups (
        id, organization_id, location_id, name, capacity, status
      )
      values (
        ${otherSiteGroupId}::uuid,
        ${fixture.organizationId}::uuid,
        ${fixture.otherSiteLocationId}::uuid,
        'CI profile second-site group',
        10,
        'active'
      )
    `);
    await db.execute(sql`
      insert into zaltyko.group_memberships (
        organization_id, group_id, athlete_id, status, starts_on
      )
      values (
        ${fixture.organizationId}::uuid,
        ${otherSiteGroupId}::uuid,
        ${fixture.targetAthleteId}::uuid,
        'active',
        current_date
      )
    `);

    const scopedUserId = randomUUID();
    const scopedMemberId = randomUUID();
    await db.execute(sql`
      insert into auth.users (id, email)
      values (${scopedUserId}::uuid, ${"ci-profile-scoped-" + scopedUserId + "@example.invalid"})
    `);
    await db.execute(sql`
      insert into zaltyko.organization_members (
        id, organization_id, user_id, role, status, location_scope_mode
      )
      values (
        ${scopedMemberId}::uuid,
        ${fixture.organizationId}::uuid,
        ${scopedUserId}::uuid,
        'manager',
        'active',
        'selected'
      )
    `);
    await db.execute(sql`
      insert into zaltyko.member_location_scopes (
        organization_id, member_id, location_id
      )
      values (
        ${fixture.organizationId}::uuid,
        ${scopedMemberId}::uuid,
        ${fixture.targetLocationId}::uuid
      )
    `);

    const profileScope = {
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      athleteId: fixture.targetAthleteId,
      actor: fixture.actor,
    };
    const initial = await getOwnerAthleteProfile(profileScope);
    expect(initial).toEqual({
      athleteId: fixture.targetAthleteId,
      givenName: "Enrollment athlete 1",
      familyName: "Synthetic",
    });

    const firstCommand = {
      ...profileScope,
      expectedGivenName: initial.givenName,
      expectedFamilyName: initial.familyName,
      givenName: "Profile First Edit",
      familyName: "Synthetic",
      idempotencyKey: "ci-profile-first-" + randomUUID(),
    };
    const firstResult = await updateOwnerAthleteProfile(firstCommand);
    expect(firstResult).toMatchObject({
      givenName: "Profile First Edit",
      familyName: "Synthetic",
      replayed: false,
    });

    const secondCommand = {
      ...profileScope,
      expectedGivenName: firstResult.givenName,
      expectedFamilyName: firstResult.familyName,
      givenName: "Profile Current Edit",
      familyName: "Synthetic",
      idempotencyKey: "ci-profile-second-" + randomUUID(),
    };
    await updateOwnerAthleteProfile(secondCommand);
    const beforeExactReplay = await snapshotAthleteProfileWrites(
      fixture.organizationId
    );
    await expect(updateOwnerAthleteProfile(firstCommand)).resolves.toEqual({
      athleteId: fixture.targetAthleteId,
      givenName: "Profile Current Edit",
      familyName: "Synthetic",
      replayed: true,
    });
    expect(await snapshotAthleteProfileWrites(fixture.organizationId)).toEqual(
      beforeExactReplay
    );

    const concurrentCommands = ["Concurrent Edit A", "Concurrent Edit B"].map(
      (givenName) => ({
        ...profileScope,
        expectedGivenName: "Profile Current Edit",
        expectedFamilyName: "Synthetic",
        givenName,
        familyName: "Synthetic",
        idempotencyKey: "ci-profile-race-" + randomUUID(),
      })
    );
    const beforeConcurrentRace = await snapshotAthleteProfileWrites(
      fixture.organizationId
    );
    const concurrentResults = await Promise.allSettled(
      concurrentCommands.map((command) => updateOwnerAthleteProfile(command))
    );
    const winners = concurrentResults.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof updateOwnerAthleteProfile>>> =>
        result.status === "fulfilled"
    );
    const conflicts = concurrentResults.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(winners).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
    });
    const afterConcurrentRace = await snapshotAthleteProfileWrites(
      fixture.organizationId
    );
    expect(afterConcurrentRace).not.toEqual(beforeConcurrentRace);
    const profileEventCount = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and event_name = 'athlete.profile_updated'
        and aggregate_id = ${fixture.targetAthleteId}::uuid
    `);
    expect(profileEventCount.rows[0]?.count).toBe(3);

    const current = await getOwnerAthleteProfile(profileScope);
    expect(["Concurrent Edit A", "Concurrent Edit B"]).toContain(current.givenName);
    const beforeDeniedWrite = await snapshotAthleteProfileWrites(fixture.organizationId);
    await expect(
      updateOwnerAthleteProfile({
        ...profileScope,
        actor: { userId: scopedUserId, memberId: scopedMemberId },
        expectedGivenName: current.givenName,
        expectedFamilyName: current.familyName,
        givenName: "Unauthorized Cross-Site Edit",
        familyName: current.familyName,
        idempotencyKey: "ci-profile-cross-site-" + randomUUID(),
      })
    ).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });
    expect(await snapshotAthleteProfileWrites(fixture.organizationId)).toEqual(
      beforeDeniedWrite
    );
  }, 45_000);

  it("rolls back the profile, athlete timestamp, outbox and audit when the receipt insert conflicts", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const profileScope = {
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      athleteId: fixture.targetAthleteId,
      actor: fixture.actor,
    };
    const original = await getOwnerAthleteProfile(profileScope);
    const idempotencyKey = "ci-profile-audit-conflict-" + randomUUID();
    await db.execute(sql`
      insert into zaltyko.audit_log (
        organization_id,
        location_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        idempotency_key,
        before,
        after,
        metadata
      )
      values (
        ${fixture.organizationId}::uuid,
        ${fixture.targetLocationId}::uuid,
        ${fixture.actor.userId}::uuid,
        'qa.profile_receipt_conflict',
        'athlete',
        ${fixture.targetAthleteId}::uuid,
        ${idempotencyKey},
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb
      )
    `);
    const before = await snapshotAthleteProfileWrites(fixture.organizationId);

    await expect(
      updateOwnerAthleteProfile({
        ...profileScope,
        expectedGivenName: original.givenName,
        expectedFamilyName: original.familyName,
        givenName: "This Update Must Roll Back",
        familyName: original.familyName,
        idempotencyKey,
      })
    ).rejects.toBeDefined();

    expect(await snapshotAthleteProfileWrites(fixture.organizationId)).toEqual(
      before
    );
  }, 45_000);
});
