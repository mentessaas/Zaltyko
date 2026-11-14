import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { getOwnerSummaryCharts } from "@/modules/owner-dashboard/application/summary-charts";
import {
  addMonths,
  localIsoDate,
  monthStart,
} from "@/modules/owner-dashboard/domain/summary-charts-model";

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

async function seedFixture() {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const madridId = randomUUID();
  const sevillaId = randomUUID();
  const fullClassId = randomUUID();
  const openClassId = randomUUID();
  const personIds = Array.from({ length: 3 }, () => randomUUID());
  const athleteIds = Array.from({ length: 3 }, () => randomUUID());
  const enrollmentIds = Array.from({ length: 2 }, () => randomUUID());
  const recentSessionId = randomUUID();
  const olderSessionId = randomUUID();
  const familyId = randomUUID();

  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${`ci-owner-charts-${userId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, default_timezone)
    values (${organizationId}::uuid, ${`CI owner charts ${organizationId}`}, ${MADRID})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone) values
      (${madridId}::uuid, ${organizationId}::uuid, 'qa-charts-madrid', 'QA Madrid', ${MADRID}),
      (${sevillaId}::uuid, ${organizationId}::uuid, 'qa-charts-sevilla', 'QA Sevilla', ${MADRID})
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
      (${fullClassId}::uuid, ${organizationId}::uuid, ${madridId}::uuid,
       'CI charts full class', 2, 'active', current_date - 60),
      (${openClassId}::uuid, ${organizationId}::uuid, ${madridId}::uuid,
       'CI charts open class', 3, 'active', current_date - 60)
  `);
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name) values
      ${sql.join(personIds.map((id, index) => sql`(${id}::uuid, ${organizationId}::uuid, 'CI', ${`Charts ${index}`})`), sql`, `)}
  `);
  // Las tres fichas se crean ahora: son las altas del mes en curso. La tercera
  // no tiene grupo ni inscripción, así que solo cuenta en el agregado.
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id, is_active) values
      ${sql.join(athleteIds.map((id, index) => sql`(${id}::uuid, ${organizationId}::uuid, ${personIds[index]}::uuid, true)`), sql`, `)}
  `);
  const madridToday = sql`(now() at time zone ${MADRID})::date`;
  await db.execute(sql`
    insert into zaltyko.enrollments (
      id, organization_id, location_id, athlete_id, class_template_id, status, starts_on, ends_on, source
    ) values
      (${enrollmentIds[0]}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${athleteIds[0]}::uuid,
       ${fullClassId}::uuid, 'active', ${madridToday} - 30, null, 'owner'),
      (${enrollmentIds[1]}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${athleteIds[1]}::uuid,
       ${fullClassId}::uuid, 'active', ${madridToday} - 30, null, 'owner')
  `);
  // Dos sesiones con 7 días de diferencia: siempre caen en semanas distintas.
  await db.execute(sql`
    insert into zaltyko.sessions (
      id, organization_id, location_id, class_template_id, status, starts_at, ends_at
    ) values
      (${recentSessionId}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${fullClassId}::uuid,
       'scheduled', now() - interval '3 days', now() - interval '3 days' + interval '1 hour'),
      (${olderSessionId}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${fullClassId}::uuid,
       'scheduled', now() - interval '10 days', now() - interval '10 days' + interval '1 hour')
  `);
  await db.execute(sql`
    insert into zaltyko.attendance_records (
      organization_id, location_id, session_id, enrollment_id, athlete_id, status
    ) values
      (${organizationId}::uuid, ${madridId}::uuid, ${recentSessionId}::uuid,
       ${enrollmentIds[0]}::uuid, ${athleteIds[0]}::uuid, 'present'),
      (${organizationId}::uuid, ${madridId}::uuid, ${recentSessionId}::uuid,
       ${enrollmentIds[1]}::uuid, ${athleteIds[1]}::uuid, 'late'),
      (${organizationId}::uuid, ${madridId}::uuid, ${olderSessionId}::uuid,
       ${enrollmentIds[0]}::uuid, ${athleteIds[0]}::uuid, 'absent'),
      (${organizationId}::uuid, ${madridId}::uuid, ${olderSessionId}::uuid,
       ${enrollmentIds[1]}::uuid, ${athleteIds[1]}::uuid, 'excused')
  `);

  await db.execute(sql`
    insert into zaltyko.families (id, organization_id, is_active)
    values (${familyId}::uuid, ${organizationId}::uuid, true)
  `);
  const currentMonth = monthStart(localIsoDate(new Date(), MADRID));
  const previousMonth = addMonths(currentMonth, -1);
  const nextMonth = addMonths(currentMonth, 1);
  // Dos cuotas de este mes (una vencida, otra por vencer), una anulada y una
  // del mes anterior, que no cuentan.
  const charges: Array<{
    chargeId: string;
    status: "due" | "void";
    amount: number;
    dueAt: SQL;
    periodStart: string;
  }> = [
    { chargeId: randomUUID(), status: "due", amount: 1000, dueAt: sql`now() - interval '1 day'`, periodStart: currentMonth },
    { chargeId: randomUUID(), status: "due", amount: 2000, dueAt: sql`now() + interval '5 days'`, periodStart: currentMonth },
    { chargeId: randomUUID(), status: "void", amount: 500, dueAt: sql`now() + interval '5 days'`, periodStart: currentMonth },
    { chargeId: randomUUID(), status: "due", amount: 700, dueAt: sql`now() - interval '20 days'`, periodStart: previousMonth },
  ];
  for (const charge of charges) {
    const invoiceId = randomUUID();
    const lineId = randomUUID();
    const periodEnd = charge.periodStart === currentMonth ? nextMonth : currentMonth;
    await db.execute(sql`
      insert into zaltyko.invoices (
        id, organization_id, location_id, family_id, reference, status,
        currency, total_amount_cents, issued_at, due_at, idempotency_key
      ) values (
        ${invoiceId}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${familyId}::uuid,
        ${`CI-CHARTS-${invoiceId}`}, 'issued', 'EUR', ${charge.amount}, now() - interval '2 days',
        ${charge.dueAt}, ${`ci-charts-invoice-${invoiceId}`}
      )
    `);
    await db.execute(sql`
      insert into zaltyko.invoice_lines (
        id, organization_id, invoice_id, location_id, line_type, quantity,
        unit_amount_cents, amount_cents, currency, service_period_start, service_period_end
      ) values (
        ${lineId}::uuid, ${organizationId}::uuid, ${invoiceId}::uuid, ${madridId}::uuid,
        'ci_charts_fee', 1, ${charge.amount}, ${charge.amount}, 'EUR',
        ${charge.periodStart}::date, ${periodEnd}::date - 1
      )
    `);
    await db.execute(sql`
      insert into zaltyko.charges (
        id, organization_id, location_id, invoice_id, invoice_line_id, family_id,
        status, amount_cents, currency, due_at, service_period_start, service_period_end,
        idempotency_key
      ) values (
        ${charge.chargeId}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${invoiceId}::uuid,
        ${lineId}::uuid, ${familyId}::uuid, ${charge.status}::zaltyko.charge_status, ${charge.amount},
        'EUR', ${charge.dueAt}, ${charge.periodStart}::date, ${periodEnd}::date - 1,
        ${`ci-charts-charge-${charge.chargeId}`}
      )
    `);
  }
  // 400 de los 1000 vencidos ya están cobrados.
  const paymentId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.payments (
      id, organization_id, location_id, family_id, status, amount_cents, currency,
      processor, environment, provider_payment_id, received_at, idempotency_key
    ) values (
      ${paymentId}::uuid, ${organizationId}::uuid, ${madridId}::uuid, ${familyId}::uuid,
      'succeeded', 400, 'EUR', 'local', 'sandbox', ${`ci-charts-pay-${paymentId}`},
      now() - interval '1 hour', ${`ci-charts-pay-${paymentId}`}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.payment_allocations (
      id, organization_id, payment_id, charge_id, amount_cents, currency,
      allocated_at, idempotency_key
    ) values (
      ${randomUUID()}::uuid, ${organizationId}::uuid, ${paymentId}::uuid, ${charges[0].chargeId}::uuid,
      400, 'EUR', now() - interval '1 hour', ${`ci-charts-alloc-${paymentId}`}
    )
  `);

  return { organizationId, userId, madridId, sevillaId, fullClassId, openClassId };
}

describe("Owner summary charts on disposable PostgreSQL", () => {
  it("builds attendance, occupancy, monthly fees and sign-ups from persisted rows", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    const scope = await resolveOwnerScope({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
    });

    const charts = await getOwnerSummaryCharts({ scope, includeFinancials: true });

    expect(charts.timezone).toBe(MADRID);
    expect(charts.attendance.state).toBe("ready");
    expect(charts.attendance.totals).toEqual({ attended: 2, missed: 2, records: 4, sessions: 2 });
    expect(charts.attendance.rate).toBe(0.5);
    const weeksWithList = charts.attendance.weeks.filter((week) => week.records > 0);
    expect(weeksWithList).toHaveLength(2);
    expect(weeksWithList.map((week) => [week.present, week.late, week.excused, week.absent])).toEqual([
      [0, 0, 1, 1],
      [1, 1, 0, 0],
    ]);

    expect(charts.occupancy.state).toBe("ready");
    expect(charts.occupancy.totals).toEqual({ classes: 2, capacity: 5, enrolled: 2, full: 1 });
    expect(charts.occupancy.items.map((item) => [item.classTemplateId, item.enrolled, item.capacity, item.status])).toEqual([
      [fixture.fullClassId, 2, 2, "full"],
      [fixture.openClassId, 0, 3, "open"],
    ]);

    expect(charts.fees.state).toBe("ready");
    expect(charts.fees.currencies).toHaveLength(1);
    expect(charts.fees.currencies[0]).toMatchObject({
      currency: "EUR",
      charges: 2,
      billedCents: 3000,
      collectedCents: 400,
      pendingCents: 2000,
      overdueCents: 600,
    });

    expect(charts.signups.state).toBe("ready");
    expect(charts.signups.currentMonth).toBe(3);
    expect(charts.signups.total).toBe(3);
  });

  it("narrows every chart to one site and hides fees without financial access", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();

    const madridScope = await resolveOwnerScope({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.madridId,
    });
    const madrid = await getOwnerSummaryCharts({
      scope: madridScope,
      locationId: fixture.madridId,
      includeFinancials: false,
    });
    expect(madrid.fees.state).toBe("unavailable");
    expect(madrid.attendance.totals.records).toBe(4);
    // Solo las fichas con inscripción o grupo en Madrid.
    expect(madrid.signups.currentMonth).toBe(2);

    const sevillaScope = await resolveOwnerScope({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.sevillaId,
    });
    const sevilla = await getOwnerSummaryCharts({
      scope: sevillaScope,
      locationId: fixture.sevillaId,
      includeFinancials: true,
    });
    expect(sevilla.attendance.state).toBe("empty");
    expect(sevilla.occupancy.state).toBe("no_classes");
    expect(sevilla.fees.state).toBe("empty");
    expect(sevilla.signups.state).toBe("empty");
    // UUID-isolated fixtures remain until the runner destroys the whole
    // disposable database.
  });
});
