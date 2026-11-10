/**
 * Disposable PostgreSQL tests for the monthly invoice service.
 *
 * They run the real quote and issuance against the real schema, triggers,
 * constraints, row locks and advisory locks. Opt-in: ZALTYKO_PG_INTEGRATION=1
 * on a GitHub Linux runner with a loopback, disposable database (same guard
 * as the other -pg suites).
 *
 * Isolation and determinism:
 * - Every test seeds its own organizations with random UUIDs (and codes and
 *   e-mails derived from them) and only reads rows of those organizations,
 *   so the suite shares the integration database without depending on, or
 *   leaking into, other suites of the batch. Seeded rows are not deleted:
 *   issued ledger rows are immutable by design (invoice_line_enrollments
 *   refuses DELETE) and the database is disposable.
 * - The service month is fixed (December 2026, 31 days), never derived from
 *   the clock, so a run near midnight UTC at a month end cannot change it.
 *
 * Complements tests/billing-ledger-postgres.integration.test.ts, which covers
 * the one-athlete issuance, same-key concurrency, mixed currencies, Free
 * capacity, a stale quote, a class ending mid-month and ledger rollback.
 * Keyset pages and filter batches (more than 200 rows, more than 100 pairs)
 * are covered by the characterization suite: Free allows only 10 classes.
 */
import { createHash, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  getMonthlyInvoiceOptions,
  issueMonthlyInvoice,
} from "@/modules/billing/application/monthly-invoice-service";

const describeDisposablePg = describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1");

