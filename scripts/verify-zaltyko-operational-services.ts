import assert from "node:assert/strict";

import { Pool } from "pg";
import { z } from "zod";

import { recordAttendance } from "@/modules/attendance/application/attendance-service";
import {
  getOwnerSessionAttendance,
  resolveSessionAttendanceAccess,
} from "@/modules/attendance/application/owner-session-attendance";
import {
  createEnrollment,
  transferEnrollment,
  transitionEnrollment,
} from "@/modules/enrollments/application/enrollment-service";
import {
  getMonthlyInvoiceOptions,
  issueMonthlyInvoice,
} from "@/modules/billing/application/monthly-invoice-service";
import { createMonthlyPricePlan } from "@/modules/billing/application/monthly-price-plan-service";
import { recordManualPaymentForCharge } from "@/modules/billing/application/ledger-service";
import { associateOwnerFamily } from "@/modules/families/application/owner-family-association";
import { assignEnrollmentPrice } from "@/modules/enrollments/application/enrollment-price-service";
import {
  getOwnerEnrollmentsPageData,
  searchOwnerEnrollmentCandidates,
} from "@/modules/enrollments/application/enrollment-query-service";
import {
  addGroupMembership,
  createAthleteForGroup,
  transitionGroupMembership,
} from "@/modules/groups/application/group-membership-service";
import {
  createOperationalGroup,
  getOwnerGroupsPageData,
  searchGroupAthleteOptions,
} from "@/modules/groups/application/group-management-service";
import { materializeSessions } from "@/modules/scheduling/application/session-service";
import { createScheduledClass } from "@/modules/scheduling/application/class-management-service";
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
  organizationSport: "10000000-0000-4000-8000-000000000075",
  spaceA: "10000000-0000-4000-8000-000000000050",
  spaceLimited: "10000000-0000-4000-8000-000000000051",
  spaceA2: "10000000-0000-4000-8000-000000000052",
  program: "10000000-0000-4000-8000-000000000080",
  groupMain: "10000000-0000-4000-8000-000000000090",
  groupSecond: "10000000-0000-4000-8000-000000000091",
  groupLimited: "10000000-0000-4000-8000-000000000092",
  groupNorth: "10000000-0000-4000-8000-000000000093",
  templateMain: "10000000-0000-4000-8000-000000000100",
  templateLimited: "10000000-0000-4000-8000-000000000101",
  templateTarget: "10000000-0000-4000-8000-000000000102",
  templateExpired: "10000000-0000-4000-8000-000000000103",
  sessionNorth: "10000000-0000-4000-8000-000000000104",
  pricePlanMonthly: "10000000-0000-4000-8000-000000000105",
  pricePlanAnnual: "10000000-0000-4000-8000-000000000106",
  coachPerson: "10000000-0000-4000-8000-000000000065",
  coachProfile: "10000000-0000-4000-8000-000000000075",
  athlete1: "10000000-0000-4000-8000-000000000071",
  athlete2: "10000000-0000-4000-8000-000000000072",
  athlete3: "10000000-0000-4000-8000-000000000073",
  athlete4: "10000000-0000-4000-8000-000000000074",
  athleteB: "20000000-0000-4000-8000-000000000071",
  groupB: "20000000-0000-4000-8000-000000000090",
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

    insert into zaltyko.organization_sports (
      id, organization_id, country_code, sport_profile_id, role, status
    ) values (
      '${ID.organizationSport}', '${ID.orgA}', 'ES',
      '70000000-0000-4000-8000-000000000001', 'primary', 'active'
    );

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

    insert into zaltyko.price_plans (
      id, organization_id, name, cadence, amount_cents, currency, is_active
    ) values
      ('${ID.pricePlanMonthly}', '${ID.orgA}', 'Cuota mensual sintética', 'monthly', 12000, 'EUR', true),
      ('${ID.pricePlanAnnual}', '${ID.orgA}', 'Cuota anual sintética', 'annual', 90000, 'EUR', true);

    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values ('20000000-0000-4000-8000-000000000061', '${ID.orgB}', 'Atleta', 'Sintética');
    insert into zaltyko.athletes (id, organization_id, person_id)
    values ('${ID.athleteB}', '${ID.orgB}', '20000000-0000-4000-8000-000000000061');

    insert into zaltyko.staff_profiles (
      id, organization_id, person_id, member_id, is_active
    ) values (
      '${ID.coachProfile}', '${ID.orgA}', '${ID.coachPerson}', '${ID.coachMember}', true
    );

    insert into zaltyko.programs (
      id, organization_id, name, kind, organization_sport_id, activity_key, status
    ) values (
      '${ID.program}', '${ID.orgA}', 'Base artística', 'gymnastics_sport',
      '${ID.organizationSport}', null, 'active'
    );

    insert into zaltyko.groups (
      id, organization_id, location_id, program_id, name, capacity, status
    ) values
      ('${ID.groupMain}', '${ID.orgA}', '${ID.locationA}', '${ID.program}', 'Iniciación', 4, 'active'),
      ('${ID.groupSecond}', '${ID.orgA}', '${ID.locationA}', '${ID.program}', 'Preparación física', 4, 'active'),
      ('${ID.groupLimited}', '${ID.orgA}', '${ID.locationA}', '${ID.program}', 'Grupo con una plaza', 1, 'active'),
      ('${ID.groupNorth}', '${ID.orgA}', '${ID.locationA2}', '${ID.program}', 'Grupo norte', 2, 'active'),
      ('${ID.groupB}', '${ID.orgB}', '${ID.locationB}', null, 'Grupo sintético B', 2, 'active');

    insert into zaltyko.class_templates (
      id, organization_id, location_id, program_id, default_space_id,
      name, capacity, status, effective_from, effective_to
    ) values
      ('${ID.templateMain}', '${ID.orgA}', '${ID.locationA}', '${ID.program}', '${ID.spaceA}', 'Base lunes', 4, 'active', '2026-09-01', null),
      ('${ID.templateLimited}', '${ID.orgA}', '${ID.locationA}', '${ID.program}', '${ID.spaceLimited}', 'Última plaza', 1, 'active', '2026-09-01', null),
      ('${ID.templateTarget}', '${ID.orgA}', '${ID.locationA2}', '${ID.program}', '${ID.spaceA2}', 'Base norte', 4, 'active', '2026-09-01', null),
      ('${ID.templateExpired}', '${ID.orgA}', '${ID.locationA}', '${ID.program}', '${ID.spaceA}', 'Clase terminada', 4, 'active', '2026-09-01', '2026-09-30');

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

  const blankAcademyPlan = await createMonthlyPricePlan({
    organizationId: ID.orgB,
    locationId: ID.locationB,
    name: "Cuota inicial",
    amountCents: 14500,
    idempotencyKey: "blank-academy-monthly-plan",
    actor: outsider,
  });
  assert.equal(blankAcademyPlan.pricePlan.currency, "EUR");
  assert.equal(blankAcademyPlan.pricePlan.cadence, "monthly");
  const blankAcademyPlanRetry = await createMonthlyPricePlan({
    organizationId: ID.orgB,
    locationId: ID.locationB,
    name: "Cuota inicial",
    amountCents: 14500,
    idempotencyKey: "blank-academy-monthly-plan",
    actor: outsider,
  });
  assert.equal(
    blankAcademyPlanRetry.pricePlan.id,
    blankAcademyPlan.pricePlan.id
  );
  assert.equal(blankAcademyPlanRetry.replayed, true);
  await expectOperationalError(
    () =>
      createMonthlyPricePlan({
        organizationId: ID.orgB,
        locationId: ID.locationB,
        name: "Tarifa sin autorización",
        amountCents: 15000,
        idempotencyKey: "cross-tenant-monthly-plan",
        actor: owner,
      }),
    "FORBIDDEN"
  );
  await expectOperationalError(
    () =>
      createMonthlyPricePlan({
        organizationId: ID.orgA,
        locationId: ID.locationA,
        name: "Tarifa de manager",
        amountCents: 15000,
        idempotencyKey: "manager-monthly-plan",
        actor: manager,
      }),
    "FORBIDDEN"
  );

  const createdGroup = await createOperationalGroup({
    organizationId: ID.orgA,
    locationId: ID.locationA,
    programId: ID.program,
    name: "Grupo del servicio",
    capacity: 3,
    idempotencyKey: "create-operational-group-1",
    actor: owner,
  });
  const createdGroupRetry = await createOperationalGroup({
    organizationId: ID.orgA,
    locationId: ID.locationA,
    programId: ID.program,
    name: "Grupo del servicio",
    capacity: 3,
    idempotencyKey: "create-operational-group-1",
    actor: owner,
  });
  assert.equal(createdGroupRetry.id, createdGroup.id);
  assert.equal(
    await count("zaltyko.groups", `id = '${createdGroup.id}'`),
    1,
    "Repetir la creación del grupo no duplica recursos"
  );
  await expectOperationalError(
    () =>
      createOperationalGroup({
        organizationId: ID.orgA,
        locationId: ID.locationA,
        programId: ID.program,
        name: "Otro nombre con la misma clave",
        capacity: 3,
        idempotencyKey: "create-operational-group-1",
        actor: owner,
      }),
    "IDEMPOTENCY_CONFLICT"
  );
  await expectOperationalError(
    () =>
      createOperationalGroup({
        organizationId: ID.orgA,
        locationId: ID.locationA2,
        programId: ID.program,
        name: "Grupo fuera de alcance",
        capacity: 3,
        idempotencyKey: "create-group-out-of-scope",
        actor: manager,
      }),
    "LOCATION_SCOPE_DENIED"
  );

  const ownerGroups = await getOwnerGroupsPageData({
    userId: ID.ownerUser,
    organizationId: ID.orgA,
  });
  assert(ownerGroups.groups.some((group) => group.id === createdGroup.id));
  const managerGroups = await getOwnerGroupsPageData({
    userId: ID.managerUser,
    organizationId: ID.orgA,
  });
  assert(
    managerGroups.groups.every((group) => group.locationId === ID.locationA)
  );

  const createdAthleteMembership = await createAthleteForGroup({
    organizationId: ID.orgA,
    groupId: createdGroup.id,
    givenName: "Gimnasta",
    familyName: "Sintética",
    idempotencyKey: "create-athlete-group-1",
    actor: manager,
  });
  const createdAthleteMembershipRetry = await createAthleteForGroup({
    organizationId: ID.orgA,
    groupId: createdGroup.id,
    givenName: "Gimnasta",
    familyName: "Sintética",
    idempotencyKey: "create-athlete-group-1",
    actor: manager,
  });
  assert.equal(createdAthleteMembershipRetry.id, createdAthleteMembership.id);
  assert.equal(
    createdAthleteMembershipRetry.athleteId,
    createdAthleteMembership.athleteId
  );
  assert.equal(
    await count(
      "zaltyko.athletes",
      `id = '${createdAthleteMembership.athleteId}'`
    ),
    1,
    "La nueva ficha se crea una sola vez al reintentar"
  );
  assert.equal(
    await count(
      "zaltyko.group_memberships",
      `id = '${createdAthleteMembership.id}' and group_id = '${createdGroup.id}' and status = 'active'`
    ),
    1,
    "La nueva ficha queda asociada al grupo en la misma operación"
  );
  await expectOperationalError(
    () =>
      createAthleteForGroup({
        organizationId: ID.orgA,
        groupId: createdGroup.id,
        givenName: "Otro nombre",
        familyName: "Sintética",
        idempotencyKey: "create-athlete-group-1",
        actor: manager,
      }),
    "IDEMPOTENCY_CONFLICT"
  );
  const createdAthleteEvents = await pool.query<{
    event_name: string;
    payload: Record<string, unknown>;
  }>(
    `select event_name, payload from zaltyko.outbox_events
     where organization_id = $1 and idempotency_key = $2
     order by event_name`,
    [ID.orgA, "create-athlete-group-1"]
  );
  assert.deepEqual(
    createdAthleteEvents.rows.map((row) => row.event_name),
    ["athlete.created", "group.membership_added"]
  );
  assert.equal(
    JSON.stringify(createdAthleteEvents.rows).includes("Gimnasta"),
    false,
    "Los nombres no salen de people hacia outbox"
  );
  const athleteAudit = await pool.query<{
    after: Record<string, unknown> | null;
  }>(
    `select after from zaltyko.audit_log
     where organization_id = $1 and idempotency_key = $2`,
    [ID.orgA, "athlete-created:create-athlete-group-1"]
  );
  assert.equal(athleteAudit.rowCount, 1);
  assert.equal(
    JSON.stringify(athleteAudit.rows[0]?.after).includes("Gimnasta"),
    false,
    "La auditoría conserva IDs y scope, no nombres"
  );

  const athleteOptions = await searchGroupAthleteOptions({
    userId: ID.managerUser,
    organizationId: ID.orgA,
    groupId: createdGroup.id,
    query: "Atleta",
  });
  assert.equal(athleteOptions.length, 4);
  await expectOperationalError(
    () =>
      searchGroupAthleteOptions({
        userId: ID.managerUser,
        organizationId: ID.orgA,
        groupId: ID.groupNorth,
        query: "Atleta",
      }),
    "NOT_FOUND"
  );

  const groupMembership = await addGroupMembership({
    organizationId: ID.orgA,
    groupId: ID.groupMain,
    athleteId: ID.athlete1,
    startsOn: "2026-10-01",
    status: "active",
    idempotencyKey: "group-membership-main-1",
    actor: owner,
  });
  const groupMembershipRetry = await addGroupMembership({
    organizationId: ID.orgA,
    groupId: ID.groupMain,
    athleteId: ID.athlete1,
    startsOn: "2026-10-01",
    status: "active",
    idempotencyKey: "group-membership-main-1",
    actor: owner,
  });
  assert.equal(groupMembershipRetry.id, groupMembership.id);

  await addGroupMembership({
    organizationId: ID.orgA,
    groupId: ID.groupSecond,
    athleteId: ID.athlete1,
    startsOn: "2026-10-01",
    status: "active",
    idempotencyKey: "group-membership-second-1",
    actor: owner,
  });
  assert.equal(
    await count(
      "zaltyko.group_memberships",
      `athlete_id = '${ID.athlete1}' and status = 'active'`
    ),
    2,
    "Una atleta puede pertenecer a más de un grupo"
  );

  await expectOperationalError(
    () =>
      addGroupMembership({
        organizationId: ID.orgA,
        groupId: ID.groupMain,
        athleteId: ID.athlete1,
        startsOn: "2026-10-01",
        status: "active",
        idempotencyKey: "duplicate-group-membership",
        actor: owner,
      }),
    "DUPLICATE_OPEN_GROUP_MEMBERSHIP"
  );

  await expectOperationalError(
    () =>
      addGroupMembership({
        organizationId: ID.orgA,
        groupId: ID.groupNorth,
        athleteId: ID.athlete4,
        startsOn: "2026-10-01",
        status: "active",
        idempotencyKey: "manager-out-of-scope-group",
        actor: manager,
      }),
    "LOCATION_SCOPE_DENIED"
  );
  assert.equal(
    await count(
      "zaltyko.outbox_events",
      "idempotency_key = 'manager-out-of-scope-group'"
    ),
    0
  );

  const groupCapacityAttempts = await Promise.allSettled(
    [ID.athlete2, ID.athlete3].map((athleteId, index) =>
      addGroupMembership({
        organizationId: ID.orgA,
        groupId: ID.groupLimited,
        athleteId,
        startsOn: "2026-10-01",
        status: "active",
        idempotencyKey: `group-capacity-${index + 1}`,
        actor: owner,
      })
    )
  );
  assert.equal(
    groupCapacityAttempts.filter((result) => result.status === "fulfilled")
      .length,
    1
  );
  const groupCapacityWinner = [ID.athlete2, ID.athlete3][
    groupCapacityAttempts.findIndex((result) => result.status === "fulfilled")
  ];
  const fullGroupResult = groupCapacityAttempts.find(
    (result) => result.status === "rejected"
  );
  assert(fullGroupResult?.status === "rejected");
  assert(fullGroupResult.reason instanceof OperationalError);
  assert.equal(fullGroupResult.reason.code, "GROUP_CAPACITY_FULL");

  await expectOperationalError(
    () =>
      createAthleteForGroup({
        organizationId: ID.orgA,
        groupId: ID.groupLimited,
        givenName: "Gimnasta",
        familyName: "Sin Plaza",
        idempotencyKey: "create-athlete-full-group",
        actor: owner,
      }),
    "GROUP_CAPACITY_FULL"
  );
  assert.equal(
    await count(
      "zaltyko.people",
      "given_name = 'Gimnasta' and family_name = 'Sin Plaza'"
    ),
    0,
    "Un grupo lleno no deja una persona huérfana"
  );
  await expectOperationalError(
    () =>
      createAthleteForGroup({
        organizationId: ID.orgA,
        groupId: ID.groupNorth,
        givenName: "Gimnasta",
        familyName: "Fuera de Sede",
        idempotencyKey: "create-athlete-out-of-scope",
        actor: manager,
      }),
    "LOCATION_SCOPE_DENIED"
  );
  assert.equal(
    await count(
      "zaltyko.people",
      "given_name = 'Gimnasta' and family_name = 'Fuera de Sede'"
    ),
    0,
    "La sede no autorizada no deja una persona huérfana"
  );

  await expectOperationalError(
    () =>
      transitionGroupMembership({
        organizationId: ID.orgA,
        membershipId: groupMembership.id,
        groupId: ID.groupSecond,
        expectedStatus: "active",
        toStatus: "paused",
        effectiveOn: "2026-10-03",
        idempotencyKey: "group-mismatched-transition",
        actor: owner,
      }),
    "NOT_FOUND"
  );
  assert.equal(
    await count(
      "zaltyko.group_memberships",
      `id = '${groupMembership.id}' and status = 'active'`
    ),
    1,
    "Un grupo de ruta no coincidente no puede mutar una pertenencia"
  );

  const pausedMembership = await transitionGroupMembership({
    organizationId: ID.orgA,
    membershipId: groupMembership.id,
    expectedStatus: "active",
    toStatus: "paused",
    effectiveOn: "2026-10-03",
    reasonCode: "temporary_pause",
    idempotencyKey: "group-membership-pause-1",
    actor: owner,
  });
  assert.equal(pausedMembership.status, "paused");
  const pausedMembershipRetry = await transitionGroupMembership({
    organizationId: ID.orgA,
    membershipId: groupMembership.id,
    expectedStatus: "active",
    toStatus: "paused",
    effectiveOn: "2026-10-03",
    reasonCode: "temporary_pause",
    idempotencyKey: "group-membership-pause-1",
    actor: owner,
  });
  assert.equal(pausedMembershipRetry.status, "paused");

  await expectOperationalError(
    () =>
      transitionGroupMembership({
        organizationId: ID.orgA,
        membershipId: groupMembership.id,
        expectedStatus: "active",
        toStatus: "paused",
        effectiveOn: "2026-10-03",
        reasonCode: "family_request",
        idempotencyKey: "group-membership-pause-1",
        actor: owner,
      }),
    "IDEMPOTENCY_CONFLICT"
  );

  await assert.rejects(
    () =>
      transitionGroupMembership({
        organizationId: ID.orgA,
        membershipId: groupMembership.id,
        expectedStatus: "paused",
        toStatus: "active",
        effectiveOn: "2026-10-05",
        reasonCode: "other: comentario con datos personales" as never,
        idempotencyKey: "group-membership-free-text-reason",
        actor: owner,
      }),
    (error: unknown) => error instanceof z.ZodError
  );

  await expectOperationalError(
    () =>
      transitionGroupMembership({
        organizationId: ID.orgA,
        membershipId: groupMembership.id,
        expectedStatus: "active",
        toStatus: "ended",
        effectiveOn: "2026-10-04",
        idempotencyKey: "stale-group-membership-transition",
        actor: owner,
      }),
    "VERSION_CONFLICT"
  );

  const resumedMembership = await transitionGroupMembership({
    organizationId: ID.orgA,
    membershipId: groupMembership.id,
    expectedStatus: "paused",
    toStatus: "active",
    effectiveOn: "2026-10-05",
    idempotencyKey: "group-membership-resume-1",
    actor: owner,
  });
  assert.equal(resumedMembership.status, "active");
  await expectOperationalError(
    () =>
      transitionGroupMembership({
        organizationId: ID.orgA,
        membershipId: groupMembership.id,
        expectedStatus: "active",
        toStatus: "ended",
        effectiveOn: "2026-10-04",
        idempotencyKey: "out-of-order-group-membership-transition",
        actor: owner,
      }),
    "INVALID_DATE_RANGE"
  );
  const endedMembership = await transitionGroupMembership({
    organizationId: ID.orgA,
    membershipId: groupMembership.id,
    expectedStatus: "active",
    toStatus: "ended",
    effectiveOn: "2026-10-06",
    idempotencyKey: "group-membership-end-1",
    actor: owner,
  });
  assert.equal(endedMembership.status, "ended");
  assert.equal(endedMembership.endsOn, "2026-10-06");
  const membershipHistory = await pool.query(
    `select from_status, to_status, effective_on::text, reason_code
     from zaltyko.group_membership_history
     where organization_id = $1 and membership_id = $2
     order by changed_at, id`,
    [ID.orgA, groupMembership.id]
  );
  assert.deepEqual(
    membershipHistory.rows.map((row) => [
      row.from_status,
      row.to_status,
      row.effective_on,
    ]),
    [
      [null, "active", "2026-10-01"],
      ["active", "paused", "2026-10-03"],
      ["paused", "active", "2026-10-05"],
      ["active", "ended", "2026-10-06"],
    ]
  );
  assert.equal(membershipHistory.rows[1].reason_code, "temporary_pause");
  await assert.rejects(
    () =>
      pool.query(
        `insert into zaltyko.group_membership_history (
          organization_id, membership_id, from_status, to_status,
          changed_by_member_id, idempotency_key, effective_on, reason_code
        ) values ($1, $2, 'active', 'paused', $3, $4, '2026-10-03', 'free text')`,
        [
          ID.orgA,
          groupMembership.id,
          ID.ownerMember,
          "group-membership-invalid-reason",
        ]
      ),
    (error: { code?: string }) => error.code === "23514"
  );

  const groupEvent = await pool.query(
    `select payload from zaltyko.outbox_events where idempotency_key = $1`,
    ["group-membership-main-1"]
  );
  assert.equal("athleteId" in groupEvent.rows[0].payload, false);
  assert.equal("athlete_id" in groupEvent.rows[0].payload, false);

  await addGroupMembership({
    organizationId: ID.orgB,
    groupId: ID.groupB,
    athleteId: ID.athleteB,
    startsOn: "2026-10-01",
    status: "active",
    idempotencyKey: "org-b-group-membership",
    actor: outsider,
  });
  await addGroupMembership({
    organizationId: ID.orgA,
    groupId: ID.groupNorth,
    athleteId: ID.athlete4,
    startsOn: "2026-10-01",
    status: "active",
    idempotencyKey: "owner-north-group-membership",
    actor: owner,
  });
  const northMembershipRow = await pool.query(
    `select id from zaltyko.group_memberships
     where organization_id = $1 and group_id = $2`,
    [ID.orgA, ID.groupNorth]
  );
  assert.equal(northMembershipRow.rowCount, 1);
  const northMembershipId = northMembershipRow.rows[0].id as string;

  const rlsClient = await pool.connect();
  try {
    const rlsConfig = await rlsClient.query(`
      select
        (select relrowsecurity from pg_class where oid = 'zaltyko.group_memberships'::regclass) as membership_rls_enabled,
        (select relforcerowsecurity from pg_class where oid = 'zaltyko.group_memberships'::regclass) as membership_rls_forced,
        class.relrowsecurity as history_rls_enabled,
        class.relforcerowsecurity as history_rls_forced,
        has_table_privilege('anon', 'zaltyko.group_memberships', 'select') as anon_membership_select,
        has_table_privilege('anon', 'zaltyko.group_membership_history', 'select') as anon_select,
        has_table_privilege('authenticated', 'zaltyko.group_membership_history', 'select') as member_select,
        has_table_privilege('authenticated', 'zaltyko.group_memberships', 'select') as membership_select,
        has_table_privilege('authenticated', 'zaltyko.group_memberships', 'insert') as member_membership_insert,
        has_table_privilege('authenticated', 'zaltyko.group_membership_history', 'insert') as member_insert,
        has_table_privilege('service_role', 'zaltyko.group_memberships', 'select') as service_membership_select,
        has_table_privilege('service_role', 'zaltyko.group_memberships', 'insert') as service_membership_insert,
        has_table_privilege('service_role', 'zaltyko.group_memberships', 'update') as service_membership_update,
        has_table_privilege('service_role', 'zaltyko.group_memberships', 'delete') as service_membership_delete,
        has_table_privilege('service_role', 'zaltyko.group_membership_history', 'select') as service_history_select,
        has_table_privilege('service_role', 'zaltyko.group_membership_history', 'insert') as service_insert,
        has_table_privilege('service_role', 'zaltyko.group_membership_history', 'update') as service_history_update,
        has_table_privilege('service_role', 'zaltyko.group_membership_history', 'delete') as service_history_delete,
        exists (
          select 1 from pg_policies
          where schemaname = 'zaltyko'
            and tablename = 'group_memberships'
            and policyname = 'group_memberships_select_member'
        ) as has_membership_policy,
        exists (
          select 1 from pg_policies
          where schemaname = 'zaltyko'
            and tablename = 'group_membership_history'
            and policyname = 'group_membership_history_select_member'
        ) as has_tenant_policy
      from pg_class class
      join pg_namespace schema on schema.oid = class.relnamespace
      where schema.nspname = 'zaltyko'
        and class.relname = 'group_membership_history'
    `);
    assert.deepEqual(rlsConfig.rows[0], {
      membership_rls_enabled: true,
      membership_rls_forced: true,
      history_rls_enabled: true,
      history_rls_forced: true,
      anon_membership_select: false,
      anon_select: false,
      member_select: true,
      membership_select: true,
      member_membership_insert: false,
      member_insert: false,
      service_membership_select: true,
      service_membership_insert: true,
      service_membership_update: true,
      service_membership_delete: false,
      service_history_select: true,
      service_insert: true,
      service_history_update: false,
      service_history_delete: false,
      has_membership_policy: true,
      has_tenant_policy: true,
    });

    await rlsClient.query("set role authenticated");
    await rlsClient.query(
      "select set_config('request.jwt.claim.sub', $1, false)",
      [ID.managerUser]
    );
    const ownHistory = await rlsClient.query(
      `select count(*)::int as count from zaltyko.group_membership_history where organization_id = $1`,
      [ID.orgA]
    );
    const crossTenantHistory = await rlsClient.query(
      `select count(*)::int as count from zaltyko.group_membership_history where organization_id = $1`,
      [ID.orgB]
    );
    const outOfScopeHistory = await rlsClient.query(
      `select count(*)::int as count
       from zaltyko.group_membership_history
       where organization_id = $1 and membership_id = $2`,
      [ID.orgA, northMembershipId]
    );
    const outOfScopeMembership = await rlsClient.query(
      `select count(*)::int as count
       from zaltyko.group_memberships
       where organization_id = $1 and id = $2`,
      [ID.orgA, northMembershipId]
    );
    assert(ownHistory.rows[0].count > 0);
    assert.equal(crossTenantHistory.rows[0].count, 0);
    assert.equal(outOfScopeHistory.rows[0].count, 0);
    assert.equal(outOfScopeMembership.rows[0].count, 0);
  } finally {
    await rlsClient.query("reset role");
    rlsClient.release();
  }

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

  await expectOperationalError(
    () =>
      createEnrollment({
        organizationId: ID.orgA,
        locationId: ID.locationA,
        athleteId: ID.athlete2,
        classTemplateId: ID.templateExpired,
        status: "pending",
        startsOn: "2026-10-01",
        source: "owner",
        idempotencyKey: "enrollment-outside-class-dates",
        actor: owner,
      }),
    "INVALID_DATE_RANGE"
  );

  const enrollmentPage = await getOwnerEnrollmentsPageData({
    userId: ID.ownerUser,
    organizationId: ID.orgA,
    locationId: ID.locationA,
  });
  assert.equal(enrollmentPage.totalsByStatus.active, 1);
  assert.equal(enrollmentPage.enrollments[0]?.athleteName, "Atleta Uno");
  assert.equal(
    enrollmentPage.classes.find((item) => item.id === ID.templateMain)
      ?.availableSeats,
    3
  );

  await addGroupMembership({
    organizationId: ID.orgA,
    groupId: ID.groupMain,
    athleteId: ID.athlete2,
    startsOn: "2026-10-01",
    status: "active",
    idempotencyKey: "group-membership-main-athlete-2",
    actor: owner,
  });
  const enrollmentCandidates = await searchOwnerEnrollmentCandidates({
    userId: ID.ownerUser,
    organizationId: ID.orgA,
    locationId: ID.locationA,
    classTemplateId: ID.templateMain,
    query: "Atleta",
  });
  assert.deepEqual(
    enrollmentCandidates.map((candidate) => candidate.id),
    [
      ID.athlete2,
      ...(groupCapacityWinner === ID.athlete3 ? [ID.athlete3] : []),
    ],
    "La búsqueda usa group_memberships y excluye inscripciones abiertas duplicadas"
  );
  await expectOperationalError(
    () =>
      searchOwnerEnrollmentCandidates({
        userId: ID.managerUser,
        organizationId: ID.orgA,
        locationId: ID.locationA2,
        classTemplateId: ID.templateTarget,
        query: "Atleta",
      }),
    "LOCATION_SCOPE_DENIED"
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
  const fulfilledEnrollment = concurrent.find(
    (result) => result.status === "fulfilled"
  );
  assert(fulfilledEnrollment?.status === "fulfilled");
  const concurrentEnrollment = fulfilledEnrollment.value;

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
    effectiveOn: "2026-10-03",
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
    pricePlanId: ID.pricePlanMonthly,
    idempotencyKey: "enroll-athlete-4-main",
    actor: owner,
  });
  const familyAssociationCommand = {
    organizationId: ID.orgA,
    locationId: ID.locationA,
    athleteIds: [concurrentEnrollment.athleteId, ID.athlete4],
    effectiveFrom: "2026-10-01",
    payer: {
      givenName: "Responsable",
      familyName: "Sintético",
      relationship: "parent" as const,
    },
    idempotencyKey: "family-monthly-owner-001",
    actor: owner,
  };
  const familyAssociation = await associateOwnerFamily(
    familyAssociationCommand
  );
  const familyAssociationRetry = await associateOwnerFamily(
    familyAssociationCommand
  );
  assert.equal(familyAssociationRetry.family.id, familyAssociation.family.id);
  assert.equal(
    familyAssociationRetry.familyPayerId,
    familyAssociation.familyPayerId
  );
  assert.equal(
    await count(
      "zaltyko.family_guardians",
      `family_id = '${familyAssociation.family.id}' and can_view_athletes = false and can_manage_enrollments = false`
    ),
    1,
    "El responsable de facturación no obtiene acceso al portal"
  );

  const initialMonthlyOptions = await getMonthlyInvoiceOptions({
    organizationId: ID.orgA,
    locationId: ID.locationA,
    servicePeriod: "2026-10",
    actor: owner,
  });
  const initialFamilyQuote = initialMonthlyOptions.families.find(
    (family) => family.familyId === familyAssociation.family.id
  );
  assert.equal(initialFamilyQuote?.canIssue, false);
  assert(
    initialFamilyQuote?.blockingReasons.includes("PRICE_ASSIGNMENT_REQUIRED")
  );

  const missingPriceAssignments = await pool.query<{
    id: string;
    starts_on: string;
  }>(
    `select enrollment.id, enrollment.starts_on::text
     from zaltyko.enrollments enrollment
     where enrollment.organization_id = $1
       and enrollment.location_id = $2
       and enrollment.athlete_id in ($3, $4)
       and enrollment.status = 'active'
       and not exists (
         select 1 from zaltyko.enrollment_price_assignments assignment
         where assignment.organization_id = enrollment.organization_id
           and assignment.enrollment_id = enrollment.id
           and assignment.ends_on is null
       )`,
    [ID.orgA, ID.locationA, concurrentEnrollment.athleteId, ID.athlete4]
  );
  for (const enrollment of missingPriceAssignments.rows) {
    await assignEnrollmentPrice({
      organizationId: ID.orgA,
      locationId: ID.locationA,
      enrollmentId: enrollment.id,
      pricePlanId: ID.pricePlanMonthly,
      startsOn: enrollment.starts_on,
      idempotencyKey: `monthly-price-assignment-${enrollment.id}`,
      actor: owner,
    });
  }

  const monthlyOptions = await getMonthlyInvoiceOptions({
    organizationId: ID.orgA,
    locationId: ID.locationA,
    servicePeriod: "2026-10",
    actor: owner,
  });
  const familyQuote = monthlyOptions.families.find(
    (family) => family.familyId === familyAssociation.family.id
  );
  assert(familyQuote?.canIssue, JSON.stringify(familyQuote));
  assert.equal(familyQuote?.lines.length, 2);
  assert.equal(familyQuote?.totalAmountCents, 24000);
  assert(familyQuote?.quoteHash);

  await pool.query(
    `update zaltyko.enrollment_price_assignments
     set unit_amount_cents = 12500
     where organization_id = $1 and enrollment_id = $2`,
    [ID.orgA, attendanceEnrollment.id]
  );
  await expectOperationalError(
    () =>
      issueMonthlyInvoice({
        organizationId: ID.orgA,
        locationId: ID.locationA,
        familyId: familyAssociation.family.id,
        familyPayerId: familyAssociation.familyPayerId,
        servicePeriod: "2026-10",
        dueDate: "2026-10-31",
        quoteHash: familyQuote!.quoteHash!,
        idempotencyKey: "monthly-invoice-stale-001",
        actor: owner,
      }),
    "QUOTE_STALE"
  );

  await pool.query(
    `update zaltyko.organization_entitlements
     set plan_code = 'growth', source = 'contract',
         source_reference = 'synthetic-monthly-invoice-paid-plan',
         effective_from = now(), effective_until = now() + interval '30 days'
     where organization_id = $1`,
    [ID.orgA]
  );
  const entitlement = await pool.query(
    "select revision from zaltyko.organization_entitlements where organization_id = $1",
    [ID.orgA]
  );
  await pool.query(
    `insert into zaltyko.family_collection_preferences (
       organization_id, family_id, requested_mode, version,
       entitlement_revision, updated_by_member_id
     ) values ($1, $2, 'automatic', 1, $3, $4)`,
    [
      ID.orgA,
      familyAssociation.family.id,
      entitlement.rows[0].revision,
      ID.ownerMember,
    ]
  );

  const freshQuote = await getMonthlyInvoiceOptions({
    organizationId: ID.orgA,
    locationId: ID.locationA,
    servicePeriod: "2026-10",
    actor: owner,
  });
  const refreshedFamilyQuote = freshQuote.families.find(
    (family) => family.familyId === familyAssociation.family.id
  )!;
  const monthlyCommand = {
    organizationId: ID.orgA,
    locationId: ID.locationA,
    familyId: familyAssociation.family.id,
    familyPayerId: familyAssociation.familyPayerId,
    servicePeriod: "2026-10",
    dueDate: "2026-10-31",
    quoteHash: refreshedFamilyQuote.quoteHash!,
    idempotencyKey: "monthly-invoice-issue-001",
    actor: owner,
  };
  const concurrentMonthlyIssues = await Promise.all([
    issueMonthlyInvoice(monthlyCommand),
    issueMonthlyInvoice({
      ...monthlyCommand,
      idempotencyKey: "monthly-invoice-issue-concurrent-002",
    }),
  ]);
  const issuedMonthlyInvoice = concurrentMonthlyIssues[0];
  assert.equal(
    concurrentMonthlyIssues[1].invoice.id,
    issuedMonthlyInvoice.invoice.id
  );
  assert.deepEqual(
    concurrentMonthlyIssues.map((item) => item.replayed).sort(),
    [false, true]
  );
  assert.equal(issuedMonthlyInvoice.invoice.totalAmountCents, 24500);
  assert.equal(
    issuedMonthlyInvoice.invoice.dueAt.toISOString(),
    "2026-10-31T22:59:59.999Z"
  );
  assert.equal(
    await count(
      "zaltyko.invoice_lines",
      `invoice_id = '${issuedMonthlyInvoice.invoice.id}' and line_type = 'monthly_fee'`
    ),
    2,
    "La factura contiene una línea por inscripción activa"
  );
  assert.equal(
    await count(
      "zaltyko.invoices",
      `family_id = '${familyAssociation.family.id}' and id = '${issuedMonthlyInvoice.invoice.id}'`
    ),
    1
  );
  const monthlyRetry = await issueMonthlyInvoice(monthlyCommand);
  assert.equal(monthlyRetry.invoice.id, issuedMonthlyInvoice.invoice.id);
  await expectOperationalError(
    () =>
      issueMonthlyInvoice({
        ...monthlyCommand,
        locationId: ID.locationA2,
      }),
    "IDEMPOTENCY_CONFLICT"
  );
  const monthlyAlternateKeyRetry = await issueMonthlyInvoice({
    ...monthlyCommand,
    idempotencyKey: "monthly-invoice-issue-002",
  });
  assert.equal(
    monthlyAlternateKeyRetry.invoice.id,
    issuedMonthlyInvoice.invoice.id
  );
  assert.equal(monthlyAlternateKeyRetry.replayed, true);
  const monthlyCharge = await pool.query(
    "select collection_mode from zaltyko.charges where invoice_id = $1",
    [issuedMonthlyInvoice.invoice.id]
  );
  assert.equal(monthlyCharge.rows[0].collection_mode, "manual");
  assert.equal(
    await count(
      "zaltyko.charges",
      `invoice_id = '${issuedMonthlyInvoice.invoice.id}' and status = 'due' and collection_mode = 'manual'`
    ),
    2,
    "Cada línea produce un cargo manual pendiente"
  );
  assert.equal(
    await count(
      "zaltyko.enrollment_price_assignments",
      `organization_id = '${ID.orgA}' and enrollment_id in (${familyQuote!.enrollments.map((enrollment) => `'${enrollment.enrollmentId}'`).join(", ")})`
    ),
    2,
    "Cada inscripción conserva su snapshot tarifario"
  );
  assert.equal(
    await count(
      "zaltyko.payments",
      `family_id = '${familyAssociation.family.id}'`
    ),
    0,
    "La emisión manual no crea cobros ni pagos"
  );
  const chargeToPay = await pool.query<{ id: string; amount_cents: number }>(
    `select id, amount_cents from zaltyko.charges
     where organization_id = $1 and invoice_id = $2 order by id limit 1`,
    [ID.orgA, issuedMonthlyInvoice.invoice.id]
  );
  await recordManualPaymentForCharge({
    organizationId: ID.orgA,
    chargeId: chargeToPay.rows[0].id,
    amountCents: Number(chargeToPay.rows[0].amount_cents),
    method: "bank_transfer",
    receivedAt: new Date().toISOString(),
    idempotencyKey: "monthly-invoice-payment-001",
    actor: owner,
  });
  const paidMonthlyRetry = await issueMonthlyInvoice(monthlyCommand);
  assert.equal(paidMonthlyRetry.replayed, true);
  assert.equal(paidMonthlyRetry.invoice.status, "partially_paid");
  assert.equal(paidMonthlyRetry.chargeStatus, "mixed");
  assert.deepEqual(
    new Set(paidMonthlyRetry.charges.map((charge) => charge.status)),
    new Set(["paid", "due"])
  );
  assert.equal(
    await count(
      "zaltyko.charges",
      `invoice_id = '${issuedMonthlyInvoice.invoice.id}'`
    ),
    2,
    "El replay tras el pago no duplica cargos"
  );
  assert.equal(
    await count(
      "zaltyko.payments",
      `family_id = '${familyAssociation.family.id}'`
    ),
    1,
    "El replay tras el pago no duplica el pago registrado"
  );

  const transferredBilledEnrollment = await transferEnrollment({
    organizationId: ID.orgA,
    enrollmentId: concurrentEnrollment.id,
    expectedVersion: concurrentEnrollment.version,
    targetLocationId: ID.locationA2,
    targetClassTemplateId: ID.templateTarget,
    startsOn: "2026-10-01",
    idempotencyKey: "monthly-site-isolation-transfer",
    actor: owner,
  });
  await assignEnrollmentPrice({
    organizationId: ID.orgA,
    locationId: ID.locationA2,
    enrollmentId: transferredBilledEnrollment.target.id,
    pricePlanId: ID.pricePlanMonthly,
    startsOn: "2026-10-01",
    idempotencyKey: "monthly-site-isolation-price",
    actor: owner,
  });
  const secondSiteOptions = await getMonthlyInvoiceOptions({
    organizationId: ID.orgA,
    locationId: ID.locationA2,
    servicePeriod: "2026-10",
    actor: owner,
  });
  const secondSiteFamily = secondSiteOptions.families.find(
    (family) => family.familyId === familyAssociation.family.id
  );
  assert.equal(
    secondSiteFamily?.canIssue,
    true,
    JSON.stringify(secondSiteFamily)
  );
  assert.equal(secondSiteFamily?.existingInvoiceId, null);

  await expectOperationalError(
    () =>
      issueMonthlyInvoice({
        ...monthlyCommand,
        quoteHash: "f".repeat(64),
        idempotencyKey: "monthly-invoice-conflict-001",
      }),
    "PERIOD_ALREADY_INVOICED"
  );
  await pool.query(
    "update zaltyko.invoices set status = 'void', voided_at = now() where id = $1",
    [issuedMonthlyInvoice.invoice.id]
  );
  await expectOperationalError(
    () =>
      issueMonthlyInvoice({
        ...monthlyCommand,
        idempotencyKey: "monthly-invoice-voided-001",
      }),
    "INVOICE_VOIDED"
  );

  await expectOperationalError(
    () =>
      assignEnrollmentPrice({
        organizationId: ID.orgA,
        locationId: ID.locationA,
        enrollmentId: concurrentEnrollment.id,
        pricePlanId: ID.pricePlanAnnual,
        startsOn: "2026-10-13",
        idempotencyKey: "assignment-invalid-annual-price-plan",
        actor: owner,
      }),
    "PRICE_PLAN_NOT_AVAILABLE"
  );

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

  await pool.query(
    `insert into zaltyko.sessions (
       id, organization_id, location_id, class_template_id, status, starts_at, ends_at
     ) values ($1, $2, $3, $4, 'scheduled', '2026-10-05T15:00:00Z', '2026-10-05T16:00:00Z')`,
    [ID.sessionNorth, ID.orgA, ID.locationA2, ID.templateTarget]
  );

  await expectOperationalError(
    () =>
      resolveSessionAttendanceAccess({
        userId: outsider.userId,
        organizationId: ID.orgB,
        locationId: ID.locationB,
        sessionId: generated[0].id,
      }),
    "NOT_FOUND"
  );
  await expectOperationalError(
    () =>
      resolveSessionAttendanceAccess({
        userId: manager.userId,
        organizationId: ID.orgA,
        locationId: ID.locationA2,
        sessionId: ID.sessionNorth,
      }),
    "LOCATION_SCOPE_DENIED"
  );
  await expectOperationalError(
    () =>
      resolveSessionAttendanceAccess({
        userId: coach.userId,
        organizationId: ID.orgA,
        locationId: ID.locationA,
        sessionId: generated[0].id,
      }),
    "FORBIDDEN"
  );

  const initialRoster = await getOwnerSessionAttendance({
    userId: owner.userId,
    organizationId: ID.orgA,
    locationId: ID.locationA,
    sessionId: generated[0].id,
  });
  assert.deepEqual(
    initialRoster.map(({ enrollmentId, attendanceStatus }) => ({
      enrollmentId,
      attendanceStatus,
    })),
    [{ enrollmentId: attendanceEnrollment.id, attendanceStatus: null }]
  );

  await expectOperationalError(
    () =>
      recordAttendance({
        organizationId: ID.orgA,
        expectedLocationId: ID.locationA2,
        sessionId: generated[0].id,
        enrollmentId: attendanceEnrollment.id,
        status: "present",
        idempotencyKey: "attendance-wrong-location",
        actor: owner,
      }),
    "NOT_FOUND"
  );

  await pool.query(
    `update zaltyko.enrollments set status = 'pending' where organization_id = $1 and id = $2`,
    [ID.orgA, attendanceEnrollment.id]
  );
  await expectOperationalError(
    () =>
      recordAttendance({
        organizationId: ID.orgA,
        sessionId: generated[0].id,
        enrollmentId: attendanceEnrollment.id,
        status: "present",
        idempotencyKey: "attendance-pending-enrollment",
        actor: owner,
      }),
    "INVALID_STATE_TRANSITION"
  );
  await pool.query(
    `update zaltyko.enrollments set status = 'active' where organization_id = $1 and id = $2`,
    [ID.orgA, attendanceEnrollment.id]
  );

  await pool.query(
    `update zaltyko.enrollments e
       set ends_on = (s.starts_at at time zone l.timezone)::date
      from zaltyko.sessions s
      join zaltyko.locations l on l.organization_id = s.organization_id and l.id = s.location_id
     where e.organization_id = $1 and e.id = $2 and s.id = $3`,
    [ID.orgA, attendanceEnrollment.id, generated[0].id]
  );
  await expectOperationalError(
    () =>
      recordAttendance({
        organizationId: ID.orgA,
        sessionId: generated[0].id,
        enrollmentId: attendanceEnrollment.id,
        status: "present",
        idempotencyKey: "attendance-expired-enrollment",
        actor: owner,
      }),
    "INVALID_RELATION"
  );
  assert.equal(
    (
      await getOwnerSessionAttendance({
        userId: owner.userId,
        organizationId: ID.orgA,
        locationId: ID.locationA,
        sessionId: generated[0].id,
      })
    ).length,
    0,
    "La lista excluye inscripciones vencidas"
  );
  await pool.query(
    `update zaltyko.enrollments set ends_on = null where organization_id = $1 and id = $2`,
    [ID.orgA, attendanceEnrollment.id]
  );

  const recurringClass = await createScheduledClass({
    organizationId: ID.orgA,
    locationId: ID.locationA,
    programId: ID.program,
    name: "Clase recurrente sintética",
    capacity: 8,
    effectiveFrom: "2026-10-19",
    effectiveTo: null,
    schedule: [
      { isoWeekday: 1, startsAtLocal: "17:00", endsAtLocal: "18:00" },
      { isoWeekday: 3, startsAtLocal: "17:00", endsAtLocal: "18:00" },
    ],
    idempotencyKey: "create-recurring-class-1",
    actor: owner,
  });
  assert(recurringClass.sessionCount > 0);
  assert.equal(
    recurringClass.generatedThrough,
    "2027-02-15",
    "El horizonte inclusivo contiene exactamente 120 días desde la fecha de inicio"
  );
  const recurringClassRetry = await createScheduledClass({
    organizationId: ID.orgA,
    locationId: ID.locationA,
    programId: ID.program,
    name: "Clase recurrente sintética",
    capacity: 8,
    effectiveFrom: "2026-10-19",
    effectiveTo: null,
    schedule: [
      { isoWeekday: 3, startsAtLocal: "17:00", endsAtLocal: "18:00" },
      { isoWeekday: 1, startsAtLocal: "17:00", endsAtLocal: "18:00" },
    ],
    idempotencyKey: "create-recurring-class-1",
    actor: owner,
  });
  assert.equal(
    recurringClassRetry.classTemplate.id,
    recurringClass.classTemplate.id
  );
  assert.equal(recurringClassRetry.sessionCount, recurringClass.sessionCount);
  assert.equal(
    await count(
      "zaltyko.class_templates",
      `id = '${recurringClass.classTemplate.id}'`
    ),
    1,
    "Reintentar el alta de una clase no duplica su plantilla"
  );
  assert.equal(
    await count(
      "zaltyko.sessions",
      `class_template_id = '${recurringClass.classTemplate.id}'`
    ),
    recurringClass.sessionCount,
    "La plantilla y las sesiones se crean una sola vez"
  );
  await expectOperationalError(
    () =>
      createScheduledClass({
        organizationId: ID.orgA,
        locationId: ID.locationA2,
        programId: ID.program,
        name: "Clase fuera de sede",
        capacity: 8,
        effectiveFrom: "2026-10-19",
        effectiveTo: null,
        schedule: [
          { isoWeekday: 1, startsAtLocal: "17:00", endsAtLocal: "18:00" },
        ],
        idempotencyKey: "class-out-of-location-scope",
        actor: manager,
      }),
    "LOCATION_SCOPE_DENIED"
  );
  const classEvent = await pool.query(
    `select payload from zaltyko.outbox_events where organization_id = $1 and event_name = 'class_template.created' and idempotency_key = $2`,
    [ID.orgA, "create-recurring-class-1"]
  );
  assert.equal(classEvent.rowCount, 1);
  assert.equal("name" in classEvent.rows[0].payload, false);

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
  const rosterAfterAttendance = await getOwnerSessionAttendance({
    userId: owner.userId,
    organizationId: ID.orgA,
    locationId: ID.locationA,
    sessionId: generated[0].id,
  });
  assert.equal(
    rosterAfterAttendance.find(
      (item) => item.enrollmentId === attendanceEnrollment.id
    )?.attendanceStatus,
    "present"
  );
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
      (select count(*)::int from zaltyko.audit_log
       where action = 'owner_surface.access_denied') as access_denied_count,
      (select count(*)::int from zaltyko.enrollment_status_history) as history_count,
      (select count(*)::int from zaltyko.enrollment_status_history where effective_on is null)
        as missing_effective_date_count
  `);
  assert.equal(
    integrity.rows[0].outbox_count + integrity.rows[0].access_denied_count,
    integrity.rows[0].audit_count + 1,
    "Los eventos y auditorías coinciden salvo las denegaciones de acceso auditadas sin evento"
  );
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
