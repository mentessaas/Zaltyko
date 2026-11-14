import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getOwnerAttentionItems } from "@/modules/owner-dashboard/application/attention-items";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { getOwnerTodaySessions } from "@/modules/owner-dashboard/application/today-sessions";
import { getOwnerCalendar } from "@/modules/scheduling/application/calendar-sessions";
import {
  addDays,
  groupSessionsByLocalDate,
  localDateOf,
  todayIn,
} from "@/modules/scheduling/domain/calendar";

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
  let parsed: URL;
  try {
    parsed = new URL(connectionString ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  const configuredUrls = [
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_POOL,
    process.env.DATABASE_URL_DIRECT,
  ];
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

const MADRID = "Europe/Madrid";
const MEXICO = "America/Mexico_City";

function localToday(timezone: string, minuteOfDay: number) {
  return sql`((date_trunc('day', now() at time zone ${timezone}) + make_interval(mins => ${minuteOfDay})) at time zone ${timezone})`;
}

async function seedFixture() {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const madridId = randomUUID();
  const mexicoId = randomUUID();
  const fullTemplateId = randomUUID();
  const overrideTemplateId = randomUUID();
  const mexicoTemplateId = randomUUID();
  const personIds = Array.from({ length: 4 }, () => randomUUID());
  const athleteIds = Array.from({ length: 4 }, () => randomUUID());
  const ids = {
    morning: randomUUID(),
    cancelled: randomUUID(),
    override: randomUUID(),
    mexico: randomUUID(),
    yesterday: randomUUID(),
    tooOld: randomUUID(),
  };
  const enrollmentIds = Array.from({ length: 5 }, () => randomUUID());
  const familyId = randomUUID();

  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${`ci-owner-today-${userId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${`CI owner today ${organizationId}`})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone) values
      (${madridId}::uuid, ${organizationId}::uuid, 'qa-madrid', 'QA Madrid', ${MADRID}),
      (${mexicoId}::uuid, ${organizationId}::uuid, 'qa-cdmx', 'QA CDMX', ${MEXICO})
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      ${randomUUID()}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'owner', 'active', 'all'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    ) values
      (${fullTemplateId}::uuid, ${organizationId}::uuid, ${madridId}::uuid,
       'CI full class', 2, 'active', current_date - 30),
      (${overrideTemplateId}::uuid, ${organizationId}::uuid, ${madridId}::uuid,
       'CI override class', 1, 'active', current_date - 30),
      (${mexicoTemplateId}::uuid, ${organizationId}::uuid, ${mexicoId}::uuid,
       'CI mexico class', 10, 'active', current_date - 30)
  `);
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name) values
      ${sql.join(personIds.map((id, index) => sql`(${id}::uuid, ${organizationId}::uuid, 'CI', ${`Athlete ${index}`})`), sql`, `)}
  `);
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id, is_active) values
      (${athleteIds[0]}::uuid, ${organizationId}::uuid, ${personIds[0]}::uuid, true),
      (${athleteIds[1]}::uuid, ${organizationId}::uuid, ${personIds[1]}::uuid, true),
      (${athleteIds[2]}::uuid, ${organizationId}::uuid, ${personIds[2]}::uuid, false),
      (${athleteIds[3]}::uuid, ${organizationId}::uuid, ${personIds[3]}::uuid, true)
  `);
  const madridToday = sql`(now() at time zone ${MADRID})::date`;
  await db.execute(sql`
    insert into zaltyko.enrollments (
      id, organization_id, location_id, athlete_id, class_template_id, status, starts_on, ends_on, source
    ) values
      (${enrollmentIds[0]}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${athleteIds[0]}::uuid,
       ${fullTemplateId}::uuid, 'active', ${madridToday} - 10, null, 'owner'),
      (${enrollmentIds[1]}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${athleteIds[1]}::uuid,
       ${fullTemplateId}::uuid, 'trial', ${madridToday} - 10, null, 'owner'),
      (${enrollmentIds[2]}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${athleteIds[2]}::uuid,
       ${fullTemplateId}::uuid, 'active', ${madridToday} - 10, null, 'owner'),
      (${enrollmentIds[3]}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${athleteIds[3]}::uuid,
       ${fullTemplateId}::uuid, 'active', ${madridToday} - 10, ${madridToday}, 'owner'),
      (${enrollmentIds[4]}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${athleteIds[0]}::uuid,
       ${overrideTemplateId}::uuid, 'active', ${madridToday} - 10, null, 'owner')
  `);
  await db.execute(sql`
    insert into zaltyko.sessions (
      id, organization_id, location_id, class_template_id, status, starts_at, ends_at, capacity_override
    ) values
      (${ids.morning}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${fullTemplateId}::uuid,
       'scheduled', ${localToday(MADRID, 1)}, ${localToday(MADRID, 2)}, null),
      (${ids.cancelled}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${fullTemplateId}::uuid,
       'cancelled', ${localToday(MADRID, 1438)}, ${localToday(MADRID, 1439)}, null),
      (${ids.override}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${overrideTemplateId}::uuid,
       'scheduled', ${localToday(MADRID, 1437)}, ${localToday(MADRID, 1439)}, 3),
      (${ids.mexico}::uuid, ${organizationId}::uuid, ${mexicoId}::uuid, ${mexicoTemplateId}::uuid,
       'scheduled', ${localToday(MEXICO, 1438)}, ${localToday(MEXICO, 1439)}, null),
      (${ids.yesterday}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${fullTemplateId}::uuid,
       'scheduled', now() - interval '30 hours', now() - interval '29 hours', null),
      (${ids.tooOld}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${fullTemplateId}::uuid,
       'scheduled', now() - interval '10 days', now() - interval '10 days' + interval '1 hour', null)
  `);
  await db.execute(sql`
    insert into zaltyko.attendance_records (
      organization_id, location_id, session_id, enrollment_id, athlete_id, status
    ) values (
      ${organizationId}::uuid, ${madridId}::uuid, ${ids.morning}::uuid,
      ${enrollmentIds[0]}::uuid, ${athleteIds[0]}::uuid, 'present'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.families (id, organization_id) values (${familyId}::uuid, ${organizationId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.invoices (
      id, organization_id, location_id, family_id, reference, status,
      currency, total_amount_cents, issued_at, due_at, idempotency_key
    ) values
      (${randomUUID()}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${familyId}::uuid,
       ${`CI-TODAY-${organizationId}-1`}, 'issued', 'EUR', 1000, now() - interval '20 days',
       now() - interval '1 day', ${`ci-today-${organizationId}-1`}),
      (${randomUUID()}::uuid, ${organizationId}::uuid, null, ${familyId}::uuid,
       ${`CI-TODAY-${organizationId}-2`}, 'partially_paid', 'EUR', 1000, now() - interval '20 days',
       now() - interval '1 day', ${`ci-today-${organizationId}-2`}),
      (${randomUUID()}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${familyId}::uuid,
       ${`CI-TODAY-${organizationId}-3`}, 'issued', 'EUR', 1000, now() - interval '1 day',
       now() + interval '5 days', ${`ci-today-${organizationId}-3`})
  `);

  return { organizationId, userId, madridId, mexicoId, fullTemplateId, ids };
}

