/**
 * Disposable PostgreSQL tests for the SaaS webhook reconciliation service.
 *
 * They run the real preview -> confirm -> consume flow against the real
 * schema, triggers, constraints and row locks. Only Stripe is replaced, by an
 * in-memory provider. Opt-in: ZALTYKO_PG_INTEGRATION=1 on a GitHub Linux
 * runner with a loopback, disposable database (same guard as the other -pg
 * suites). Each test seeds its own organizations with random ids and Stripe
 * references and consumes every decision it creates, so no claimable event is
 * left behind for the next test.
 *
 * Requires an isolated webhook inbox: consumeSaasReconciliationBatch claims
 * events of EVERY Stripe account and organization, and the exact batch counts
 * below assume these are the only reconciliation decisions in the database.
 * beforeEach therefore refuses to start while any claimable event exists in
 * the whole database. Do not run it against a database shared with other
 * reconciliation work.
 */
import { createHash, randomUUID } from "node:crypto";

import { sql, type SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  confirmSaasReconciliation,
  consumeSaasReconciliationBatch,
  previewSaasReconciliation,
  type SaasReconciliationDependencies,
  type StripeReconciliationProvider,
} from "@/modules/saas-billing/application/reconciliation-service";
import type { SaasStripeConfig } from "@/modules/saas-billing/application/saas-billing-config";

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
// Synthetic Stripe account and in-memory provider
// ---------------------------------------------------------------------------

const ACCOUNT = `acct_ci_reconciliation_${randomUUID().slice(0, 8)}`;
const PRICE = "price_ci_starter_month";
const REASON = "Resolución sintética de CI tras revisar la evidencia de Stripe";
// Microseconds on purpose: they must survive every timestamptz::text round trip.
const SUBSCRIPTION_UPDATED_AT = "2026-01-02 03:04:05.123456+00";

const config: SaasStripeConfig = {
  environment: "test",
  secretKey: "sk_test_ci_synthetic",
  webhookSecret: "whsec_ci_synthetic",
  providerAccountReference: ACCOUNT,
  portalEnabled: false,
  prices: {
    starter: { month: PRICE, year: "price_ci_starter_year" },
    growth: { month: "price_ci_growth_month", year: "price_ci_growth_year" },
  },
};

const stripe = {
  subscriptions: new Map<string, Record<string, unknown>>(),
  invoices: new Map<string, Record<string, unknown>>(),
};

const provider: StripeReconciliationProvider = {
  async retrieveSubscription(reference) {
    const value = stripe.subscriptions.get(reference);
    if (!value) throw new Error(`synthetic Stripe has no subscription ${reference}`);
    return value;
  },
  async retrieveInvoice(reference) {
    const value = stripe.invoices.get(reference);
    if (!value) throw new Error(`synthetic Stripe has no invoice ${reference}`);
    return value;
  },
};

