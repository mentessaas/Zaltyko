import assert from "node:assert/strict";

import { Pool } from "pg";

import { getMonthlyInvoiceOptions } from "@/modules/billing/application/monthly-invoice-service";

const LOCAL_ONLY = "ZALTYKO_MONTHLY_BILLING_PAGING_LOCAL";
const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
const LOCATION_ID = "10000000-0000-4000-8000-000000000002";
const OWNER_USER_ID = "10000000-0000-4000-8000-000000000003";
const OWNER_MEMBER_ID = "10000000-0000-4000-8000-000000000004";
const SECOND_LOCATION_ID = "10000000-0000-4000-8000-000000000005";
const OTHER_ORGANIZATION_ID = "10000000-0000-4000-8000-000000000006";
const OTHER_LOCATION_ID = "10000000-0000-4000-8000-000000000007";
const BASE_ATHLETES_AND_PLANS = 201;
const ACTIVE_ENROLLMENTS = 202;
const INCLUDED_PENDING_ENROLLMENTS = 1;
const INCLUDED_ENROLLMENTS = ACTIVE_ENROLLMENTS + INCLUDED_PENDING_ENROLLMENTS;
const LOCAL_PG_STATEMENT_TIMEOUT_MS = 8_000;
const LOCAL_PG_LOCK_TIMEOUT_MS = 4_000;

function id(prefix: string, value: number): string {
  return `${prefix}${String(value).padStart(12, "0")}`;
}

function assertLoopbackUrl(name: string): string {
  const value = process.env[name];
  assert(value, `${name} is required`);
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "postgresql:");
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.pathname, "/postgres");
  assert.equal(parsed.password, "");
  assert.equal(parsed.port, process.env.ZALTYKO_MONTHLY_BILLING_PAGING_PORT);
  assert.equal(
    parsed.searchParams.get("statement_timeout"),
    String(LOCAL_PG_STATEMENT_TIMEOUT_MS)
  );
  assert.equal(
    parsed.searchParams.get("lock_timeout"),
    String(LOCAL_PG_LOCK_TIMEOUT_MS)
  );
  return value;
}