describe("Owner today sessions and attention items on disposable PostgreSQL", () => {
  it("lists today's sessions per location timezone with the attendance roster rule", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    const scope = await resolveOwnerScope({ userId: fixture.userId, organizationId: fixture.organizationId });

    const today = await getOwnerTodaySessions({ scope });
    const byId = new Map(today.sessions.map((session) => [session.id, session]));
    expect([...byId.keys()].sort()).toEqual(
      [fixture.ids.morning, fixture.ids.cancelled, fixture.ids.override, fixture.ids.mexico].sort()
    );
    expect(today.truncated).toBe(false);
    expect(byId.get(fixture.ids.morning)).toMatchObject({
      status: "scheduled",
      capacity: 2,
      expectedAthletes: 2,
      recordedAttendance: 1,
      timezone: MADRID,
    });
    expect(byId.get(fixture.ids.cancelled)).toMatchObject({ status: "cancelled" });
    expect(byId.get(fixture.ids.override)).toMatchObject({ capacity: 3, expectedAthletes: 1 });
    expect(byId.get(fixture.ids.mexico)).toMatchObject({ timezone: MEXICO, expectedAthletes: 0 });

    const mexicoScope = await resolveOwnerScope({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.mexicoId,
    });
    const mexicoOnly = await getOwnerTodaySessions({ scope: mexicoScope, locationId: fixture.mexicoId });
    expect(mexicoOnly.sessions.map((session) => session.id)).toEqual([fixture.ids.mexico]);
  });

  it("reads the calendar by local day per location, with groups, occupancy and location/group filters", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    const groupId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.groups (id, organization_id, location_id, name)
      values (${groupId}::uuid, ${fixture.organizationId}::uuid, ${fixture.madridId}::uuid, 'CI grupo competición')
    `);
    await db.execute(sql`
      insert into zaltyko.class_template_groups (organization_id, class_template_id, group_id)
      values (${fixture.organizationId}::uuid, ${fixture.fullTemplateId}::uuid, ${groupId}::uuid)
    `);
    const scope = await resolveOwnerScope({ userId: fixture.userId, organizationId: fixture.organizationId });
    const madridToday = todayIn(MADRID);
    const wide = { from: addDays(madridToday, -3), to: addDays(madridToday, 3) };

    const calendar = await getOwnerCalendar({ scope, ...wide });
    const byId = new Map(calendar.sessions.map((session) => [session.id, session]));
    // Dentro del rango: hoy en ambas sedes y ayer; fuera: la de hace 10 días.
    expect([...byId.keys()].sort()).toEqual(
      [fixture.ids.morning, fixture.ids.cancelled, fixture.ids.override, fixture.ids.mexico, fixture.ids.yesterday].sort()
    );
    expect(calendar.truncated).toBe(false);
    expect(calendar.locations.map((location) => location.timezone).sort()).toEqual([MEXICO, MADRID].sort());
    expect(calendar.groups).toEqual([{ id: groupId, name: "CI grupo competición", locationId: fixture.madridId }]);
    expect(byId.get(fixture.ids.morning)).toMatchObject({
      status: "scheduled",
      capacity: 2,
      expectedAthletes: 2,
      recordedAttendance: 1,
      timezone: MADRID,
      className: "CI full class",
      groups: [{ id: groupId, name: "CI grupo competición" }],
    });
    expect(byId.get(fixture.ids.cancelled)).toMatchObject({ status: "cancelled" });
    expect(byId.get(fixture.ids.override)).toMatchObject({ capacity: 3, expectedAthletes: 1, groups: [] });
    expect(byId.get(fixture.ids.mexico)).toMatchObject({ timezone: MEXICO, groups: [] });

    // Cada sesión cae en el día local de SU sede, no en el del servidor.
    const grouped = groupSessionsByLocalDate(calendar.sessions);
    expect(grouped.get(todayIn(MEXICO))?.map((session) => session.id)).toContain(fixture.ids.mexico);
    expect(grouped.get(madridToday)?.map((session) => session.id)).toEqual(
      expect.arrayContaining([fixture.ids.morning, fixture.ids.cancelled, fixture.ids.override])
    );
    for (const session of calendar.sessions) {
      const day = localDateOf(session.startsAt, session.timezone);
      expect(day >= wide.from && day <= wide.to).toBe(true);
    }

    // Un solo día: el filtro exacto usa el día local de cada sede.
    const oneDay = await getOwnerCalendar({ scope, from: madridToday, to: madridToday });
    expect(oneDay.sessions.map((session) => session.id).sort()).toEqual(
      [
        fixture.ids.morning,
        fixture.ids.cancelled,
        fixture.ids.override,
        ...(todayIn(MEXICO) === madridToday ? [fixture.ids.mexico] : []),
      ].sort()
    );

    const mexicoScope = await resolveOwnerScope({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.mexicoId,
    });
    const mexicoOnly = await getOwnerCalendar({ scope: mexicoScope, ...wide, locationId: fixture.mexicoId });
    expect(mexicoOnly.sessions.map((session) => session.id)).toEqual([fixture.ids.mexico]);

    const groupOnly = await getOwnerCalendar({ scope, ...wide, groupId });
    expect(groupOnly.sessions.map((session) => session.id).sort()).toEqual(
      [fixture.ids.morning, fixture.ids.cancelled, fixture.ids.yesterday].sort()
    );
    const unknownGroup = await getOwnerCalendar({ scope, ...wide, groupId: randomUUID() });
    expect(unknownGroup.sessions).toEqual([]);
  });

  it("counts attention items within scope and only exposes invoices to finance roles", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    const scope = await resolveOwnerScope({ userId: fixture.userId, organizationId: fixture.organizationId });

    const aggregate = await getOwnerAttentionItems({ scope, includeFinancials: true });
    expect(aggregate.unrecordedSessions.count).toBe(1);
    expect(aggregate.unrecordedSessions.latest).toEqual({
      id: fixture.ids.yesterday,
      locationId: fixture.madridId,
      className: "CI full class",
    });
    expect(aggregate.fullClasses).toBe(1);
    expect(aggregate.overdueInvoices).toBe(2);

    const madridScope = await resolveOwnerScope({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.madridId,
    });
    const madridOnly = await getOwnerAttentionItems({
      scope: madridScope,
      locationId: fixture.madridId,
      includeFinancials: true,
    });
    expect(madridOnly.overdueInvoices).toBe(1);

    const withoutFinances = await getOwnerAttentionItems({ scope, includeFinancials: false });
    expect(withoutFinances.overdueInvoices).toBeNull();
    // UUID-isolated fixtures remain until the runner destroys the whole
    // disposable database.
  });
});
