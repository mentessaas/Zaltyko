import assert from "node:assert/strict";

import { Pool } from "pg";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { normalizePostgresQuery } from "./lib/postgres-query-normalization";
import {
  loadIssuedLines,
  loadMonthlyChargeState,
  loadMonthlyFamilyMemberships,
  loadMonthlyReplayState,
} from "@/modules/billing/application/monthly-invoice-service";
import { loadPricePlanCoverage } from "@/modules/billing/application/monthly-price-plan-service";
import { recordManualPaymentForCharge } from "@/modules/billing/application/ledger-service";

const LOCAL_ONLY = "ZALTYKO_MONTHLY_BILLING_PAGING_LOCAL";
const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000010";
const LOCATION_ID = "10000000-0000-4000-8000-000000000020";
const FAMILY_ID = "10000000-0000-4000-8000-000000000030";
const OWNER_USER_ID = "10000000-0000-4000-8000-000000000001";
const OWNER_MEMBER_ID = "10000000-0000-4000-8000-000000000002";
const PRICE_PLAN_ID = "10000000-0000-4000-8000-000000000105";
const INVOICE_ID = "10000000-0000-4000-8000-000000000200";
const ROW_COUNT = 205;
const SNAPSHOT_ROW_COUNT = ROW_COUNT * 2 - 1;
const PAYMENT_APPLICATION_NAME = "zaltyko_monthly_paging_payment";
const REPLAY_APPLICATION_NAME = "zaltyko_monthly_paging_replay";
const BARRIER_LOCK_CLASS = 867530;
const BARRIER_LOCK_OBJECT = 900001;

function assertLoopbackUrl(name: string): string {
  const value = process.env[name];
  assert(value, `${name} is required`);
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "postgresql:");
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.pathname, "/postgres");
  assert.equal(parsed.password, "");
  assert.equal(parsed.port, process.env.ZALTYKO_MONTHLY_BILLING_PAGING_PORT);
  return value;
}