function assertDisposableTarget() {
  if (
    process.env.ZALTYKO_PG_INTEGRATION !== "1" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_OS !== "Linux" ||
    process.env.NODE_ENV !== "test"
  ) {
    throw new Error("This suite is restricted to opt-in disposable GitHub Linux PostgreSQL");
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
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
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

// ---------------------------------------------------------------------------
// Fixed service month
// ---------------------------------------------------------------------------

const SERVICE_PERIOD = "2026-12";
const PERIOD_START = "2026-12-01";
const PERIOD_END = "2026-12-31";

// ---------------------------------------------------------------------------
// Fixture: one family, athlete A in two classes and athlete B in one class,
// all on the same monthly plan (3500) with per-enrollment assigned prices.
// ---------------------------------------------------------------------------

type Fixture = Awaited<ReturnType<typeof seedFamily>>;

/**
 * Seeds a new organization. With `endsOnLastDay`, every dated row that must
 * cover the month (enrollments, classes, family memberships, payer, price
 * assignments and tariff coverage) ends exactly on the month's last day.
 */
async function seedFamily(options: { endsOnLastDay?: boolean } = {}) {
  const ids = {
    organizationId: randomUUID(),
    locationId: randomUUID(),
    userId: randomUUID(),
    memberId: randomUUID(),
    familyId: randomUUID(),
    guardianPersonId: randomUUID(),
    guardianId: randomUUID(),
    familyPayerId: randomUUID(),
    pricePlanId: randomUUID(),
    classOneId: randomUUID(),
    classTwoId: randomUUID(),
    athleteA: { personId: randomUUID(), athleteId: randomUUID() },
    athleteB: { personId: randomUUID(), athleteId: randomUUID() },
    enrollmentA1: randomUUID(),
    enrollmentA2: randomUUID(),
    enrollmentB1: randomUUID(),
    assignmentA1: randomUUID(),
    assignmentA2: randomUUID(),
    assignmentB1: randomUUID(),
  };
  const endsOn = options.endsOnLastDay ? PERIOD_END : null;
  const { organizationId: org, locationId: loc } = ids;

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into auth.users (id, email)
      values (${ids.userId}::uuid, ${`ci-monthly-service-${ids.userId}@example.invalid`})
    `);
    await tx.execute(sql`
      insert into zaltyko.organizations (id, name)
      values (${org}::uuid, ${`CI monthly service ${org}`})
    `);
    await tx.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone)
      values (${loc}::uuid, ${org}::uuid, ${`ci-${org.slice(0, 8)}`},
        'CI monthly service site', 'Europe/Madrid')
    `);
    await tx.execute(sql`
      insert into zaltyko.organization_members (
        id, organization_id, user_id, role, status, location_scope_mode
      ) values (${ids.memberId}::uuid, ${org}::uuid, ${ids.userId}::uuid, 'owner', 'active', 'all')
    `);
    await tx.execute(sql`
      insert into zaltyko.families (id, organization_id, is_active)
      values (${ids.familyId}::uuid, ${org}::uuid, true)
    `);
    await tx.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values
        (${ids.athleteA.personId}::uuid, ${org}::uuid, 'Ana', 'CI'),
        (${ids.athleteB.personId}::uuid, ${org}::uuid, 'Bruno', 'CI'),
        (${ids.guardianPersonId}::uuid, ${org}::uuid, 'Laura', 'CI')
    `);
    await tx.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id)
      values
        (${ids.athleteA.athleteId}::uuid, ${org}::uuid, ${ids.athleteA.personId}::uuid),
        (${ids.athleteB.athleteId}::uuid, ${org}::uuid, ${ids.athleteB.personId}::uuid)
    `);
    await tx.execute(sql`
      insert into zaltyko.guardians (id, organization_id, person_id)
      values (${ids.guardianId}::uuid, ${org}::uuid, ${ids.guardianPersonId}::uuid)
    `);
    await tx.execute(sql`
      insert into zaltyko.family_guardians (
        id, organization_id, family_id, guardian_id, relationship, is_active
      ) values (${randomUUID()}::uuid, ${org}::uuid, ${ids.familyId}::uuid,
        ${ids.guardianId}::uuid, 'parent', true)
    `);
    for (const athlete of [ids.athleteA, ids.athleteB]) {
      await tx.execute(sql`
        insert into zaltyko.family_members (
          id, organization_id, family_id, athlete_id, relationship, starts_on, ends_on
        ) values (${randomUUID()}::uuid, ${org}::uuid, ${ids.familyId}::uuid,
          ${athlete.athleteId}::uuid, 'parent', ${PERIOD_START}::date, ${endsOn}::date)
      `);
    }
    await tx.execute(sql`
      insert into zaltyko.family_payers (
        id, organization_id, family_id, guardian_id, is_primary, starts_on, ends_on
      ) values (${ids.familyPayerId}::uuid, ${org}::uuid, ${ids.familyId}::uuid,
        ${ids.guardianId}::uuid, true, ${PERIOD_START}::date, ${endsOn}::date)
    `);
    await tx.execute(sql`
      insert into zaltyko.price_plans (
        id, organization_id, name, cadence, amount_cents, currency, is_active
      ) values (${ids.pricePlanId}::uuid, ${org}::uuid, 'CI monthly tariff',
        'monthly', 3500, 'EUR', true)
    `);
    for (const [classId, name] of [
      [ids.classOneId, "CI class one"],
      [ids.classTwoId, "CI class two"],
    ] as const) {
      await tx.execute(sql`
        insert into zaltyko.class_templates (
          id, organization_id, location_id, name, capacity, status, effective_from, effective_to
        ) values (${classId}::uuid, ${org}::uuid, ${loc}::uuid, ${name}, 20, 'active',
          ${PERIOD_START}::date, ${endsOn}::date)
      `);
      await tx.execute(sql`
        insert into zaltyko.price_plan_class_template_coverage (
          id, organization_id, location_id, price_plan_id, class_template_id, starts_on, ends_on
        ) values (${randomUUID()}::uuid, ${org}::uuid, ${loc}::uuid,
          ${ids.pricePlanId}::uuid, ${classId}::uuid, ${PERIOD_START}::date, ${endsOn}::date)
      `);
    }
    for (const [enrollmentId, athleteId, classId, assignmentId, amount] of [
      [ids.enrollmentA1, ids.athleteA.athleteId, ids.classOneId, ids.assignmentA1, 3000],
      [ids.enrollmentA2, ids.athleteA.athleteId, ids.classTwoId, ids.assignmentA2, 3000],
      [ids.enrollmentB1, ids.athleteB.athleteId, ids.classOneId, ids.assignmentB1, 3200],
    ] as const) {
      await tx.execute(sql`
        insert into zaltyko.enrollments (
          id, organization_id, location_id, athlete_id, class_template_id,
          price_plan_id, status, starts_on, ends_on, source
        ) values (${enrollmentId}::uuid, ${org}::uuid, ${loc}::uuid, ${athleteId}::uuid,
          ${classId}::uuid, ${ids.pricePlanId}::uuid, 'active', ${PERIOD_START}::date,
          ${endsOn}::date, 'owner')
      `);
      await tx.execute(sql`
        insert into zaltyko.enrollment_price_assignments (
          id, organization_id, location_id, enrollment_id, price_plan_id,
          unit_amount_cents, currency, starts_on, ends_on
        ) values (${assignmentId}::uuid, ${org}::uuid, ${loc}::uuid, ${enrollmentId}::uuid,
          ${ids.pricePlanId}::uuid, ${amount}, 'EUR', ${PERIOD_START}::date, ${endsOn}::date)
      `);
    }
  });

  return {
    ...ids,
    actor: { userId: ids.userId, memberId: ids.memberId },
    servicePeriod: SERVICE_PERIOD,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  };
}

