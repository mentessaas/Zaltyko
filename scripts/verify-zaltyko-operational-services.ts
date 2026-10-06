import assert from "node:assert/strict";

import { Pool } from "pg";

import { recordAttendance } from "@/modules/attendance/application/attendance-service";
import {
  createEnrollment,
  transferEnrollment,
  transitionEnrollment,
} from "@/modules/enrollments/application/enrollment-service";
import { materializeSessions } from "@/modules/scheduling/application/session-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");

const pool = new Pool({ connectionString: databaseUrl, max: 4 });

const ID = {
  orgA: "10000000-0000-4000-8000-000000000010",
  orgB: "20000000-0000-4000-8000-000000000010",
  locationA: "10000000-0000-4000-8000-000000000020",
  locationA2: "10000000-0000-4000-8000-000000000021",
  locationB: "20000000-0000-4000-8000-000000000020",
  ownerUser: "10000000-0000-4000-8000-000000000001",
  ownerMember: "10000000-0000-4000-8000-000000000030",
  managerUser: "10000000-0000-4000-8000-000000000002",
  managerMember: "10000000-0000-4000-8000-000000000031",
  coachUser: "10000000-0000-4000-8000-000000000003",
  coachMember: "10000000-0000-4000-8000-000000000032",
  otherUser: "20000000-0000-4000-8000-000000000001",
  otherMember: "20000000-0000-4000-8000-000000000030",
  facilityA: "10000000-0000-4000-8000-000000000040",
  facilityA2: "10000000-0000-4000-8000-000000000041",
  spaceA: "10000000-0000-4000-8000-000000000050",
  spaceLimited: "10000000-0000-4000-8000-000000000051",
  spaceA2: "10000000-0000-4000-8000-000000000052",
  program: "10000000-0000-4000-8000-000000000080",
  templateMain: "10000000-0000-4000-8000-000000000100",
  templateLimited: "10000000-0000-4000-8000-000000000101",
  templateTarget: "10000000-0000-4000-8000-000000000102",
  coachPerson: "10000000-0000-4000-8000-000000000065",
  coachProfile: "10000000-0000-4000-8000-000000000075",
  athlete1: "10000000-0000-4000-8000-000000000071",
  athlete2: "10000000-0000-4000-8000-000000000072",
  athlete3: "10000000-0000-4000-8000-000000000073",
  athlete4: "10000000-0000-4000-8000-000000000074",
} as const;

const owner = { userId: ID.ownerUser, memberId: ID.ownerMember };
const manager = { userId: ID.managerUser, memberId: ID.managerMember };
const coach = { userId: ID.coachUser, memberId: ID.coachMember };
const outsider = { userId: ID.otherUser, memberId: ID.otherMember };