async function seed(pool: Pool): Promise<void> {
  await pool.query(`
    insert into zaltyko.organizations (id, name, status)
    values ('${ORGANIZATION_ID}', 'Synthetic paging academy', 'active');
    insert into zaltyko.locations (id, organization_id, code, name, timezone)
    values ('${LOCATION_ID}', '${ORGANIZATION_ID}', 'paging-test', 'Paging test', 'UTC');
    insert into auth.users (id) values ('${OWNER_USER_ID}');
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      '${OWNER_MEMBER_ID}', '${ORGANIZATION_ID}', '${OWNER_USER_ID}',
      'owner', 'active', 'all'
    );
    insert into zaltyko.families (id, organization_id, is_active)
    values ('${FAMILY_ID}', '${ORGANIZATION_ID}', true);
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    select
      ('31000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', 'Synthetic', 'Gymnast ' || n
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.athletes (id, organization_id, person_id)
    select
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}',
      ('31000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.family_members (
      id, organization_id, family_id, athlete_id, relationship, starts_on
    )
    select
      ('33000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${FAMILY_ID}',
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'other', '2026-10-01'
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.price_plans (
      id, organization_id, name, cadence, amount_cents, currency, is_active
    ) values (
      '${PRICE_PLAN_ID}', '${ORGANIZATION_ID}', 'Synthetic monthly',
      'monthly', 1000, 'EUR', true
    );
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    )
    select
      ('39000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}', 'Synthetic class ' || n,
      500, 'active', '2026-09-01'
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.enrollments (
      id, organization_id, location_id, athlete_id, class_template_id,
      price_plan_id, status, starts_on, source
    )
    select
      ('34000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('39000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${PRICE_PLAN_ID}', 'active', '2026-10-01', 'owner'
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.enrollments (
      id, organization_id, location_id, athlete_id, class_template_id,
      price_plan_id, status, starts_on, source
    )
    select
      ('34100000-0000-4000-8000-' || lpad((n - 1)::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      '32000000-0000-4000-8000-000000000001'::uuid,
      ('39000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${PRICE_PLAN_ID}', 'active', '2026-10-01', 'owner'
    from generate_series(2, ${ROW_COUNT}) as n;
    insert into zaltyko.enrollment_price_assignments (
      id, organization_id, location_id, enrollment_id, price_plan_id,
      unit_amount_cents, currency, starts_on
    )
    select
      ('35000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      ('34000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${PRICE_PLAN_ID}', 1000, 'EUR', '2026-10-01'
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.enrollment_price_assignments (
      id, organization_id, location_id, enrollment_id, price_plan_id,
      unit_amount_cents, currency, starts_on
    )
    select
      ('35100000-0000-4000-8000-' || lpad((n - 1)::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      ('34100000-0000-4000-8000-' || lpad((n - 1)::text, 12, '0'))::uuid,
      '${PRICE_PLAN_ID}', 1000, 'EUR', '2026-10-01'
    from generate_series(2, ${ROW_COUNT}) as n;
    insert into zaltyko.price_plan_class_template_coverage (
      id, organization_id, location_id, price_plan_id, class_template_id,
      starts_on, ends_on
    )
    select
      ('36000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}', '${PRICE_PLAN_ID}',
      ('39000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      date '2000-01-01' + (n * 3), date '2000-01-01' + (n * 3)
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.invoices (
      id, organization_id, location_id, family_id, reference, status,
      currency, total_amount_cents, issued_at, due_at, idempotency_key
    ) values (
      '${INVOICE_ID}', '${ORGANIZATION_ID}', '${LOCATION_ID}', '${FAMILY_ID}',
      'SYNTHETIC-PAGING-2026-10', 'issued', 'EUR', ${ROW_COUNT * 1000},
      now(), '2026-10-31T12:00:00Z', 'synthetic-paging-invoice'
    );
    insert into zaltyko.invoice_lines (
      id, organization_id, invoice_id, location_id, athlete_id,
      price_plan_id, line_type, quantity, unit_amount_cents, amount_cents,
      currency, service_period_start, service_period_end
    )
    select
      ('37000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${INVOICE_ID}', '${LOCATION_ID}',
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${PRICE_PLAN_ID}', 'monthly_fee', 1, 1000, 1000, 'EUR',
      '2026-10-01', '2026-10-31'
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.invoice_line_enrollments (
      organization_id, location_id, athlete_id, invoice_line_id, price_plan_id,
      enrollment_id, class_template_id, price_assignment_id, class_name_snapshot
    )
    select
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('37000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${PRICE_PLAN_ID}',
      ('34000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('39000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('35000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'Synthetic gymnastics class'
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.invoice_line_enrollments (
      organization_id, location_id, athlete_id, invoice_line_id, price_plan_id,
      enrollment_id, class_template_id, price_assignment_id, class_name_snapshot
    )
    select
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      '32000000-0000-4000-8000-000000000001'::uuid,
      '37000000-0000-4000-8000-000000000001'::uuid,
      '${PRICE_PLAN_ID}',
      ('34100000-0000-4000-8000-' || lpad((n - 1)::text, 12, '0'))::uuid,
      ('39000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('35100000-0000-4000-8000-' || lpad((n - 1)::text, 12, '0'))::uuid,
      'Synthetic gymnastics class'
    from generate_series(2, ${ROW_COUNT}) as n;
    insert into zaltyko.charges (
      id, organization_id, location_id, invoice_id, invoice_line_id, family_id,
      enrollment_id, collection_mode, status, amount_cents, currency, due_at,
      service_period_start, service_period_end, idempotency_key
    )
    select
      ('38000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}', '${INVOICE_ID}',
      ('37000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${FAMILY_ID}',
      ('34000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'manual', 'due', 1000, 'EUR', '2026-10-31T12:00:00Z',
      '2026-10-01', '2026-10-31', 'synthetic-paging-charge-' || n
    from generate_series(1, ${ROW_COUNT}) as n;
  `);
}

async function waitForPaymentBarrier(pool: Pool): Promise<{ pid: number }> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{
      pid: number;
      application_name: string;
      query: string;
    }>(
      `
        select activity.pid, activity.application_name, activity.query
        from pg_stat_activity as activity
        join pg_locks as activity_lock
          on activity_lock.pid = activity.pid
        where activity.datname = current_database()
          and activity.application_name = $1
          and activity.wait_event_type = 'Lock'
          and activity_lock.locktype = 'advisory'
          and activity_lock.classid = $2::oid
          and activity_lock.objid = $3::oid
          and activity_lock.objsubid = 2
          and activity_lock.granted = false
        limit 1
      `,
      [PAYMENT_APPLICATION_NAME, BARRIER_LOCK_CLASS, BARRIER_LOCK_OBJECT]
    );
    const waiter = result.rows[0];
    if (waiter) {
      assert.equal(waiter.application_name, PAYMENT_APPLICATION_NAME);
      assert.match(
        normalizePostgresQuery(waiter.query),
        /^insert into zaltyko\.payments\b/
      );
      return { pid: waiter.pid };
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Payment service did not wait on the expected advisory lock");
}