async function seed(pool: Pool): Promise<void> {
  await pool.query(`
    insert into zaltyko.organizations (id, name, status)
    values
      ('${ORGANIZATION_ID}', 'Synthetic options academy', 'active'),
      ('${OTHER_ORGANIZATION_ID}', 'Synthetic excluded academy', 'active');
    insert into zaltyko.locations (id, organization_id, code, name, timezone)
    values
      ('${LOCATION_ID}', '${ORGANIZATION_ID}', 'options-test', 'Options test', 'Europe/Madrid'),
      ('${SECOND_LOCATION_ID}', '${ORGANIZATION_ID}', 'options-other', 'Other site', 'Europe/Madrid'),
      ('${OTHER_LOCATION_ID}', '${OTHER_ORGANIZATION_ID}', 'other-org', 'Other academy', 'Europe/Madrid');
    insert into auth.users (id) values ('${OWNER_USER_ID}');
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      '${OWNER_MEMBER_ID}', '${ORGANIZATION_ID}', '${OWNER_USER_ID}',
      'owner', 'active', 'all'
    );

    insert into zaltyko.people (id, organization_id, given_name, family_name)
    select
      ('31000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', 'Gimnasta', 'Sintética ' || n
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n
    union all
    select
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', 'Tutor', 'Sintético ' || n
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n
    union all
    select '33000000-0000-4000-8000-000000000001'::uuid,
      '${OTHER_ORGANIZATION_ID}', 'Gimnasta', 'Excluida';
    insert into zaltyko.athletes (id, organization_id, person_id)
    select
      ('34000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}',
      ('31000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n
    union all
    select '35000000-0000-4000-8000-000000000001'::uuid,
      '${OTHER_ORGANIZATION_ID}', '33000000-0000-4000-8000-000000000001'::uuid;
    insert into zaltyko.guardians (id, organization_id, person_id)
    select
      ('36000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}',
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n;
    insert into zaltyko.families (id, organization_id, is_active)
    select
      ('37000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', true
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n;
    insert into zaltyko.family_guardians (
      id, organization_id, family_id, guardian_id, relationship, is_active
    )
    select
      ('38000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}',
      ('37000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('36000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'parent', true
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n;
    insert into zaltyko.family_members (
      id, organization_id, family_id, athlete_id, relationship, starts_on
    )
    select
      ('39000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}',
      ('37000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('34000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'parent', '2026-10-01'
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n;
    insert into zaltyko.family_payers (
      id, organization_id, family_id, guardian_id, is_primary, starts_on
    )
    select
      ('3a000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}',
      ('37000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('36000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      true, '2026-10-01'
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n;

    insert into zaltyko.price_plans (
      id, organization_id, name, cadence, amount_cents, currency, is_active
    )
    select
      ('41000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', 'Cuota sintética ' || lpad(n::text, 3, '0'),
      'monthly', 1000 + n, 'EUR', true
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n;
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    )
    select
      ('42000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}', 'Clase sintética ' || n,
      500, 'active', '2026-09-01'
    from generate_series(1, 205) as n;
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    ) values (
      '42000000-0000-4000-8000-000000000206', '${ORGANIZATION_ID}',
      '${SECOND_LOCATION_ID}', 'Clase de otra sede', 20, 'active', '2026-09-01'
    );
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    ) values (
      '42000000-0000-4000-8000-000000000207', '${OTHER_ORGANIZATION_ID}',
      '${OTHER_LOCATION_ID}', 'Clase de otra academia', 20, 'active', '2026-09-01'
    );

    insert into zaltyko.enrollments (
      id, organization_id, location_id, athlete_id, class_template_id,
      price_plan_id, status, starts_on, ends_on, source
    )
    select
      ('51000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      ('34000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('42000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('41000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'active', '2026-10-01', null, 'owner'
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n
    union all
    select
      '51000000-0000-4000-8000-000000000202'::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      '34000000-0000-4000-8000-000000000001'::uuid,
      '42000000-0000-4000-8000-000000000202'::uuid,
      '41000000-0000-4000-8000-000000000001'::uuid,
      'active', '2026-10-01', null, 'owner'
    union all
    select
      '51000000-0000-4000-8000-000000000203'::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      '34000000-0000-4000-8000-000000000002'::uuid,
      '42000000-0000-4000-8000-000000000203'::uuid,
      '41000000-0000-4000-8000-000000000002'::uuid,
      'pending', '2026-10-01', null, 'owner'
    union all
    select
      '51000000-0000-4000-8000-000000000204'::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      '34000000-0000-4000-8000-000000000003'::uuid,
      '42000000-0000-4000-8000-000000000204'::uuid,
      '41000000-0000-4000-8000-000000000003'::uuid,
      'cancelled', '2026-10-01', null, 'owner'
    union all
    select
      '51000000-0000-4000-8000-000000000205'::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      '34000000-0000-4000-8000-000000000004'::uuid,
      '42000000-0000-4000-8000-000000000205'::uuid,
      '41000000-0000-4000-8000-000000000004'::uuid,
      'active', '2026-08-01', '2026-09-30', 'owner'
    union all
    select
      '51000000-0000-4000-8000-000000000206'::uuid,
      '${ORGANIZATION_ID}', '${SECOND_LOCATION_ID}',
      '34000000-0000-4000-8000-000000000005'::uuid,
      '42000000-0000-4000-8000-000000000206'::uuid,
      null, 'active', '2026-10-01', null, 'owner'
    union all
    select
      '51000000-0000-4000-8000-000000000207'::uuid,
      '${OTHER_ORGANIZATION_ID}', '${OTHER_LOCATION_ID}',
      '35000000-0000-4000-8000-000000000001'::uuid,
      '42000000-0000-4000-8000-000000000207'::uuid,
      null, 'active', '2026-10-01', null, 'owner';

    insert into zaltyko.enrollment_price_assignments (
      id, organization_id, location_id, enrollment_id, price_plan_id,
      unit_amount_cents, currency, starts_on
    )
    select
      ('61000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      ('51000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('41000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      1000 + n, 'EUR', '2026-10-01'
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n
    union all
    select
      '61000000-0000-4000-8000-000000000202'::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      '51000000-0000-4000-8000-000000000202'::uuid,
      '41000000-0000-4000-8000-000000000001'::uuid,
      1001, 'EUR', '2026-10-01'
    union all
    select
      '61000000-0000-4000-8000-000000000203'::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      '51000000-0000-4000-8000-000000000203'::uuid,
      '41000000-0000-4000-8000-000000000002'::uuid,
      1002, 'EUR', '2026-10-01';

    insert into zaltyko.price_plan_class_template_coverage (
      id, organization_id, location_id, price_plan_id, class_template_id,
      starts_on, ends_on
    )
    select
      ('71000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      ('41000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('42000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '2026-10-01', null
    from generate_series(1, ${BASE_ATHLETES_AND_PLANS}) as n
    union all
    select
      '71000000-0000-4000-8000-000000000202'::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      '41000000-0000-4000-8000-000000000001'::uuid,
      '42000000-0000-4000-8000-000000000202'::uuid,
      '2026-10-01', null
    union all
    select
      '71000000-0000-4000-8000-000000000203'::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      '41000000-0000-4000-8000-000000000002'::uuid,
      '42000000-0000-4000-8000-000000000203'::uuid,
      '2026-10-01', null;
  `);
}

