import { randomUUID } from "node:crypto";
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

const snapshotTables = [
  "athletes",
  "attendance_records",
  "audit_log",
  "class_template_groups",
  "class_template_weekdays",
  "class_templates",
  "enrollments",
  "enrollment_status_history",
  "group_membership_history",
  "group_memberships",
  "groups",
  "outbox_events",
  "people",
  "session_staff",
  "sessions",
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
  const classTemplateId = randomUUID();
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
    values (
      ${classTemplateId}::uuid,
      ${organizationId}::uuid,
      ${locationIds[0]}::uuid,
      'CI enrollment class A',
      10,
      'active',
      current_date
    )
  `);
  const [dateRow] = (await db.execute(sql`select current_date::text as date`)).rows as Array<{
    date: string;
  }>;

  return {
    organizationId,
    classTemplateId,
    targetLocationId: locationIds[0]!,
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
});