async function seed(): Promise<void> {
  await pool.query(`
    insert into auth.users (id) values
      ('${ID.ownerUser}'), ('${ID.managerUser}'), ('${ID.coachUser}'), ('${ID.otherUser}');

    insert into zaltyko.organizations (id, name, status) values
      ('${ID.orgA}', 'Academia Sintética A', 'active'),
      ('${ID.orgB}', 'Academia Sintética B', 'active');

    insert into zaltyko.locations (id, organization_id, code, name) values
      ('${ID.locationA}', '${ID.orgA}', 'centro', 'Centro'),
      ('${ID.locationA2}', '${ID.orgA}', 'norte', 'Norte'),
      ('${ID.locationB}', '${ID.orgB}', 'sur', 'Sur');

    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values
      ('${ID.ownerMember}', '${ID.orgA}', '${ID.ownerUser}', 'owner', 'active', 'all'),
      ('${ID.managerMember}', '${ID.orgA}', '${ID.managerUser}', 'manager', 'active', 'selected'),
      ('${ID.coachMember}', '${ID.orgA}', '${ID.coachUser}', 'coach', 'active', 'selected'),
      ('${ID.otherMember}', '${ID.orgB}', '${ID.otherUser}', 'owner', 'active', 'all');

    insert into zaltyko.member_location_scopes (organization_id, member_id, location_id) values
      ('${ID.orgA}', '${ID.managerMember}', '${ID.locationA}'),
      ('${ID.orgA}', '${ID.coachMember}', '${ID.locationA}');

    insert into zaltyko.facilities (id, organization_id, location_id, name) values
      ('${ID.facilityA}', '${ID.orgA}', '${ID.locationA}', 'Pabellón Centro'),
      ('${ID.facilityA2}', '${ID.orgA}', '${ID.locationA2}', 'Pabellón Norte');

    insert into zaltyko.spaces (
      id, organization_id, location_id, facility_id, name, capacity
    ) values
      ('${ID.spaceA}', '${ID.orgA}', '${ID.locationA}', '${ID.facilityA}', 'Tapiz', 4),
      ('${ID.spaceLimited}', '${ID.orgA}', '${ID.locationA}', '${ID.facilityA}', 'Sala pequeña', 1),
      ('${ID.spaceA2}', '${ID.orgA}', '${ID.locationA2}', '${ID.facilityA2}', 'Tapiz norte', 4);

    insert into zaltyko.people (id, organization_id, given_name, family_name) values
      ('10000000-0000-4000-8000-000000000061', '${ID.orgA}', 'Atleta', 'Uno'),
      ('10000000-0000-4000-8000-000000000062', '${ID.orgA}', 'Atleta', 'Dos'),
      ('10000000-0000-4000-8000-000000000063', '${ID.orgA}', 'Atleta', 'Tres'),
      ('10000000-0000-4000-8000-000000000064', '${ID.orgA}', 'Atleta', 'Cuatro'),
      ('${ID.coachPerson}', '${ID.orgA}', 'Coach', 'Sintético');

    insert into zaltyko.athletes (id, organization_id, person_id) values
      ('${ID.athlete1}', '${ID.orgA}', '10000000-0000-4000-8000-000000000061'),
      ('${ID.athlete2}', '${ID.orgA}', '10000000-0000-4000-8000-000000000062'),
      ('${ID.athlete3}', '${ID.orgA}', '10000000-0000-4000-8000-000000000063'),
      ('${ID.athlete4}', '${ID.orgA}', '10000000-0000-4000-8000-000000000064');

    insert into zaltyko.staff_profiles (
      id, organization_id, person_id, member_id, is_active
    ) values (
      '${ID.coachProfile}', '${ID.orgA}', '${ID.coachPerson}', '${ID.coachMember}', true
    );

    insert into zaltyko.programs (id, organization_id, name, discipline, status) values
      ('${ID.program}', '${ID.orgA}', 'Base artística', 'artistica', 'active');

    insert into zaltyko.class_templates (
      id, organization_id, location_id, program_id, default_space_id,
      name, capacity, status, effective_from
    ) values
      ('${ID.templateMain}', '${ID.orgA}', '${ID.locationA}', '${ID.program}', '${ID.spaceA}', 'Base lunes', 4, 'active', '2026-09-01'),
      ('${ID.templateLimited}', '${ID.orgA}', '${ID.locationA}', '${ID.program}', '${ID.spaceLimited}', 'Última plaza', 1, 'active', '2026-09-01'),
      ('${ID.templateTarget}', '${ID.orgA}', '${ID.locationA2}', '${ID.program}', '${ID.spaceA2}', 'Base norte', 4, 'active', '2026-09-01');

    insert into zaltyko.class_template_weekdays (
      organization_id, class_template_id, iso_weekday, starts_at_local, ends_at_local
    ) values
      ('${ID.orgA}', '${ID.templateMain}', 1, '17:00', '18:30'),
      ('${ID.orgA}', '${ID.templateTarget}', 3, '18:00', '19:30');
  `);
}

async function expectOperationalError(
  action: () => Promise<unknown>,
  code: OperationalError["code"]
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert(error instanceof OperationalError);
    assert.equal(error.code, code);
    return true;
  });
}