/** A second site of the same organization: athlete A also trains there (2800). */
async function seedSecondSite(fixture: Fixture) {
  const site = {
    locationId: randomUUID(),
    classId: randomUUID(),
    enrollmentId: randomUUID(),
    assignmentId: randomUUID(),
  };
  const org = fixture.organizationId;
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone)
      values (${site.locationId}::uuid, ${org}::uuid, ${`ci2-${site.locationId.slice(0, 8)}`},
        'CI monthly service second site', 'Europe/Madrid')
    `);
    await tx.execute(sql`
      insert into zaltyko.class_templates (
        id, organization_id, location_id, name, capacity, status, effective_from
      ) values (${site.classId}::uuid, ${org}::uuid, ${site.locationId}::uuid,
        'CI class second site', 20, 'active', ${PERIOD_START}::date)
    `);
    await tx.execute(sql`
      insert into zaltyko.price_plan_class_template_coverage (
        id, organization_id, location_id, price_plan_id, class_template_id, starts_on
      ) values (${randomUUID()}::uuid, ${org}::uuid, ${site.locationId}::uuid,
        ${fixture.pricePlanId}::uuid, ${site.classId}::uuid, ${PERIOD_START}::date)
    `);
    await tx.execute(sql`
      insert into zaltyko.enrollments (
        id, organization_id, location_id, athlete_id, class_template_id,
        price_plan_id, status, starts_on, source
      ) values (${site.enrollmentId}::uuid, ${org}::uuid, ${site.locationId}::uuid,
        ${fixture.athleteA.athleteId}::uuid, ${site.classId}::uuid, ${fixture.pricePlanId}::uuid,
        'active', ${PERIOD_START}::date, 'owner')
    `);
    await tx.execute(sql`
      insert into zaltyko.enrollment_price_assignments (
        id, organization_id, location_id, enrollment_id, price_plan_id,
        unit_amount_cents, currency, starts_on
      ) values (${site.assignmentId}::uuid, ${org}::uuid, ${site.locationId}::uuid,
        ${site.enrollmentId}::uuid, ${fixture.pricePlanId}::uuid, 2800, 'EUR', ${PERIOD_START}::date)
    `);
  });
  return site;
}

async function quoteFor(fixture: Fixture, locationId = fixture.locationId) {
  const options = await getMonthlyInvoiceOptions({
    organizationId: fixture.organizationId,
    locationId,
    servicePeriod: fixture.servicePeriod,
    actor: fixture.actor,
  });
  const family = options.families.find((item) => item.familyId === fixture.familyId);
  if (!family) throw new Error("The seeded family is missing from the quote");
  return family;
}

function issueCommand(
  fixture: Fixture,
  quoteHash: string,
  idempotencyKey = `ci-monthly-${randomUUID()}`,
  locationId = fixture.locationId
) {
  return {
    organizationId: fixture.organizationId,
    locationId,
    familyId: fixture.familyId,
    familyPayerId: fixture.familyPayerId,
    servicePeriod: fixture.servicePeriod,
    dueDate: fixture.periodEnd,
    quoteHash,
    idempotencyKey,
    actor: fixture.actor,
  };
}

// Plain code-unit order, independent of locale collation.
function byAthleteId(left: { athleteId: string }, right: { athleteId: string }) {
  if (left.athleteId === right.athleteId) return 0;
  return left.athleteId < right.athleteId ? -1 : 1;
}

/** The quote lines in a stable, named shape. */
function quotedLines(family: Awaited<ReturnType<typeof quoteFor>>) {
  return family.lines
    .map((line) => ({
      athleteId: line.athleteId,
      pricePlanId: line.pricePlanId,
      amountCents: line.amountCents,
      currency: line.currency,
      coveredEnrollmentIds: line.coveredEnrollments.map((covered) => covered.enrollmentId).sort(),
    }))
    .sort(byAthleteId);
}

/** The lines the default fixture must quote: A at 3000 for two classes, B at 3200. */
function expectedLines(fixture: Fixture) {
  return [
    {
      athleteId: fixture.athleteA.athleteId,
      pricePlanId: fixture.pricePlanId,
      amountCents: 3000,
      currency: "EUR",
      coveredEnrollmentIds: [fixture.enrollmentA1, fixture.enrollmentA2].sort(),
    },
    {
      athleteId: fixture.athleteB.athleteId,
      pricePlanId: fixture.pricePlanId,
      amountCents: 3200,
      currency: "EUR",
      coveredEnrollmentIds: [fixture.enrollmentB1],
    },
  ].sort(byAthleteId);
}

async function ledgerRows(organizationId: string) {
  const result = await db.execute(sql`
    select
      (select count(*)::int from zaltyko.invoices where organization_id = ${organizationId}::uuid) as invoices,
      (select count(*)::int from zaltyko.invoice_lines where organization_id = ${organizationId}::uuid) as lines,
      (select count(*)::int from zaltyko.invoice_line_enrollments where organization_id = ${organizationId}::uuid) as covered,
      (select count(*)::int from zaltyko.charges where organization_id = ${organizationId}::uuid) as charges,
      (select count(*)::int from zaltyko.outbox_events
        where organization_id = ${organizationId}::uuid and event_name = 'invoice.monthly_issued') as markers
  `);
  return result.rows[0];
}

/**
 * Reference the service must give the fixture family's December invoice at a
 * site, written out independently of the service.
 */
function expectedReference(fixture: Fixture, locationId: string) {
  const siteHash = createHash("sha256")
    .update(`zaltyko:monthly-invoice-site:v1:${locationId}`)
    .digest("hex")
    .slice(0, 16);
  return `MENSUAL-202612-${fixture.familyId}-${siteHash}`;
}

/** Reference format used before the site discriminator. */
function legacyReference(fixture: Fixture) {
  return `MENSUAL-202612-${fixture.familyId}`;
}

/**
 * Turns an issued invoice into one issued by the previous code: every row is
 * the one the service wrote, only the reference goes back to the old format.
 */
async function useLegacyReference(fixture: Fixture, invoiceId: string) {
  const updated = await db.execute(sql`
    update zaltyko.invoices set reference = ${legacyReference(fixture)}
    where organization_id = ${fixture.organizationId}::uuid and id = ${invoiceId}::uuid
    returning id
  `);
  expect(updated.rows).toHaveLength(1);
}

function byReference(left: { reference: string }, right: { reference: string }) {
  if (left.reference === right.reference) return 0;
  return left.reference < right.reference ? -1 : 1;
}

async function invoiceReferences(fixture: Fixture) {
  const result = await db.execute(sql`
    select location_id::text as location_id, reference
    from zaltyko.invoices
    where organization_id = ${fixture.organizationId}::uuid
  `);
  return result.rows
    .map((row) => ({ locationId: String(row.location_id), reference: String(row.reference) }))
    .sort(byReference);
}

/** Header, lines and charges of one invoice, to prove another issuance left it alone. */
async function invoiceSnapshot(fixture: Fixture, invoiceId: string) {
  const result = await db.execute(sql`
    select i.location_id::text as location_id, i.reference, i.status::text as status,
      i.total_amount_cents::int as total_amount_cents, i.version::int as version,
      (select count(*)::int from zaltyko.invoice_lines il
        where il.organization_id = i.organization_id and il.invoice_id = i.id) as lines,
      (select coalesce(sum(c.amount_cents), 0)::int from zaltyko.charges c
        where c.organization_id = i.organization_id and c.invoice_id = i.id) as charged_cents
    from zaltyko.invoices i
    where i.organization_id = ${fixture.organizationId}::uuid and i.id = ${invoiceId}::uuid
  `);
  expect(result.rows).toHaveLength(1);
  return result.rows[0];
}

const NO_LEDGER_ROWS ={ invoices: 0, lines: 0, covered: 0, charges: 0, markers: 0 };
/** One invoice for the default fixture: two lines, three covered classes, two charges. */
const ONE_INVOICE = { invoices: 1, lines: 2, covered: 3, charges: 2, markers: 1 };
/** ONE_INVOICE at the first site plus athlete A's single-class invoice at the second site. */
const TWO_SITE_INVOICES = { invoices: 2, lines: 3, covered: 4, charges: 3, markers: 2 };

/**
 * Waits until `expected` other sessions are blocked on the organization row
 * lock taken by lockCommand (lockOrganizationForSaasMutation).
 */
async function waitForOrganizationLockWaiters(expected: number) {
  const deadline = Date.now() + 15_000;
  let waiting = 0;
  while (Date.now() < deadline) {
    const result = await db.execute(sql`
      select count(*)::int as waiting
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and wait_event_type = 'Lock'
        and query like ${"%from zaltyko.organizations%for update%"}
    `);
    waiting = Number(result.rows[0]?.waiting ?? 0);
    if (waiting >= expected) return waiting;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Only ${waiting} of ${expected} issuances reached the organization lock`);
}