const dependencies: SaasReconciliationDependencies = {
  config,
  signingSecret: "c".repeat(32),
  provider,
};

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const epoch = (date: Date) => Math.floor(date.getTime() / 1000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const consume = () => consumeSaasReconciliationBatch({ batchSize: 50 }, dependencies);
const zero = { claimed: 0, applied: 0, stale: 0, retrying: 0, leaseLost: 0 };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Fixture = {
  organizationId: string;
  subscriptionId: string;
  customerReference: string;
  subscriptionReference: string;
  seedInvoiceReference: string;
  periodStart: Date;
  periodEnd: Date;
};

async function seedOperator(): Promise<string> {
  const userId = randomUUID();
  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${`ci-reconciliation-${userId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into public.profiles (user_id, tenant_id, role, is_suspended)
    values (${userId}::uuid, ${randomUUID()}::uuid, 'super_admin', false)
    on conflict (user_id) do update set role = 'super_admin', is_suspended = false
  `);
  return userId;
}

/** Organization with a ready customer, an active starter subscription and its grant. */
async function seedOrganization(): Promise<Fixture> {
  const organizationId = randomUUID();
  const subscriptionId = randomUUID();
  const suffix = organizationId.replace(/-/g, "").slice(0, 12);
  const now = Date.now();
  const fixture: Fixture = {
    organizationId,
    subscriptionId,
    customerReference: `cus_ci_${suffix}`,
    subscriptionReference: `sub_ci_${suffix}`,
    seedInvoiceReference: `in_ci_seed_${suffix}`,
    periodStart: new Date(Math.floor((now - 10 * 86_400_000) / 1000) * 1000),
    periodEnd: new Date(Math.floor((now + 20 * 86_400_000) / 1000) * 1000),
  };

  // The organization trigger seeds the Free entitlement (revision 1).
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, status)
    values (${organizationId}::uuid, ${`CI reconciliation ${organizationId}`}, 'active')
  `);
  await db.execute(sql`
    insert into zaltyko.organization_saas_customers (
      organization_id, environment, provider_account_reference, customer_reference,
      status, creation_idempotency_key, creation_request_hash
    ) values (
      ${organizationId}::uuid, 'test', ${ACCOUNT}, ${fixture.customerReference},
      'ready', ${`ci-customer-${organizationId}`}, ${sha256(organizationId)}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.organization_saas_subscriptions (
      id, organization_id, environment, provider_account_reference,
      customer_reference, subscription_reference, price_reference, plan_code,
      provider_status, billing_interval, current_period_started_at,
      current_period_ends_at, last_provider_event_reference, last_synced_at,
      updated_at
    ) values (
      ${subscriptionId}::uuid, ${organizationId}::uuid, 'test', ${ACCOUNT},
      ${fixture.customerReference}, ${fixture.subscriptionReference}, ${PRICE}, 'starter',
      'active', 'month', ${fixture.periodStart.toISOString()}::timestamptz,
      ${fixture.periodEnd.toISOString()}::timestamptz, 'evt_ci_seed', clock_timestamp(),
      ${SUBSCRIPTION_UPDATED_AT}::timestamptz
    )
  `);
  // The revision guard bumps the entitlement to revision 2.
  await db.execute(sql`
    update zaltyko.organization_entitlements
    set plan_code = 'starter',
        source = 'stripe_subscription',
        source_reference = ${`stripe-invoice:${fixture.seedInvoiceReference}`},
        subscription_id = ${subscriptionId}::uuid,
        effective_from = ${fixture.periodStart.toISOString()}::timestamptz,
        effective_until = ${fixture.periodEnd.toISOString()}::timestamptz
    where organization_id = ${organizationId}::uuid
  `);

  stripe.subscriptions.set(fixture.subscriptionReference, stripeSubscription(fixture));
  return fixture;
}

function stripeSubscription(fixture: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    id: fixture.subscriptionReference,
    customer: fixture.customerReference,
    livemode: false,
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    current_period_start: epoch(fixture.periodStart),
    current_period_end: epoch(fixture.periodEnd),
    latest_invoice: fixture.seedInvoiceReference,
    items: {
      data: [
        {
          quantity: 1,
          price: {
            id: PRICE,
            active: true,
            livemode: false,
            currency: "eur",
            type: "recurring",
            recurring: { interval: "month", interval_count: 1 },
            unit_amount: 1900,
          },
        },
      ],
    },
    ...overrides,
  };
}

/** A paid invoice for the current period that is also the latest invoice. */
function addPaidInvoice(fixture: Fixture): string {
  const invoiceReference = `in_ci_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  stripe.invoices.set(invoiceReference, {
    id: invoiceReference,
    livemode: false,
    status: "paid",
    currency: "eur",
    customer: fixture.customerReference,
    subscription: fixture.subscriptionReference,
    amount_paid: 1900,
    lines: {
      data: [
        {
          price: { id: PRICE },
          period: { start: epoch(fixture.periodStart), end: epoch(fixture.periodEnd) },
        },
      ],
    },
  });
  stripe.subscriptions.set(
    fixture.subscriptionReference,
    stripeSubscription(fixture, { latest_invoice: invoiceReference })
  );
  return invoiceReference;
}

async function seedQuarantinedEvent(
  fixture: Fixture,
  input: { eventType: string; objectReference: string }
): Promise<string> {
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.organization_saas_webhook_events (
      id, provider_account_reference, environment, provider_event_id, event_type,
      event_created_at, provider_object_type, provider_object_reference, livemode,
      signature_verified, payload_sha256, organization_id, status, last_error_code
    ) values (
      ${id}::uuid, ${ACCOUNT}, 'test', ${`evt_ci_${id}`}, ${input.eventType},
      clock_timestamp() - interval '1 hour',
      ${input.eventType.startsWith("invoice.") ? "invoice" : "subscription"},
      ${input.objectReference}, false, true, ${sha256(id)},
      ${fixture.organizationId}::uuid, 'quarantined', 'ambiguous_event_order'
    )
  `);
  return id;
}

function subscriptionEvent(fixture: Fixture) {
  return seedQuarantinedEvent(fixture, {
    eventType: "customer.subscription.updated",
    objectReference: fixture.subscriptionReference,
  });
}

async function previewAndConfirm(eventId: string, operator: string) {
  const preview = await previewSaasReconciliation(
    { eventId, actorUserId: operator, requestId: `ci-preview-${eventId}` },
    dependencies
  );
  const confirmInput = {
    eventId,
    actorUserId: operator,
    requestId: `ci-confirm-${eventId}`,
    previewToken: preview.previewToken,
    reason: REASON,
    idempotencyKey: `ci-key-${eventId}`,
  };
  const confirmed = await confirmSaasReconciliation(confirmInput, dependencies);
  return { preview, confirmed, confirmInput };
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

async function firstRow(query: SQL) {
  const result = await db.execute(query);
  return result.rows[0] as Record<string, unknown> | undefined;
}

function eventState(eventId: string) {
  return firstRow(sql`
    select status, attempts::int as attempts, fencing_version::int as fencing_version,
      lease_token::text as lease_token, last_error_code,
      reconciliation_decision_id::text as decision_id,
      coalesce(reconciliation_next_attempt_at > clock_timestamp(), false) as retry_pending
    from zaltyko.organization_saas_webhook_events
    where id = ${eventId}::uuid
  `);
}

function resultOf(decisionId: string) {
  return firstRow(sql`
    select outcome, result_code, processor_fencing_version::int as processor_fencing_version,
      entitlement_revision_before, entitlement_revision_after,
      entitlement_source_reference_before, entitlement_source_reference_after
    from zaltyko.organization_saas_webhook_reconciliation_results
    where decision_id = ${decisionId}::uuid
  `);
}

function entitlementOf(organizationId: string) {
  return firstRow(sql`
    select revision, plan_code::text as plan_code, source::text as source, source_reference,
      subscription_id::text as subscription_id, effective_from::text as effective_from,
      effective_until::text as effective_until, updated_at::text as updated_at
    from zaltyko.organization_entitlements
    where organization_id = ${organizationId}::uuid
  `);
}

function subscriptionOf(organizationId: string) {
  return firstRow(sql`
    select price_reference, plan_code::text as plan_code, provider_status,
      cancel_at_period_end, current_period_started_at::text as current_period_started_at,
      current_period_ends_at::text as current_period_ends_at, updated_at::text as updated_at,
      last_provider_event_reference
    from zaltyko.organization_saas_subscriptions
    where organization_id = ${organizationId}::uuid
  `);
}

async function claimableEvents(): Promise<number> {
  const row = await firstRow(sql`
    select count(*)::int as count
    from zaltyko.organization_saas_webhook_events
    where reconciliation_decision_id is not null
      and (status in ('received', 'failed')
        or (status = 'processing' and lease_until <= clock_timestamp()))
  `);
  return Number(row?.count);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeDisposablePg("SaaS reconciliation service on disposable PostgreSQL", () => {
  beforeEach(async () => {
    assertDisposableTarget();
    // Exact batch counts below rely on a clean inbox.
    expect(await claimableEvents(), "a previous test left a claimable event").toBe(0);
  });

  it("confirms and consumes a status snapshot end to end", async () => {
    const operator = await seedOperator();
    const fixture = await seedOrganization();
    const eventId = await subscriptionEvent(fixture);
    stripe.subscriptions.set(
      fixture.subscriptionReference,
      stripeSubscription(fixture, { status: "past_due", cancel_at_period_end: true })
    );
    const entitlementBefore = await entitlementOf(fixture.organizationId);
    expect(entitlementBefore).toMatchObject({ revision: 2, source: "stripe_subscription" });

    const { preview, confirmed, confirmInput } = await previewAndConfirm(eventId, operator);
    expect(preview.resolutionKind).toBe("status_snapshot");
    expect(confirmed).toMatchObject({ eventId, status: "queued" });
    expect(await eventState(eventId)).toMatchObject({
      status: "received",
      fencing_version: 1,
      attempts: 0,
      decision_id: confirmed.decisionId,
    });

    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });

    expect(await eventState(eventId)).toMatchObject({
      status: "processed",
      attempts: 1,
      fencing_version: 2,
      lease_token: null,
      last_error_code: null,
    });
    expect(await resultOf(confirmed.decisionId)).toEqual({
      outcome: "applied",
      result_code: "status_snapshot_applied",
      processor_fencing_version: 2,
      entitlement_revision_before: 2,
      entitlement_revision_after: 2,
      entitlement_source_reference_before: `stripe-invoice:${fixture.seedInvoiceReference}`,
      entitlement_source_reference_after: `stripe-invoice:${fixture.seedInvoiceReference}`,
    });
    expect(await subscriptionOf(fixture.organizationId)).toMatchObject({
      provider_status: "past_due",
      cancel_at_period_end: true,
      last_provider_event_reference: `evt_ci_${eventId}`,
    });
    expect(await entitlementOf(fixture.organizationId)).toEqual(entitlementBefore);
    const audits = await firstRow(sql`
      select array_agg(action order by created_at, action) as actions
      from zaltyko.audit_log
      where organization_id = ${fixture.organizationId}::uuid and target_id = ${eventId}::uuid
    `);
    expect(audits?.actions).toEqual([
      "saas_webhook.quarantine_resolution_authorized",
      "saas_webhook.quarantine_resolution_applied",
    ]);

    // Replaying the confirmation reports the stored outcome; nothing is queued again.
    await expect(confirmSaasReconciliation(confirmInput, dependencies)).resolves.toEqual({
      decisionId: confirmed.decisionId,
      eventId,
      status: "completed",
      outcome: "applied",
    });
    await expect(consume()).resolves.toEqual(zero);
  }, 30_000);

  it("keeps two organizations isolated", async () => {
    const operator = await seedOperator();
    const first = await seedOrganization();
    const second = await seedOrganization();
    const secondEvent = await subscriptionEvent(second);
    const secondBefore = {
      subscription: await subscriptionOf(second.organizationId),
      entitlement: await entitlementOf(second.organizationId),
      event: await eventState(secondEvent),
    };

    // An event of the first organization that points at the second one's
    // subscription finds no baseline in its own organization.
    const crossEvent = await seedQuarantinedEvent(first, {
      eventType: "customer.subscription.updated",
      objectReference: second.subscriptionReference,
    });
    await expect(
      previewSaasReconciliation(
        { eventId: crossEvent, actorUserId: operator, requestId: "ci-cross-preview" },
        dependencies
      )
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409, details: { code: "STATE_CHANGED" } });

    const firstEvent = await subscriptionEvent(first);
    stripe.subscriptions.set(
      first.subscriptionReference,
      stripeSubscription(first, { status: "past_due" })
    );
    const { confirmed } = await previewAndConfirm(firstEvent, operator);
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });

    expect(await resultOf(confirmed.decisionId)).toMatchObject({ outcome: "applied" });
    expect(await subscriptionOf(first.organizationId)).toMatchObject({ provider_status: "past_due" });
    expect({
      subscription: await subscriptionOf(second.organizationId),
      entitlement: await entitlementOf(second.organizationId),
      event: await eventState(secondEvent),
    }).toEqual(secondBefore);
    expect(await eventState(crossEvent)).toMatchObject({ status: "quarantined", decision_id: null });
  }, 30_000);

  it("skips an event locked by another consumer (for update skip locked)", async () => {
    const operator = await seedOperator();
    const lockedFixture = await seedOrganization();
    const freeFixture = await seedOrganization();
    const lockedEvent = await subscriptionEvent(lockedFixture);
    const freeEvent = await subscriptionEvent(freeFixture);
    const locked = await previewAndConfirm(lockedEvent, operator);
    const free = await previewAndConfirm(freeEvent, operator);

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        select id from zaltyko.organization_saas_webhook_events
        where id = ${lockedEvent}::uuid
        for update
      `);
      // consume() runs on other pool connections while this row stays locked.
      await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });
    });
    expect(await resultOf(free.confirmed.decisionId)).toMatchObject({ outcome: "applied" });
    expect(await eventState(lockedEvent)).toMatchObject({ status: "received", attempts: 0 });

    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });
    expect(await resultOf(locked.confirmed.decisionId)).toMatchObject({ outcome: "applied" });
  }, 30_000);

  it("lets only one of two parallel confirmations with different keys queue a decision", async () => {
    const operator = await seedOperator();
    const fixture = await seedOrganization();
    const eventId = await subscriptionEvent(fixture);
    const preview = await previewSaasReconciliation(
      { eventId, actorUserId: operator, requestId: `ci-preview-${eventId}` },
      dependencies
    );
    const confirm = (key: string) =>
      confirmSaasReconciliation(
        {
          eventId,
          actorUserId: operator,
          requestId: `ci-confirm-${key}`,
          previewToken: preview.previewToken,
          reason: REASON,
          idempotencyKey: key,
        },
        dependencies
      );

    const outcomes = await Promise.allSettled([confirm(`ci-key-a-${eventId}`), confirm(`ci-key-b-${eventId}`)]);
    const queued = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ value: { eventId, status: "queued" } });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { code: "VERSION_CONFLICT", status: 409, details: { code: "STATE_CHANGED" } },
    });

    const decisions = await firstRow(sql`
      select count(*)::int as count
      from zaltyko.organization_saas_webhook_reconciliation_decisions
      where webhook_event_id = ${eventId}::uuid
    `);
    expect(decisions?.count).toBe(1);
    expect(await eventState(eventId)).toMatchObject({ status: "received", fencing_version: 1 });

    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });
  }, 30_000);

  it("never lets two parallel consumers process the same event", async () => {
    const operator = await seedOperator();
    const fixtures = [await seedOrganization(), await seedOrganization(), await seedOrganization()];
    const events: string[] = [];
    const decisions: string[] = [];
    for (const fixture of fixtures) {
      const eventId = await subscriptionEvent(fixture);
      events.push(eventId);
      decisions.push((await previewAndConfirm(eventId, operator)).confirmed.decisionId);
    }

    const batch = () => consumeSaasReconciliationBatch({ batchSize: 2 }, dependencies);
    const [first, second] = await Promise.all([batch(), batch()]);
    expect(first.claimed + second.claimed).toBe(3);
    expect(first.applied + second.applied).toBe(3);
    expect(first.leaseLost + second.leaseLost).toBe(0);
    await expect(consume()).resolves.toEqual(zero);

    for (const [index, eventId] of events.entries()) {
      expect(await eventState(eventId)).toMatchObject({ status: "processed", attempts: 1 });
      expect(await resultOf(decisions[index]!)).toMatchObject({ outcome: "applied" });
    }
  }, 30_000);

  it("reclaims an expired lease with a new token and fencing version", async () => {
    const operator = await seedOperator();
    const fixture = await seedOrganization();
    const eventId = await subscriptionEvent(fixture);
    const { confirmed } = await previewAndConfirm(eventId, operator);

    // A consumer that claimed the event and then vanished.
    const abandoned = await firstRow(sql`
      update zaltyko.organization_saas_webhook_events
      set status = 'processing',
          lease_token = gen_random_uuid(),
          lease_until = clock_timestamp() + interval '5 seconds',
          fencing_version = fencing_version + 1,
          attempts = attempts + 1,
          reconciliation_next_attempt_at = null,
          last_error_code = null
      where id = ${eventId}::uuid and status = 'received'
      returning lease_token::text as lease_token, fencing_version::int as fencing_version
    `);
    expect(abandoned?.fencing_version).toBe(2);

    // The lease is still valid: nobody can take it.
    await expect(consume()).resolves.toEqual(zero);
    await sleep(5_200);
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });

    const state = await eventState(eventId);
    expect(state).toMatchObject({ status: "processed", attempts: 2, fencing_version: 3 });
    expect(await resultOf(confirmed.decisionId)).toMatchObject({
      outcome: "applied",
      processor_fencing_version: 3,
    });
    // The abandoned lease no longer matches any row.
    const stale = await db.execute(sql`
      select id from zaltyko.organization_saas_webhook_events
      where id = ${eventId}::uuid
        and lease_token = ${String(abandoned?.lease_token)}::uuid
        and fencing_version = ${Number(abandoned?.fencing_version)}
    `);
    expect(stale.rows).toEqual([]);
  }, 30_000);

  it("rolls back the subscription update when the entitlement grant fails, then retries", async () => {
    const operator = await seedOperator();
    const fixture = await seedOrganization();
    const invoiceReference = addPaidInvoice(fixture);
    const eventId = await seedQuarantinedEvent(fixture, {
      eventType: "invoice.paid",
      objectReference: invoiceReference,
    });
    const { preview, confirmed } = await previewAndConfirm(eventId, operator);
    expect(preview.resolutionKind).toBe("paid_invoice_grant");

    const subscriptionBefore = await subscriptionOf(fixture.organizationId);
    const entitlementBefore = await entitlementOf(fixture.organizationId);
    // Generated identifiers only (hex), so sql.raw cannot carry user input.
    const suffix = fixture.organizationId.replace(/-/g, "");
    const functionName = `ci_reject_entitlement_${suffix}`;
    await db.execute(sql.raw(`
      create function public.${functionName}() returns trigger
      language plpgsql as $$
      begin
        if new.organization_id = '${fixture.organizationId}'::uuid then
          raise exception 'synthetic CI entitlement failure';
        end if;
        return new;
      end
      $$
    `));
    await db.execute(sql.raw(`
      create trigger ${functionName} before update on zaltyko.organization_entitlements
      for each row execute function public.${functionName}()
    `));
    try {
      await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, retrying: 1 });
    } finally {
      await db.execute(sql.raw(`drop trigger if exists ${functionName} on zaltyko.organization_entitlements`));
      await db.execute(sql.raw(`drop function if exists public.${functionName}()`));
    }

    // The subscription UPDATE ran before the failing entitlement UPDATE and
    // was rolled back with it.
    expect(await subscriptionOf(fixture.organizationId)).toEqual(subscriptionBefore);
    expect(await entitlementOf(fixture.organizationId)).toEqual(entitlementBefore);
    expect(await resultOf(confirmed.decisionId)).toBeUndefined();
    expect(await eventState(eventId)).toMatchObject({
      status: "failed",
      attempts: 1,
      last_error_code: "reconciliation_provider_unavailable",
      retry_pending: true,
      lease_token: null,
    });

    // First backoff is 3 s; then the grant goes through.
    await sleep(3_200);
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });
    expect(await resultOf(confirmed.decisionId)).toMatchObject({
      outcome: "applied",
      result_code: "paid_invoice_granted",
      entitlement_revision_before: 2,
      entitlement_revision_after: 3,
      entitlement_source_reference_after: `stripe-invoice:${invoiceReference}`,
    });
    expect(await entitlementOf(fixture.organizationId)).toMatchObject({
      revision: 3,
      plan_code: "starter",
      source: "stripe_subscription",
      source_reference: `stripe-invoice:${invoiceReference}`,
      subscription_id: fixture.subscriptionId,
    });
    expect(await subscriptionOf(fixture.organizationId)).toMatchObject({
      last_provider_event_reference: `evt_ci_${eventId}`,
    });
    expect(await eventState(eventId)).toMatchObject({ status: "processed", attempts: 2 });
  }, 30_000);

  it("round-trips timestamptz::text without losing microseconds", async () => {
    const operator = await seedOperator();
    const fixture = await seedOrganization();
    const eventId = await subscriptionEvent(fixture);
    const { confirmed } = await previewAndConfirm(eventId, operator);

    const compared = await firstRow(sql`
      select s.updated_at::text as subscription_updated_at,
        d.expected_subscription_updated_at::text as decision_updated_at,
        s.updated_at = d.expected_subscription_updated_at as same_updated_at,
        e.event_created_at = d.event_created_at as same_event_created_at,
        s.current_period_started_at = d.expected_subscription_period_started_at as same_period_start,
        s.current_period_ends_at = d.expected_subscription_period_ends_at as same_period_end,
        n.effective_from = d.expected_entitlement_effective_from as same_effective_from,
        n.effective_until = d.expected_entitlement_effective_until as same_effective_until
      from zaltyko.organization_saas_webhook_reconciliation_decisions d
      join zaltyko.organization_saas_webhook_events e on e.id = d.webhook_event_id
      join zaltyko.organization_saas_subscriptions s on s.organization_id = d.organization_id
      join zaltyko.organization_entitlements n on n.organization_id = d.organization_id
      where d.id = ${confirmed.decisionId}::uuid
    `);
    expect(compared).toEqual({
      subscription_updated_at: compared?.decision_updated_at,
      decision_updated_at: expect.stringContaining(".123456"),
      same_updated_at: true,
      same_event_created_at: true,
      same_period_start: true,
      same_period_end: true,
      same_effective_from: true,
      same_effective_until: true,
    });

    // The consumer compares those values as text, so the decision still applies.
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });
  }, 30_000);
});