async function waitForReplayBlockedByPayment(
  pool: Pool,
  paymentPid: number
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{
      pid: number;
      application_name: string;
      query: string;
    }>(
      `
        select replay.pid, replay.application_name, replay.query
        from pg_stat_activity as replay
        where replay.datname = current_database()
          and replay.application_name = $1
          and replay.wait_event_type = 'Lock'
          and $2::integer = any(pg_blocking_pids(replay.pid))
        limit 1
      `,
      [REPLAY_APPLICATION_NAME, paymentPid]
    );
    const waiter = result.rows[0];
    if (waiter) {
      assert.equal(waiter.application_name, REPLAY_APPLICATION_NAME);
      const normalizedQuery = normalizePostgresQuery(waiter.query);
      assert.match(normalizedQuery, /from zaltyko\.charges\b/);
      assert.match(normalizedQuery, /for update\b/);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Replay did not wait on the payment service charge lock");
}

async function verifyConcurrentPaymentReplay(pool: Pool): Promise<void> {
  const barrier = await pool.connect();
  let barrierOpen = false;
  let paymentPromise:
    ReturnType<typeof recordManualPaymentForCharge> | undefined;
  let replayPromise:
    Promise<Awaited<ReturnType<typeof loadMonthlyReplayState>>> | undefined;
  try {
    await pool.query(`
      create or replace function zaltyko.monthly_paging_payment_barrier()
      returns trigger language plpgsql as $$
      begin
        if new.organization_id = '${ORGANIZATION_ID}'::uuid then
          perform set_config(
            'application_name', '${PAYMENT_APPLICATION_NAME}', true
          );
          perform pg_advisory_xact_lock(
            ${BARRIER_LOCK_CLASS}, ${BARRIER_LOCK_OBJECT}
          );
        end if;
        return new;
      end;
      $$;
      create trigger monthly_paging_payment_barrier
      before insert on zaltyko.payments
      for each row execute function zaltyko.monthly_paging_payment_barrier();
    `);
    await barrier.query("begin");
    barrierOpen = true;
    await barrier.query(
      `select pg_advisory_xact_lock(${BARRIER_LOCK_CLASS}, ${BARRIER_LOCK_OBJECT})`
    );
    paymentPromise = recordManualPaymentForCharge({
      organizationId: ORGANIZATION_ID,
      chargeId: "38000000-0000-4000-8000-000000000001",
      amountCents: 1000,
      method: "bank_transfer",
      receivedAt: new Date().toISOString(),
      idempotencyKey: "synthetic-monthly-paging-payment-1",
      actor: { userId: OWNER_USER_ID, memberId: OWNER_MEMBER_ID },
    });
    void paymentPromise.catch(() => undefined);
    const paymentWaiter = await waitForPaymentBarrier(pool);
    replayPromise = db.transaction(async (tx) => {
      await tx.execute(sql`
        select set_config('application_name', ${REPLAY_APPLICATION_NAME}, true)
      `);
      return loadMonthlyReplayState(tx, ORGANIZATION_ID, INVOICE_ID);
    });
    await waitForReplayBlockedByPayment(pool, paymentWaiter.pid);
    await barrier.query("commit");
    barrierOpen = false;

    const payment = await paymentPromise;
    assert.equal(payment.payment.status, "succeeded");
    assert.equal(payment.allocation.amountCents, 1000);
    const snapshot = await replayPromise;
    assert.equal(snapshot.invoice.status, "partially_paid");
    assert.equal(snapshot.chargeStatus, "mixed");
    assert.equal(snapshot.charges.length, ROW_COUNT);
    assert.equal(
      snapshot.charges.filter((charge) => charge.status === "paid").length,
      1
    );
  } finally {
    if (barrierOpen) await barrier.query("rollback").catch(() => undefined);
    await paymentPromise?.catch(() => undefined);
    if (replayPromise) await replayPromise.catch(() => undefined);
    barrier.release();
    await pool
      .query(
        `
        drop trigger if exists monthly_paging_payment_barrier on zaltyko.payments;
        drop function if exists zaltyko.monthly_paging_payment_barrier();
      `
      )
      .catch(() => undefined);
  }
}

async function verifyRollbackAndSnapshotCut(pool: Pool): Promise<void> {
  const originalCount = SNAPSHOT_ROW_COUNT;
  let rollbackSeen = false;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        alter table zaltyko.invoice_line_enrollments disable trigger user
      `);
      await tx.execute(sql`
        delete from zaltyko.invoice_line_enrollments
        where organization_id = ${ORGANIZATION_ID}::uuid
          and invoice_line_id = ${"37000000-0000-4000-8000-000000000001"}::uuid
      `);
      const lines = await loadIssuedLines(tx, ORGANIZATION_ID, INVOICE_ID);
      assert.equal(lines.length, originalCount);
      assert.equal(
        lines.find(
          (line) => line.athleteId === "32000000-0000-4000-8000-000000000001"
        )?.coveredEnrollments.length,
        0,
        "El lector debe exponer el corte sintético inconsistente al validador"
      );
      throw new Error("rollback synthetic snapshot cut");
    });
  } catch (error) {
    rollbackSeen =
      error instanceof Error &&
      error.message === "rollback synthetic snapshot cut";
  }
  assert.equal(rollbackSeen, true, "La escritura sintética debe revertirse");
  const result = await pool.query<{ count: number }>(
    `
    select count(*)::int as count from zaltyko.invoice_line_enrollments
    where organization_id = $1
  `,
    [ORGANIZATION_ID]
  );
  assert.equal(result.rows[0]?.count, originalCount);
}

async function main(): Promise<void> {
  assert.equal(process.env[LOCAL_ONLY], "1", "Local harness flag is required");
  assertLoopbackUrl("DATABASE_URL");
  assertLoopbackUrl("DATABASE_URL_POOL");
  assertLoopbackUrl("DATABASE_URL_DIRECT");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  try {
    await seed(pool);
    const memberships = await db.transaction((tx) =>
      loadMonthlyFamilyMemberships(tx, ORGANIZATION_ID, FAMILY_ID, {
        start: "2026-10-01",
        end: "2026-10-31",
      })
    );
    assert.equal(memberships.length, ROW_COUNT);
    assert.equal(
      new Set(memberships.map((row) => row.athleteId)).size,
      ROW_COUNT
    );

    const coverage = await db.transaction((tx) =>
      loadPricePlanCoverage(tx, ORGANIZATION_ID, LOCATION_ID, PRICE_PLAN_ID)
    );
    assert.equal(coverage.length, ROW_COUNT);

    const lines = await db.transaction((tx) =>
      loadIssuedLines(tx, ORGANIZATION_ID, INVOICE_ID)
    );
    assert.equal(lines.length, ROW_COUNT);
    assert.equal(lines[0].coveredEnrollments.length, ROW_COUNT);
    assert(
      lines.slice(1).every((line) => line.coveredEnrollments.length === 1)
    );
    assert.equal(
      lines.reduce((total, line) => total + line.coveredEnrollments.length, 0),
      SNAPSHOT_ROW_COUNT
    );

    const charges = await db.transaction((tx) =>
      loadMonthlyChargeState(tx, ORGANIZATION_ID, INVOICE_ID)
    );
    assert.equal(charges.charges.length, ROW_COUNT);
    assert.equal(charges.chargeStatus, "due");

    await verifyConcurrentPaymentReplay(pool);
    await verifyRollbackAndSnapshotCut(pool);
    console.log(
      JSON.stringify({
        status: "PASS",
        rowsPerReader: ROW_COUNT,
        familyMemberships: memberships.length,
        pricePlanCoverage: coverage.length,
        invoiceLines: lines.length,
        invoiceLineSnapshots: SNAPSHOT_ROW_COUNT,
        snapshotsOnFirstLine: lines[0].coveredEnrollments.length,
        charges: charges.charges.length,
        replayAfterConcurrentPayment:
          "recordManualPaymentForCharge behind a deterministic advisory-lock barrier",
        inconsistentSnapshotCut: "surfaced and rolled back",
        rollback: "PASS",
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