async function verifyFixtureOracle(pool: Pool): Promise<{
  familyIds: string[];
  planIds: string[];
  enrollmentIds: string[];
  coveredEnrollmentIds: string[];
}> {
  const counts = await pool.query<{
    plan_count: string;
    family_athlete_count: string;
    included_enrollment_count: string;
    excluded_enrollment_count: string;
    coverage_pair_count: string;
  }>(`
    select
      (select count(*) from zaltyko.price_plans
       where organization_id = $1 and is_active and cadence = 'monthly') as plan_count,
      (select count(*) from zaltyko.family_members fm
       join zaltyko.families f on f.organization_id = fm.organization_id and f.id = fm.family_id
       where fm.organization_id = $1 and f.is_active) as family_athlete_count,
      (select count(*) from zaltyko.enrollments e
       join zaltyko.athletes a on a.organization_id = e.organization_id and a.id = e.athlete_id and a.is_active
       where e.organization_id = $1 and e.location_id = $2
         and e.status in ('active', 'pending')
         and e.starts_on <= date '2026-10-31'
         and (e.ends_on is null or e.ends_on >= date '2026-10-01')) as included_enrollment_count,
      (select count(*) from zaltyko.enrollments e
       where (e.organization_id = $1 and e.location_id = $2 and
                (e.status = 'cancelled' or e.starts_on > date '2026-10-31' or e.ends_on < date '2026-10-01'))
          or (e.organization_id = $1 and e.location_id <> $2)
          or (e.organization_id <> $1)) as excluded_enrollment_count,
      (select count(distinct (price_plan_id, class_template_id))
       from zaltyko.price_plan_class_template_coverage
       where organization_id = $1 and location_id = $2
         and starts_on <= date '2026-10-01' and (ends_on is null or ends_on >= date '2026-10-31')) as coverage_pair_count
  `, [ORGANIZATION_ID, LOCATION_ID]);
  const row = counts.rows[0];
  assert(row, "fixture count oracle returned no row");
  assert.equal(Number(row.plan_count), BASE_ATHLETES_AND_PLANS);
  assert.equal(Number(row.family_athlete_count), BASE_ATHLETES_AND_PLANS);
  assert.equal(Number(row.included_enrollment_count), INCLUDED_ENROLLMENTS);
  assert.equal(Number(row.excluded_enrollment_count), 4);
  assert(Number(row.coverage_pair_count) > 100);
  assert.equal(Number(row.coverage_pair_count), 203);

  const [families, plans, enrollments, coveredEnrollments] = await Promise.all([
    pool.query<{ id: string }>(`
      select distinct fm.family_id::text as id
      from zaltyko.family_members fm
      join zaltyko.families f
        on f.organization_id = fm.organization_id and f.id = fm.family_id
      join zaltyko.athletes a
        on a.organization_id = fm.organization_id and a.id = fm.athlete_id and a.is_active
      join zaltyko.enrollments e
        on e.organization_id = fm.organization_id and e.athlete_id = fm.athlete_id
      where e.organization_id = $1 and e.location_id = $2 and f.is_active
        and e.status in ('active', 'pending')
        and e.starts_on <= date '2026-10-31'
        and (e.ends_on is null or e.ends_on >= date '2026-10-01')
      order by id
    `, [ORGANIZATION_ID, LOCATION_ID]),
    pool.query<{ id: string }>(`
      select id::text as id from zaltyko.price_plans
      where organization_id = $1 and is_active and cadence = 'monthly'
      order by id
    `, [ORGANIZATION_ID]),
    pool.query<{ id: string }>(`
      select e.id::text as id from zaltyko.enrollments e
      join zaltyko.athletes a
        on a.organization_id = e.organization_id and a.id = e.athlete_id and a.is_active
      where e.organization_id = $1 and e.location_id = $2
        and e.status in ('active', 'pending')
        and e.starts_on <= date '2026-10-31'
        and (e.ends_on is null or e.ends_on >= date '2026-10-01')
      order by e.id
    `, [ORGANIZATION_ID, LOCATION_ID]),
    pool.query<{ id: string }>(`
      select e.id::text as id
      from zaltyko.enrollments e
      join zaltyko.athletes a
        on a.organization_id = e.organization_id and a.id = e.athlete_id and a.is_active
      join zaltyko.enrollment_price_assignments assignment
        on assignment.organization_id = e.organization_id
        and assignment.location_id = e.location_id
        and assignment.enrollment_id = e.id
      join zaltyko.price_plan_class_template_coverage coverage
        on coverage.organization_id = assignment.organization_id
        and coverage.location_id = assignment.location_id
        and coverage.price_plan_id = assignment.price_plan_id
        and coverage.class_template_id = e.class_template_id
      where e.organization_id = $1 and e.location_id = $2 and e.status = 'active'
        and e.starts_on <= date '2026-10-01'
        and (e.ends_on is null or e.ends_on >= date '2026-10-31')
        and assignment.starts_on <= date '2026-10-01'
        and (assignment.ends_on is null or assignment.ends_on >= date '2026-10-31')
        and coverage.starts_on <= date '2026-10-01'
        and (coverage.ends_on is null or coverage.ends_on >= date '2026-10-31')
      order by e.id
    `, [ORGANIZATION_ID, LOCATION_ID]),
  ]);
  return {
    familyIds: families.rows.map((item) => item.id),
    planIds: plans.rows.map((item) => item.id),
    enrollmentIds: enrollments.rows.map((item) => item.id),
    coveredEnrollmentIds: coveredEnrollments.rows.map((item) => item.id),
  };
}