describeDisposablePg("monthly invoice service on disposable PostgreSQL", () => {
  beforeEach(() => {
    assertDisposableTarget();
  });

  it("issues one fee per athlete at the assigned price and covers every class", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);
    expect(family.canIssue).toBe(true);
    // One fee per athlete, at the assignment price (3000 / 3200), not the plan's 3500,
    // covering every class of that athlete. Both sides are sorted explicitly.
    expect(quotedLines(family)).toEqual(expectedLines(fixture));
    expect(family.totalAmountCents).toBe(6200);

    const issued = await issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!));
    expect(issued.replayed).toBe(false);
    expect(issued.invoice).toMatchObject({ status: "issued", currency: "EUR", totalAmountCents: 6200 });
    expect(issued.charges).toHaveLength(2);
    expect(issued.chargeStatus).toBe("due");
    expect(await ledgerRows(fixture.organizationId)).toEqual(ONE_INVOICE);

    const persisted = await db.execute(sql`
      select coalesce(il.athlete_id::text, '') as athlete_id, il.amount_cents::int as amount_cents,
        c.amount_cents::int as charge_cents, c.collection_mode::text as collection_mode,
        il.service_period_start::text as period_start, il.service_period_end::text as period_end,
        (select count(*)::int from zaltyko.invoice_line_enrollments ile
          where ile.organization_id = il.organization_id and ile.invoice_line_id = il.id) as covered
      from zaltyko.invoice_lines il
      join zaltyko.charges c on c.organization_id = il.organization_id and c.invoice_line_id = il.id
      where il.organization_id = ${fixture.organizationId}::uuid
    `);
    const byAthleteColumn = (left: { athlete_id: unknown }, right: { athlete_id: unknown }) =>
      byAthleteId({ athleteId: String(left.athlete_id) }, { athleteId: String(right.athlete_id) });
    expect([...persisted.rows].sort(byAthleteColumn)).toEqual(
      [
        { athlete_id: fixture.athleteA.athleteId, cents: 3000, covered: 2 },
        { athlete_id: fixture.athleteB.athleteId, cents: 3200, covered: 1 },
      ]
        .sort(byAthleteColumn)
        .map(({ athlete_id, cents, covered }) => ({
          athlete_id,
          amount_cents: cents,
          charge_cents: cents,
          collection_mode: "manual",
          period_start: PERIOD_START,
          period_end: PERIOD_END,
          covered,
        }))
    );
  }, 45_000);

  it("stores the due date as the end of that day in the site's time zone", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);
    const issued = await issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!));
    const row = await db.execute(sql`
      select i.due_at = ((${fixture.periodEnd}::date + time '23:59:59.999') at time zone 'Europe/Madrid') as invoice_due,
        bool_and(c.due_at = i.due_at) as charges_due
      from zaltyko.invoices i
      join zaltyko.charges c on c.organization_id = i.organization_id and c.invoice_id = i.id
      where i.organization_id = ${fixture.organizationId}::uuid and i.id = ${issued.invoice.id}::uuid
      group by i.due_at
    `);
    expect(row.rows).toEqual([{ invoice_due: true, charges_due: true }]);
  }, 45_000);

  it("bills rows that end exactly on the last day of the month", async () => {
    // Enrollments, classes, memberships, payer, assignments and coverage all
    // end on 2026-12-31: the SQL filters and the in-memory checks must keep
    // treating that as covering the whole month (`>=`, not `>`).
    const fixture = await seedFamily({ endsOnLastDay: true });
    const family = await quoteFor(fixture);
    expect(family.blockingReasons).toEqual([]);
    expect(family.payers.map((payer) => payer.familyPayerId)).toEqual([fixture.familyPayerId]);
    expect(quotedLines(family)).toEqual(expectedLines(fixture));
    const issued = await issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!));
    expect(issued.replayed).toBe(false);
    expect(await ledgerRows(fixture.organizationId)).toEqual(ONE_INVOICE);
  }, 45_000);

  it("issues one invoice when two different keys race for the same family and month", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);

    // Barrier: hold the organization row lock that lockCommand takes first, start
    // both issuances and release only once both are blocked on it. Both
    // transactions are then open at the same time; the service serializes them
    // on that lock, so the second one runs after the first commits.
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markHeld!: () => void;
    const held = new Promise<void>((resolve) => {
      markHeld = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`
        select id from zaltyko.organizations where id = ${fixture.organizationId}::uuid for update
      `);
      markHeld();
      await released;
    });
    await held;
    const racing = Promise.allSettled([
      issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!, `ci-race-a-${randomUUID()}`)),
      issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!, `ci-race-b-${randomUUID()}`)),
    ]);
    try {
      expect(await waitForOrganizationLockWaiters(2)).toBe(2);
    } finally {
      release();
      await holder;
    }
    const settled = await racing;
    const results = settled.map((outcome) => {
      if (outcome.status === "rejected") throw outcome.reason;
      return outcome.value;
    });

    // The loser finds the period invoice under the family locks and replays it.
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0]!.invoice.id).toBe(results[1]!.invoice.id);
    // Exactly one set of lines, covered classes, charges and markers.
    expect(await ledgerRows(fixture.organizationId)).toEqual(ONE_INVOICE);
  }, 45_000);

  it("refuses a quote whose price changed after the preview, without ledger writes", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);
    await db.execute(sql`
      update zaltyko.enrollment_price_assignments
      set unit_amount_cents = 3001
      where organization_id = ${fixture.organizationId}::uuid and id = ${fixture.assignmentA1}::uuid
    `);
    await expect(issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!))).rejects.toMatchObject({
      code: "QUOTE_STALE",
      status: 409,
    });
    expect(await ledgerRows(fixture.organizationId)).toEqual(NO_LEDGER_ROWS);
  }, 45_000);

  it("replays the original invoice for the same key after prices change", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);
    const command = issueCommand(fixture, family.quoteHash!);
    const first = await issueMonthlyInvoice(command);
    await db.execute(sql`
      update zaltyko.enrollment_price_assignments
      set unit_amount_cents = 9999
      where organization_id = ${fixture.organizationId}::uuid and id = ${fixture.assignmentB1}::uuid
    `);
    const replay = await issueMonthlyInvoice(command);
    expect(replay.replayed).toBe(true);
    expect(replay.invoice.id).toBe(first.invoice.id);
    expect(replay.invoice.totalAmountCents).toBe(6200);
    expect(replay.lines.map((line) => line.amountCents).sort((left, right) => left - right)).toEqual([
      3000, 3200,
    ]);
    expect(await ledgerRows(fixture.organizationId)).toEqual(ONE_INVOICE);

    // A new quote now reports the month as already invoiced.
    const requote = await quoteFor(fixture);
    expect(requote).toMatchObject({
      existingInvoiceId: first.invoice.id,
      canIssue: false,
    });
    expect(requote.blockingReasons).toContain("PERIOD_ALREADY_INVOICED");
  }, 45_000);

  it("validates a replay against the stored invoice total, not the sum of its lines", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);
    const command = issueCommand(fixture, family.quoteHash!);
    const first = await issueMonthlyInvoice(command);
    // Controlled corruption: only the invoice header changes; its lines still sum 6200.
    await db.execute(sql`
      update zaltyko.invoices set total_amount_cents = 6201
      where organization_id = ${fixture.organizationId}::uuid and id = ${first.invoice.id}::uuid
    `);
    const sums = await db.execute(sql`
      select sum(amount_cents)::int as lines_total
      from zaltyko.invoice_lines
      where organization_id = ${fixture.organizationId}::uuid and invoice_id = ${first.invoice.id}::uuid
    `);
    expect(sums.rows).toEqual([{ lines_total: 6200 }]);
    // Recomputing from the lines would match the quote and replay; the service
    // hashes the stored total and refuses.
    await expect(issueMonthlyInvoice(command)).rejects.toMatchObject({
      code: "MONTHLY_INVOICE_BLOCKED",
      status: 500,
    });
    expect(await ledgerRows(fixture.organizationId)).toEqual(ONE_INVOICE);
  }, 45_000);

  it("keeps quotes and invoices inside their organization", async () => {
    const tenantA = await seedFamily();
    const tenantB = await seedFamily();

    const optionsA = await getMonthlyInvoiceOptions({
      organizationId: tenantA.organizationId,
      locationId: tenantA.locationId,
      servicePeriod: SERVICE_PERIOD,
      actor: tenantA.actor,
    });
    expect(optionsA.families.map((family) => family.familyId)).toEqual([tenantA.familyId]);
    expect(optionsA.pricePlans.map((plan) => plan.id)).toEqual([tenantA.pricePlanId]);
    expect(optionsA.unassignedEnrollments).toEqual([]);
    expect(optionsA.families[0]!.enrollments.map((enrollment) => enrollment.enrollmentId).sort()).toEqual(
      [tenantA.enrollmentA1, tenantA.enrollmentA2, tenantA.enrollmentB1].sort()
    );
    expect(quotedLines(optionsA.families[0]!)).toEqual(expectedLines(tenantA));

    const issued = await issueMonthlyInvoice(issueCommand(tenantA, optionsA.families[0]!.quoteHash!));
    expect(issued.replayed).toBe(false);
    expect(await ledgerRows(tenantA.organizationId)).toEqual(ONE_INVOICE);
    expect(await ledgerRows(tenantB.organizationId)).toEqual(NO_LEDGER_ROWS);
    const issuedAthletes = await db.execute(sql`
      select il.athlete_id::text as athlete_id, il.organization_id::text as organization_id
      from zaltyko.invoice_lines il
      where il.invoice_id = ${issued.invoice.id}::uuid
    `);
    expect(
      issuedAthletes.rows
        .map((row) => ({ athleteId: String(row.athlete_id), organizationId: String(row.organization_id) }))
        .sort(byAthleteId)
    ).toEqual(
      [tenantA.athleteA.athleteId, tenantA.athleteB.athleteId]
        .map((athleteId) => ({ athleteId, organizationId: tenantA.organizationId }))
        .sort(byAthleteId)
    );

    // Tenant B's identical family is untouched by A's invoice and still issuable.
    const familyB = await quoteFor(tenantB);
    expect(familyB).toMatchObject({ canIssue: true, existingInvoiceId: null, blockingReasons: [] });
    expect(quotedLines(familyB)).toEqual(expectedLines(tenantB));
  }, 45_000);

  it("refuses an actor of another organization, and a site of another organization", async () => {
    const tenantA = await seedFamily();
    const tenantB = await seedFamily();
    const familyA = await quoteFor(tenantA);

    // B's owner on A's organization and site.
    await expect(
      getMonthlyInvoiceOptions({
        organizationId: tenantA.organizationId,
        locationId: tenantA.locationId,
        servicePeriod: SERVICE_PERIOD,
        actor: tenantB.actor,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      issueMonthlyInvoice({ ...issueCommand(tenantA, familyA.quoteHash!), actor: tenantB.actor })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    // B's owner on B's organization but A's site: the site is not found in B.
    await expect(
      getMonthlyInvoiceOptions({
        organizationId: tenantB.organizationId,
        locationId: tenantA.locationId,
        servicePeriod: SERVICE_PERIOD,
        actor: tenantB.actor,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    expect(await ledgerRows(tenantA.organizationId)).toEqual(NO_LEDGER_ROWS);
    expect(await ledgerRows(tenantB.organizationId)).toEqual(NO_LEDGER_ROWS);
  }, 45_000);

  it("issues the same family's month at a second site without touching the first site's invoice", async () => {
    const fixture = await seedFamily();
    const secondSite = await seedSecondSite(fixture);

    // The second site bills athlete A for its own class first.
    const familyAtSecondSite = await quoteFor(fixture, secondSite.locationId);
    expect(quotedLines(familyAtSecondSite)).toEqual([
      {
        athleteId: fixture.athleteA.athleteId,
        pricePlanId: fixture.pricePlanId,
        amountCents: 2800,
        currency: "EUR",
        coveredEnrollmentIds: [secondSite.enrollmentId],
      },
    ]);
    const secondSiteInvoice = await issueMonthlyInvoice(
      issueCommand(fixture, familyAtSecondSite.quoteHash!, undefined, secondSite.locationId)
    );
    expect(secondSiteInvoice.replayed).toBe(false);
    const secondSiteBefore = await invoiceSnapshot(fixture, secondSiteInvoice.invoice.id);

    // The first site then issues the whole family for the same month.
    const family = await quoteFor(fixture);
    expect(family).toMatchObject({ canIssue: true, existingInvoiceId: null, blockingReasons: [] });
    expect(quotedLines(family)).toEqual(expectedLines(fixture));
    const issued = await issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!));
    expect(issued.replayed).toBe(false);
    expect(issued.invoice.id).not.toBe(secondSiteInvoice.invoice.id);

    expect(await invoiceReferences(fixture)).toEqual(
      [
        { locationId: fixture.locationId, reference: expectedReference(fixture, fixture.locationId) },
        { locationId: secondSite.locationId, reference: expectedReference(fixture, secondSite.locationId) },
      ].sort(byReference)
    );
    expect(await ledgerRows(fixture.organizationId)).toEqual(TWO_SITE_INVOICES);
    expect(await invoiceSnapshot(fixture, secondSiteInvoice.invoice.id)).toEqual(secondSiteBefore);

    // Each site's quote now reports its own invoice only.
    expect(await quoteFor(fixture, secondSite.locationId)).toMatchObject({
      existingInvoiceId: secondSiteInvoice.invoice.id,
      blockingReasons: ["PERIOD_ALREADY_INVOICED"],
    });
    expect(await quoteFor(fixture)).toMatchObject({
      existingInvoiceId: issued.invoice.id,
      blockingReasons: ["PERIOD_ALREADY_INVOICED"],
    });
  }, 45_000);

  it("issues at a second site while the other site's invoice keeps the pre-site reference", async () => {
    // The case that failed before the fix: a month already invoiced with the
    // old `MENSUAL-YYYYMM-<family>` reference at one site.
    const fixture = await seedFamily();
    const secondSite = await seedSecondSite(fixture);
    const familyAtSecondSite = await quoteFor(fixture, secondSite.locationId);
    const secondSiteInvoice = await issueMonthlyInvoice(
      issueCommand(fixture, familyAtSecondSite.quoteHash!, undefined, secondSite.locationId)
    );
    await useLegacyReference(fixture, secondSiteInvoice.invoice.id);
    const secondSiteBefore = await invoiceSnapshot(fixture, secondSiteInvoice.invoice.id);

    const family = await quoteFor(fixture);
    expect(family).toMatchObject({ canIssue: true, existingInvoiceId: null, blockingReasons: [] });
    const issued = await issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!));
    expect(issued.replayed).toBe(false);

    expect(await invoiceReferences(fixture)).toEqual(
      [
        { locationId: fixture.locationId, reference: expectedReference(fixture, fixture.locationId) },
        { locationId: secondSite.locationId, reference: legacyReference(fixture) },
      ].sort(byReference)
    );
    expect(await ledgerRows(fixture.organizationId)).toEqual(TWO_SITE_INVOICES);
    expect(await invoiceSnapshot(fixture, secondSiteInvoice.invoice.id)).toEqual(secondSiteBefore);
  }, 45_000);

  it("replays, and never duplicates, a month invoiced at the same site with the pre-site reference", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);
    const command = issueCommand(fixture, family.quoteHash!);
    const original = await issueMonthlyInvoice(command);
    await useLegacyReference(fixture, original.invoice.id);

    // Replay by idempotency key.
    const byKey = await issueMonthlyInvoice(command);
    expect(byKey.replayed).toBe(true);
    expect(byKey.invoice.id).toBe(original.invoice.id);

    // Replay by family, site and period: a new key with the same quote.
    const byPeriod = await issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!));
    expect(byPeriod.replayed).toBe(true);
    expect(byPeriod.invoice.id).toBe(original.invoice.id);

    // The quote reports the month as invoiced, not as a reference collision.
    expect(await quoteFor(fixture)).toMatchObject({
      canIssue: false,
      existingInvoiceId: original.invoice.id,
      blockingReasons: ["PERIOD_ALREADY_INVOICED"],
    });
    expect(await invoiceReferences(fixture)).toEqual([
      { locationId: fixture.locationId, reference: legacyReference(fixture) },
    ]);
    expect(await ledgerRows(fixture.organizationId)).toEqual(ONE_INVOICE);
  }, 45_000);

  it("reports a reference held by another invoice in the quote and refuses to issue", async () => {
    const fixture = await seedFamily();
    // An invoice without monthly lines (for example a manual one) that already
    // uses the reference this family's month would get at this site.
    const heldBy = randomUUID();
    await db.execute(sql`
      insert into zaltyko.invoices (
        id, organization_id, location_id, family_id, reference, status,
        currency, total_amount_cents, issued_at, due_at, idempotency_key
      ) values (
        ${heldBy}::uuid, ${fixture.organizationId}::uuid, ${fixture.locationId}::uuid,
        ${fixture.familyId}::uuid, ${expectedReference(fixture, fixture.locationId)}, 'issued',
        'EUR', 1000, ${`${PERIOD_START}T09:00:00Z`}::timestamptz,
        ${`${PERIOD_END}T12:00:00Z`}::timestamptz, ${`ci-manual-${heldBy}`}
      )
    `);
    const family = await quoteFor(fixture);
    expect(family).toMatchObject({
      canIssue: false,
      existingInvoiceId: null,
      blockingReasons: ["INVOICE_REFERENCE_TAKEN"],
    });
    await expect(issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!))).rejects.toMatchObject({
      code: "MONTHLY_INVOICE_BLOCKED",
      status: 422,
      details: { blockingReasons: ["INVOICE_REFERENCE_TAKEN"] },
    });
    expect(await ledgerRows(fixture.organizationId)).toEqual({
      invoices: 1,
      lines: 0,
      covered: 0,
      charges: 0,
      markers: 0,
    });
  }, 45_000);
});