async function count(table: string, where = "true"): Promise<number> {
  const result = await pool.query(
    `select count(*)::int as count from ${table} where ${where}`
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function main(): Promise<void> {
  await seed();

  const enrollment1 = await createEnrollment({
    organizationId: ID.orgA,
    locationId: ID.locationA,
    athleteId: ID.athlete1,
    classTemplateId: ID.templateMain,
    status: "active",
    startsOn: "2026-10-01",
    source: "owner",
    idempotencyKey: "enroll-athlete-1-main",
    actor: owner,
  });
  const enrollment1Retry = await createEnrollment({
    organizationId: ID.orgA,
    locationId: ID.locationA,
    athleteId: ID.athlete1,
    classTemplateId: ID.templateMain,
    status: "active",
    startsOn: "2026-10-01",
    source: "owner",
    idempotencyKey: "enroll-athlete-1-main",
    actor: owner,
  });
  assert.equal(enrollment1Retry.id, enrollment1.id);
  assert.equal(
    await count(
      "zaltyko.enrollment_status_history",
      "idempotency_key = 'enroll-athlete-1-main'"
    ),
    1
  );

  const concurrent = await Promise.allSettled(
    [ID.athlete2, ID.athlete3].map((athleteId, index) =>
      createEnrollment({
        organizationId: ID.orgA,
        locationId: ID.locationA,
        athleteId,
        classTemplateId: ID.templateLimited,
        status: "active",
        startsOn: "2026-10-01",
        source: "owner",
        idempotencyKey: `limited-seat-${index + 1}`,
        actor: owner,
      })
    )
  );
  assert.equal(
    concurrent.filter((result) => result.status === "fulfilled").length,
    1
  );
  const rejected = concurrent.find((result) => result.status === "rejected");
  assert(rejected?.status === "rejected");
  assert(rejected.reason instanceof OperationalError);
  assert.equal(rejected.reason.code, "CAPACITY_FULL");

  await expectOperationalError(
    () =>
      transferEnrollment({
        organizationId: ID.orgA,
        enrollmentId: enrollment1.id,
        expectedVersion: 1,
        targetLocationId: ID.locationA2,
        targetClassTemplateId: ID.templateTarget,
        startsOn: "2026-10-15",
        idempotencyKey: "manager-forbidden-transfer",
        actor: manager,
      }),
    "LOCATION_SCOPE_DENIED"
  );
  assert.equal(
    await count(
      "zaltyko.outbox_events",
      "idempotency_key = 'manager-forbidden-transfer'"
    ),
    0
  );

  const paused = await transitionEnrollment({
    organizationId: ID.orgA,
    enrollmentId: enrollment1.id,
    expectedVersion: 1,
    toStatus: "paused",
    effectiveOn: "2026-10-03",
    reasonCode: "family_pause",
    idempotencyKey: "pause-enrollment-1",
    actor: owner,
  });
  assert.equal(paused.status, "paused");
  assert.equal(paused.version, 2);
  assert.equal(
    await count(
      "zaltyko.enrollment_pauses",
      `enrollment_id = '${enrollment1.id}' and ends_on is null`
    ),
    1
  );
  const pausedRetry = await transitionEnrollment({
    organizationId: ID.orgA,
    enrollmentId: enrollment1.id,
    expectedVersion: 1,
    toStatus: "paused",
    effectiveOn: "2026-10-10",
    reasonCode: "family_pause",
    idempotencyKey: "pause-enrollment-1",
    actor: owner,
  });
  assert.equal(pausedRetry.version, 2);

  const futureDate = new Date(Date.now() + 3 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await expectOperationalError(
    () =>
      transitionEnrollment({
        organizationId: ID.orgA,
        enrollmentId: enrollment1.id,
        expectedVersion: 2,
        toStatus: "active",
        effectiveOn: futureDate,
        idempotencyKey: "future-reactivation",
        actor: owner,
      }),
    "INVALID_DATE_RANGE"
  );
  assert.equal(
    await count(
      "zaltyko.outbox_events",
      `idempotency_key = 'future-reactivation'`
    ),
    0
  );

  await expectOperationalError(
    () =>
      transitionEnrollment({
        organizationId: ID.orgA,
        enrollmentId: enrollment1.id,
        expectedVersion: 1,
        toStatus: "active",
        effectiveOn: "2026-10-04",
        idempotencyKey: "stale-reactivation",
        actor: owner,
      }),
    "VERSION_CONFLICT"
  );

  const transferred = await transferEnrollment({
    organizationId: ID.orgA,
    enrollmentId: enrollment1.id,
    expectedVersion: 2,
    targetLocationId: ID.locationA2,
    targetClassTemplateId: ID.templateTarget,
    startsOn: "2026-10-05",
    idempotencyKey: "transfer-enrollment-1",
    actor: owner,
  });
  assert.equal(transferred.source.status, "completed");
  assert.equal(transferred.source.version, 3);
  assert.equal(transferred.target.status, "paused");
  assert.equal(
    await count(
      "zaltyko.enrollment_pauses",
      `enrollment_id = '${enrollment1.id}' and ends_on = '2026-10-05'`
    ),
    1
  );
  assert.equal(
    await count(
      "zaltyko.enrollment_pauses",
      `enrollment_id = '${transferred.target.id}' and ends_on is null`
    ),
    1
  );
  await assert.rejects(
    pool.query(
      `insert into zaltyko.enrollment_pauses (
        organization_id,
        enrollment_id,
        starts_on,
        reason_code
      ) values ($1, $2, $3, 'duplicate_open_pause')`,
      [ID.orgA, transferred.target.id, "2026-10-05"]
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
  );
  const transferRetry = await transferEnrollment({
    organizationId: ID.orgA,
    enrollmentId: enrollment1.id,
    expectedVersion: 2,
    targetLocationId: ID.locationA2,
    targetClassTemplateId: ID.templateTarget,
    startsOn: "2026-10-05",
    idempotencyKey: "transfer-enrollment-1",
    actor: owner,
  });
  assert.equal(transferRetry.target.id, transferred.target.id);

  const attendanceEnrollment = await createEnrollment({
    organizationId: ID.orgA,
    locationId: ID.locationA,
    athleteId: ID.athlete4,
    classTemplateId: ID.templateMain,
    status: "active",
    startsOn: "2026-10-01",
    source: "owner",
    idempotencyKey: "enroll-athlete-4-main",
    actor: owner,
  });

  const generated = await materializeSessions({
    organizationId: ID.orgA,
    classTemplateId: ID.templateMain,
    startDate: "2026-10-05",
    endDate: "2026-10-12",
    idempotencyKey: "materialize-main-october",
    actor: owner,
  });
  assert.equal(generated.length, 2);
  const generatedRetry = await materializeSessions({
    organizationId: ID.orgA,
    classTemplateId: ID.templateMain,
    startDate: "2026-10-05",
    endDate: "2026-10-12",
    idempotencyKey: "materialize-main-october",
    actor: owner,
  });
  assert.deepEqual(
    generatedRetry.map((session) => session.id),
    generated.map((session) => session.id)
  );

  await expectOperationalError(
    () =>
      recordAttendance({
        organizationId: ID.orgA,
        sessionId: generated[0].id,
        enrollmentId: attendanceEnrollment.id,
        status: "present",
        idempotencyKey: "unassigned-coach-attendance",
        actor: coach,
      }),
    "FORBIDDEN"
  );
  assert.equal(
    await count(
      "zaltyko.outbox_events",
      "idempotency_key = 'unassigned-coach-attendance'"
    ),
    0
  );

  await pool.query(
    `insert into zaltyko.session_staff (
       organization_id, session_id, staff_profile_id, assignment_role
     ) values ($1, $2, $3, 'coach')`,
    [ID.orgA, generated[0].id, ID.coachProfile]
  );

  const attendance = await recordAttendance({
    organizationId: ID.orgA,
    sessionId: generated[0].id,
    enrollmentId: attendanceEnrollment.id,
    status: "present",
    idempotencyKey: "attendance-athlete-4-present",
    actor: coach,
  });
  const attendanceRetry = await recordAttendance({
    organizationId: ID.orgA,
    sessionId: generated[0].id,
    enrollmentId: attendanceEnrollment.id,
    status: "present",
    idempotencyKey: "attendance-athlete-4-present",
    actor: coach,
  });
  assert.equal(attendanceRetry.id, attendance.id);

  const corrected = await recordAttendance({
    organizationId: ID.orgA,
    sessionId: generated[0].id,
    enrollmentId: attendanceEnrollment.id,
    status: "late",
    idempotencyKey: "attendance-athlete-4-corrected",
    actor: coach,
  });
  assert.equal(corrected.id, attendance.id);
  assert.equal(corrected.status, "late");

  const concurrentCorrections = await Promise.all([
    recordAttendance({
      organizationId: ID.orgA,
      sessionId: generated[0].id,
      enrollmentId: attendanceEnrollment.id,
      status: "absent",
      idempotencyKey: "attendance-concurrent-absent",
      actor: coach,
    }),
    recordAttendance({
      organizationId: ID.orgA,
      sessionId: generated[0].id,
      enrollmentId: attendanceEnrollment.id,
      status: "excused",
      idempotencyKey: "attendance-concurrent-excused",
      actor: coach,
    }),
  ]);
  assert(concurrentCorrections.every((entry) => entry.id === attendance.id));
  assert.equal(
    await count(
      "zaltyko.attendance_records",
      `session_id = '${generated[0].id}' and enrollment_id = '${attendanceEnrollment.id}'`
    ),
    1
  );

  await expectOperationalError(
    () =>
      recordAttendance({
        organizationId: ID.orgA,
        sessionId: generated[0].id,
        enrollmentId: attendanceEnrollment.id,
        status: "absent",
        idempotencyKey: "outsider-attendance-attempt",
        actor: outsider,
      }),
    "FORBIDDEN"
  );

  assert.equal(
    await count(
      "zaltyko.outbox_events",
      "idempotency_key = 'outsider-attendance-attempt'"
    ),
    0
  );
  assert.equal(
    await count(
      "zaltyko.outbox_events",
      "payload::text ~* '(medical|email|phone|address)'"
    ),
    0
  );

  const integrity = await pool.query(`
    select
      (select count(*)::int from zaltyko.outbox_events) as outbox_count,
      (select count(*)::int from zaltyko.audit_log) as audit_count,
      (select count(*)::int from zaltyko.enrollment_status_history) as history_count,
      (select count(*)::int from zaltyko.enrollment_status_history where effective_on is null)
        as missing_effective_date_count
  `);
  assert.equal(integrity.rows[0].outbox_count, integrity.rows[0].audit_count);
  assert(integrity.rows[0].history_count >= 6);
  assert.equal(integrity.rows[0].missing_effective_date_count, 0);

  console.log(
    JSON.stringify({
      status: "PASS",
      concurrency: "one enrollment accepted, one CAPACITY_FULL",
      sessions: generated.length,
      attendance: "serialized corrections on one row",
      outbox: integrity.rows[0].outbox_count,
      audit: integrity.rows[0].audit_count,
      history: integrity.rows[0].history_count,
    })
  );
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exitCode = 1;
  });