async function main(): Promise<void> {
  assert.equal(process.env[LOCAL_ONLY], "1", "Local harness flag is required");
  assert.equal(process.env.DOTENV_CONFIG_PATH, "/dev/null");
  const databaseUrl = assertLoopbackUrl("DATABASE_URL");
  assertLoopbackUrl("DATABASE_URL_POOL");
  assertLoopbackUrl("DATABASE_URL_DIRECT");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 3,
    connectionTimeoutMillis: 10_000,
    statement_timeout: LOCAL_PG_STATEMENT_TIMEOUT_MS,
    lock_timeout: LOCAL_PG_LOCK_TIMEOUT_MS,
  });
  try {
    await seed(pool);
    const oracle = await verifyFixtureOracle(pool);
    const result = await getMonthlyInvoiceOptions({
      organizationId: ORGANIZATION_ID,
      locationId: LOCATION_ID,
      servicePeriod: "2026-10",
      actor: { userId: OWNER_USER_ID, memberId: OWNER_MEMBER_ID },
    });

    assert.equal(result.pricePlans.length, BASE_ATHLETES_AND_PLANS);
    assert.equal(result.families.length, BASE_ATHLETES_AND_PLANS);
    assert.equal(result.unassignedEnrollments.length, 0);
    assert.deepEqual(result.families.map((family) => family.familyId).sort(), oracle.familyIds);
    assert.deepEqual(result.pricePlans.map((plan) => plan.id).sort(), oracle.planIds);
    assert.deepEqual(
      result.families.flatMap((family) => family.enrollments.map((enrollment) => enrollment.enrollmentId)).sort(),
      oracle.enrollmentIds
    );
    assert.equal(
      result.families.reduce((total, family) => total + family.enrollments.length, 0),
      INCLUDED_ENROLLMENTS
    );
    assert.equal(
      result.families.reduce((total, family) => total + family.lines.length, 0),
      BASE_ATHLETES_AND_PLANS
    );
    assert.equal(
      result.families.reduce(
        (total, family) =>
          total + family.lines.reduce((lineTotal, line) => lineTotal + line.coveredEnrollments.length, 0),
        0
      ),
      ACTIVE_ENROLLMENTS
    );
    assert.deepEqual(
      result.families
        .flatMap((family) => family.lines.flatMap((line) => line.coveredEnrollments.map((enrollment) => enrollment.enrollmentId)))
        .sort(),
      oracle.coveredEnrollmentIds
    );
    assert(result.families.every((family) => family.canIssue));
    assert(result.families.every((family) => family.blockingReasons.length === 0));

    const multiClassAthlete = result.families
      .flatMap((family) => family.lines)
      .find((line) => line.athleteId === id("34000000-0000-4000-8000-", 1));
    assert(multiClassAthlete, "first synthetic athlete must be present");
    assert.equal(multiClassAthlete.coveredEnrollments.length, 2);
    assert.equal(multiClassAthlete.amountCents, 1001);
    const pending = result.families
      .flatMap((family) => family.enrollments)
      .find((enrollment) => enrollment.status === "pending");
    assert(pending, "pending enrollment should be included for review");
    assert(pending.blockingReasons.includes("ENROLLMENT_PENDING"));

    console.log(
      JSON.stringify({
        status: "PASS",
        service: "getMonthlyInvoiceOptions",
        monthlyPlans: result.pricePlans.length,
        familiesWithAthletes: result.families.length,
        includedEnrollments: INCLUDED_ENROLLMENTS,
        activeBillableEnrollments: ACTIVE_ENROLLMENTS,
        activeCoveragePairs: 203,
        excludedEnrollments: 4,
        pagination: "201 plans, 201 family-athlete rows, 203 enrollment reads, 203 coverage pairs",
        database: "disposable PostgreSQL 17 loopback only",
      })
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
