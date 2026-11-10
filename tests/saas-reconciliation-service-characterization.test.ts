/**
 * Characterization tests for the SaaS webhook reconciliation service.
 *
 * They pin the CURRENT behaviour of `reconciliation-service.ts` before any
 * refactor: input validation, error codes, the signed preview token, evidence
 * extraction from Stripe objects (prices, amounts, currency, periods),
 * idempotent confirmation and the batch consumer outcomes.
 *
 * The database is a synthetic fake: every SQL statement is compiled with
 * PgDialect, classified by its text and answered by the scenario. The tests
 * pin the order of the statements (and the transaction each one runs in),
 * their exact parameters and, through a file snapshot, their normalized SQL
 * text. The fake does NOT evaluate WHERE or SET clauses, row locks or
 * constraints: saas-reconciliation-service-pg.test.ts covers those on a
 * disposable PostgreSQL. No real Postgres or Stripe is touched here, so this
 * file runs in the regular Unit Tests job (no ZALTYKO_PG_INTEGRATION needed).
 *
 * Tests named "CURRENT BEHAVIOUR" pin behaviour that looks like a bug. They
 * exist so a refactor does not change it by accident; fixing it is a separate,
 * deliberate change.
 */
import { createHash, createHmac } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    execute: mocks.execute,
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));

import {
  confirmSaasReconciliation,
  consumeSaasReconciliationBatch,
  createSaasReconciliationRequestHash,
  normalizeSaasReconciliationReason,
  previewSaasReconciliation,
  type SaasReconciliationDependencies,
  type StripeReconciliationProvider,
} from "@/modules/saas-billing/application/reconciliation-service";
import type { SaasStripeConfig } from "@/modules/saas-billing/application/saas-billing-config";
import { OperationalError } from "@/modules/shared/domain/operational-error";

// ---------------------------------------------------------------------------
// Synthetic identities and clock
// ---------------------------------------------------------------------------

const eventId = "20000000-0000-4000-8000-000000000001";
const actorId = "20000000-0000-4000-8000-000000000002";
const organizationId = "20000000-0000-4000-8000-000000000003";
const subscriptionId = "20000000-0000-4000-8000-000000000004";
const decisionId = "20000000-0000-4000-8000-000000000005";
const previousDecisionId = "20000000-0000-4000-8000-000000000006";
const leaseToken = "20000000-0000-4000-8000-000000000007";
const trialId = "20000000-0000-4000-8000-000000000008";
const otherActorId = "20000000-0000-4000-8000-000000000009";

const T0 = new Date("2026-11-10T12:00:00.000Z");
const periodStart = "2026-11-01T00:00:00.000Z";
const periodEnd = "2026-12-01T00:00:00.000Z";
const pgPeriodStart = "2026-11-01 00:00:00+00";
const pgPeriodEnd = "2026-12-01 00:00:00+00";
const SECRET = "s".repeat(32);
const REASON = "  Resolución manual del evento ambiguo tras revisar Stripe  ";
const NORMALIZED_REASON = "Resolución manual del evento ambiguo tras revisar Stripe";

const config: SaasStripeConfig = {
  environment: "test",
  secretKey: "sk_test_synthetic",
  webhookSecret: "whsec_synthetic",
  providerAccountReference: "acct_synthetic",
  portalEnabled: false,
  prices: {
    starter: { month: "price_starter_month", year: "price_starter_year" },
    growth: { month: "price_growth_month", year: "price_growth_year" },
  },
};

const epoch = (iso: string) => Date.parse(iso) / 1000;
const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonical(source[key])])
    );
  }
  return value;
}
const canonicalHash = (value: unknown) => sha256(JSON.stringify(canonical(value)));

// ---------------------------------------------------------------------------
// Stripe fixtures
// ---------------------------------------------------------------------------

const unitAmounts = {
  starter: { month: 1900, year: 19000 },
  growth: { month: 4900, year: 49000 },
} as const;

function stripePrice(
  planCode: "starter" | "growth" = "starter",
  interval: "month" | "year" = "month",
  overrides: Record<string, unknown> = {}
) {
  return {
    id: config.prices[planCode][interval],
    active: true,
    livemode: false,
    currency: "eur",
    type: "recurring",
    recurring: { interval, interval_count: 1 },
    unit_amount: unitAmounts[planCode][interval],
    ...overrides,
  };
}

function stripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_synthetic",
    customer: "cus_synthetic",
    livemode: false,
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    current_period_start: epoch(periodStart),
    current_period_end: epoch(periodEnd),
    latest_invoice: "in_synthetic",
    items: { data: [{ quantity: 1, price: stripePrice() }] },
    ...overrides,
  };
}

function stripeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_synthetic",
    livemode: false,
    status: "paid",
    currency: "eur",
    customer: "cus_synthetic",
    subscription: "sub_synthetic",
    amount_paid: 1900,
    lines: {
      data: [
        {
          price: { id: "price_starter_month" },
          period: { start: epoch(periodStart), end: epoch(periodEnd) },
        },
      ],
    },
    ...overrides,
  };
}

const expectedSubscriptionEvidence = {
  reference: "sub_synthetic",
  customerReference: "cus_synthetic",
  planCode: "starter",
  billingInterval: "month",
  providerStatus: "active",
  cancelAtPeriodEnd: false,
  canceledAt: null,
  currentPeriodStartedAt: periodStart,
  currentPeriodEndsAt: periodEnd,
  priceReference: "price_starter_month",
  latestInvoiceReference: "in_synthetic",
};

const expectedPaidInvoiceEvidence = {
  reference: "in_synthetic",
  status: "paid",
  customerReference: "cus_synthetic",
  subscriptionReference: "sub_synthetic",
  currency: "eur",
  paidAmount: 1900,
  periodStartedAt: periodStart,
  periodEndsAt: periodEnd,
  priceReference: "price_starter_month",
  planCode: "starter",
};

// ---------------------------------------------------------------------------
// Database rows
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function eventRow(overrides: Row = {}): Row {
  return {
    id: eventId,
    organization_id: organizationId,
    provider_account_reference: "acct_synthetic",
    environment: "test",
    provider_event_id: "evt_synthetic",
    event_account_reference: null,
    event_type: "customer.subscription.updated",
    event_created_at: "2026-11-09 08:00:00+00",
    provider_object_reference: "sub_synthetic",
    livemode: false,
    payload_sha256: "a".repeat(64),
    status: "quarantined",
    last_error_code: "ambiguous_event_order",
    fencing_version: 3,
    reconciliation_decision_id: null,
    ...overrides,
  };
}

function baselineRow(overrides: Row = {}): Row {
  return {
    subscription_id: subscriptionId,
    organization_id: organizationId,
    environment: "test",
    provider_account_reference: "acct_synthetic",
    customer_reference: "cus_synthetic",
    subscription_reference: "sub_synthetic",
    price_reference: "price_starter_month",
    subscription_plan_code: "starter",
    provider_status: "active",
    billing_interval: "month",
    subscription_period_started_at: pgPeriodStart,
    subscription_period_ends_at: pgPeriodEnd,
    cancel_at_period_end: false,
    subscription_canceled_at: null,
    last_provider_event_reference: "evt_previous",
    subscription_updated_at: "2026-11-01 00:00:05.123456+00",
    entitlement_revision: 4,
    entitlement_plan_code: "starter",
    entitlement_source: "stripe_subscription",
    entitlement_source_reference: "stripe-invoice:in_previous",
    entitlement_subscription_id: subscriptionId,
    entitlement_trial_id: null,
    entitlement_effective_from: pgPeriodStart,
    entitlement_effective_until: pgPeriodEnd,
    ...overrides,
  };
}

function lockedSubscriptionRow(overrides: Row = {}): Row {
  return {
    id: subscriptionId,
    organization_id: organizationId,
    environment: "test",
    provider_account_reference: "acct_synthetic",
    customer_reference: "cus_synthetic",
    subscription_reference: "sub_synthetic",
    price_reference: "price_starter_month",
    plan_code: "starter",
    provider_status: "active",
    billing_interval: "month",
    current_period_started_at: pgPeriodStart,
    current_period_ends_at: pgPeriodEnd,
    cancel_at_period_end: false,
    canceled_at: null,
    last_provider_event_reference: "evt_previous",
    updated_at: "2026-11-01 00:00:05.123456+00",
    ...overrides,
  };
}

function lockedEntitlementRow(overrides: Row = {}): Row {
  return {
    revision: 4,
    plan_code: "starter",
    source: "stripe_subscription",
    source_reference: "stripe-invoice:in_previous",
    subscription_id: subscriptionId,
    trial_id: null,
    effective_from: pgPeriodStart,
    effective_until: pgPeriodEnd,
    ...overrides,
  };
}

function decisionRow(snapshotSha256: string, overrides: Row = {}): Row {
  return {
    id: decisionId,
    organization_id: organizationId,
    webhook_event_id: eventId,
    actor_user_id: actorId,
    request_id: "req-confirm",
    idempotency_key: "confirm-key-0001",
    confirmation_request_sha256: "b".repeat(64),
    resolution_kind: "status_snapshot",
    reason: NORMALIZED_REASON,
    provider_account_reference: "acct_synthetic",
    environment: "test",
    provider_event_id: "evt_synthetic",
    event_created_at: "2026-11-09 08:00:00+00",
    provider_object_reference: "sub_synthetic",
    payload_sha256: "a".repeat(64),
    preview_token_sha256: "c".repeat(64),
    preview_issued_at: T0.toISOString(),
    preview_expires_at: new Date(T0.getTime() + 5 * 60_000).toISOString(),
    expected_fencing_version: 3,
    expected_last_provider_event_reference: "evt_previous",
    expected_subscription_updated_at: "2026-11-01 00:00:05.123456+00",
    expected_subscription_plan_code: "starter",
    expected_subscription_price_reference: "price_starter_month",
    expected_subscription_billing_interval: "month",
    expected_subscription_provider_status: "active",
    expected_subscription_cancel_at_period_end: false,
    expected_subscription_canceled_at: null,
    expected_subscription_period_started_at: pgPeriodStart,
    expected_subscription_period_ends_at: pgPeriodEnd,
    expected_entitlement_revision: 4,
    expected_entitlement_plan_code: "starter",
    expected_entitlement_source: "stripe_subscription",
    expected_entitlement_source_reference: "stripe-invoice:in_previous",
    expected_entitlement_subscription_id: subscriptionId,
    expected_entitlement_trial_id: null,
    expected_entitlement_effective_from: pgPeriodStart,
    expected_entitlement_effective_until: pgPeriodEnd,
    evidence_observed_at: T0.toISOString(),
    execution_expires_at: new Date(T0.getTime() + 2 * 60_000).toISOString(),
    snapshot_sha256: snapshotSha256,
    observed_subscription_reference: "sub_synthetic",
    observed_customer_reference: "cus_synthetic",
    observed_plan_code: "starter",
    observed_provider_status: "active",
    observed_cancel_at_period_end: false,
    observed_canceled_at: null,
    observed_current_period_started_at: periodStart,
    observed_current_period_ends_at: periodEnd,
    observed_price_reference: "price_starter_month",
    observed_latest_invoice_reference: "in_synthetic",
    invoice_reference: null,
    invoice_status: null,
    invoice_customer_reference: null,
    invoice_subscription_reference: null,
    invoice_currency: null,
    invoice_paid_amount: null,
    invoice_period_started_at: null,
    invoice_period_ends_at: null,
    invoice_price_reference: null,
    invoice_plan_code: null,
    ...overrides,
  };
}

function claimRow(overrides: Row = {}): Row {
  return {
    id: eventId,
    decision_id: decisionId,
    lease_token: leaseToken,
    lease_until: "2026-11-10 12:01:00+00",
    fencing_version: 5,
    attempts: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fake database: classify each compiled statement and answer from the scenario
// ---------------------------------------------------------------------------

type Statement =
  | "claimEvents"
  | "scheduleRetry"
  | "linkDecision"
  | "finishStale"
  | "finishEvent"
  | "insertDecision"
  | "insertResult"
  | "insertAudit"
  | "updateSubscription"
  | "updateTrial"
  | "updateEntitlement"
  | "lockOrganization"
  | "lockBaseline"
  | "readBaseline"
  | "lockSubscription"
  | "lockEntitlement"
  | "staleResult"
  | "resultOutcome"
  | "findDecisionByKey"
  | "readDecision"
  | "lockClaimedEvent"
  | "lockEvent"
  | "readEvent";

function classify(sqlText: string): Statement {
  const s = sqlText.replace(/\s+/g, " ").trim().toLowerCase();
  if (s.startsWith("with candidates as")) return "claimEvents";
  if (s.startsWith("update zaltyko.organization_saas_webhook_events")) {
    if (s.includes("set status = 'failed'")) return "scheduleRetry";
    if (s.includes("set reconciliation_decision_id")) return "linkDecision";
    if (s.includes("set status = 'quarantined'")) return "finishStale";
    return "finishEvent";
  }
  if (s.startsWith("insert into zaltyko.organization_saas_webhook_reconciliation_decisions")) return "insertDecision";
  if (s.startsWith("insert into zaltyko.organization_saas_webhook_reconciliation_results")) return "insertResult";
  if (s.startsWith("insert into zaltyko.audit_log")) return "insertAudit";
  if (s.startsWith("update zaltyko.organization_saas_subscriptions")) return "updateSubscription";
  if (s.startsWith("update zaltyko.organization_saas_trials")) return "updateTrial";
  if (s.startsWith("update zaltyko.organization_entitlements")) return "updateEntitlement";
  if (s.startsWith("select id from zaltyko.organizations")) return "lockOrganization";
  if (s.includes("join zaltyko.organization_entitlements e")) {
    return s.includes("for update of s, e") ? "lockBaseline" : "readBaseline";
  }
  if (s.includes("from zaltyko.organization_saas_subscriptions where")) return "lockSubscription";
  if (s.includes("from zaltyko.organization_entitlements where")) return "lockEntitlement";
  if (s.includes("from zaltyko.organization_saas_webhook_reconciliation_results result")) return "staleResult";
  if (s.startsWith("select outcome from zaltyko.organization_saas_webhook_reconciliation_results")) return "resultOutcome";
  if (s.startsWith("select * from zaltyko.organization_saas_webhook_reconciliation_decisions")) return "findDecisionByKey";
  if (s.includes("from zaltyko.organization_saas_webhook_reconciliation_decisions where id")) return "readDecision";
  if (s.includes("from zaltyko.organization_saas_webhook_events")) {
    if (s.includes("and status = 'processing'")) return "lockClaimedEvent";
    if (s.includes("for update")) return "lockEvent";
    return "readEvent";
  }
  throw new Error(`Unexpected SQL statement in characterization test: ${s.slice(0, 160)}`);
}

type Handler = (params: unknown[], previousCalls: number) => Row[];
type Call = {
  name: Statement;
  params: unknown[];
  inTransaction: boolean;
  /** 1-based number of the db.transaction the statement ran in, or null. */
  transaction: number | null;
  /** Compiled SQL with whitespace collapsed. */
  sql: string;
};

const world: {
  operator: Row[];
  handlers: Partial<Record<Statement, Handler>>;
  calls: Call[];
  transactions: number;
  stripeSubscription: unknown;
  stripeInvoice: unknown;
} = {
  operator: [],
  handlers: {},
  calls: [],
  transactions: 0,
  stripeSubscription: null,
  stripeInvoice: null,
};

const dialect = new PgDialect();
const normalizeSql = (text: string) => text.replace(/\s+/g, " ").trim();

async function run(query: unknown, transaction: number | null) {
  const compiled = dialect.sqlToQuery(query as never);
  const name = classify(compiled.sql);
  const previousCalls = world.calls.filter((call) => call.name === name).length;
  world.calls.push({
    name,
    params: compiled.params,
    inTransaction: transaction !== null,
    transaction,
    sql: normalizeSql(compiled.sql),
  });
  const handler = world.handlers[name];
  if (!handler) {
    throw new Error(`No synthetic answer for SQL statement "${name}"`);
  }
  return { rows: handler(compiled.params, previousCalls) };
}

const callsOf = (name: Statement) => world.calls.filter((call) => call.name === name);
const paramsOf = (name: Statement) => callsOf(name).map((call) => call.params);
/** Statement order, tagged "@txN" when the statement ran inside transaction N. */
const trace = () =>
  world.calls.map((call) =>
    call.transaction === null ? call.name : `${call.name}@tx${call.transaction}`
  );

function clearCalls() {
  world.calls = [];
  world.transactions = 0;
}

function resetWorld() {
  world.operator = [{ role: "super_admin", isSuspended: false }];
  clearCalls();
  world.stripeSubscription = stripeSubscription();
  world.stripeInvoice = stripeInvoice();
  world.handlers = {
    readEvent: () => [eventRow()],
    lockEvent: () => [eventRow()],
    readBaseline: () => [baselineRow()],
    lockBaseline: () => [baselineRow()],
    lockOrganization: () => [{ id: organizationId }],
    staleResult: () => [],
    resultOutcome: () => [],
    findDecisionByKey: () => [],
    insertDecision: () => [],
    linkDecision: () => [{ id: eventId }],
    insertAudit: () => [],
    claimEvents: () => [],
    readDecision: () => [],
    scheduleRetry: () => [{ id: eventId }],
    lockClaimedEvent: () => [eventRow({ status: "processing" })],
    lockSubscription: () => [lockedSubscriptionRow()],
    lockEntitlement: () => [lockedEntitlementRow()],
    insertResult: () => [],
    finishEvent: () => [{ id: eventId }],
    finishStale: () => [{ id: eventId }],
    updateSubscription: () => [],
    updateTrial: () => [],
    updateEntitlement: () => [
      lockedEntitlementRow({
        revision: 5,
        source_reference: "stripe-invoice:in_synthetic",
      }),
    ],
  };
}

let provider: {
  retrieveSubscription: ReturnType<typeof vi.fn>;
  retrieveInvoice: ReturnType<typeof vi.fn>;
};

function dependencies(
  overrides: SaasReconciliationDependencies = {}
): SaasReconciliationDependencies {
  return {
    config,
    signingSecret: SECRET,
    provider: provider as unknown as StripeReconciliationProvider,
    now: () => new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STRIPE_SAAS_ENVIRONMENT", "");
  vi.stubEnv("SAAS_RECONCILIATION_SIGNING_SECRET", "");
  resetWorld();
  provider = {
    retrieveSubscription: vi.fn(async () => world.stripeSubscription),
    retrieveInvoice: vi.fn(async () => world.stripeInvoice),
  };
  mocks.execute.mockReset();
  mocks.select.mockReset();
  mocks.transaction.mockReset();
  mocks.execute.mockImplementation((query: unknown) => run(query, null));
  mocks.transaction.mockImplementation(
    async (callback: (tx: { execute: (query: unknown) => Promise<unknown> }) => unknown) => {
      const transaction = ++world.transactions;
      return callback({ execute: (query: unknown) => run(query, transaction) });
    }
  );
  mocks.select.mockImplementation(() => ({
    from: () => ({ where: () => ({ limit: async () => world.operator }) }),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExpectedFailure = { code: string; status: number; publicCode?: string };

function failureShape(error: unknown) {
  expect(error).toBeInstanceOf(OperationalError);
  const operational = error as OperationalError;
  return {
    code: operational.code,
    status: operational.status,
    publicCode: operational.details?.code,
  };
}

async function expectFailure(promise: Promise<unknown>, expected: ExpectedFailure) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  );
  expect(error, "expected the call to reject").not.toBeNull();
  expect(failureShape(error)).toEqual({
    code: expected.code,
    status: expected.status,
    publicCode: expected.publicCode,
  });
}

function expectSyncFailure(callback: () => unknown, expected: ExpectedFailure) {
  let error: unknown = null;
  try {
    callback();
  } catch (caught) {
    error = caught;
  }
  expect(error, "expected the call to throw").not.toBeNull();
  expect(failureShape(error)).toEqual({
    code: expected.code,
    status: expected.status,
    publicCode: expected.publicCode,
  });
}

function decodeToken(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  return JSON.parse(
    inflateRawSync(Buffer.from(payload!, "base64url")).toString("utf8")
  ) as Record<string, unknown>;
}

const previewInput = {
  eventId,
  actorUserId: actorId,
  requestId: "req-preview",
};

async function preview(overrides: SaasReconciliationDependencies = {}) {
  return previewSaasReconciliation(previewInput, dependencies(overrides));
}

function confirmInput(previewToken: string, overrides: Record<string, string> = {}) {
  return {
    eventId,
    actorUserId: actorId,
    requestId: " req-confirm ",
    previewToken,
    reason: REASON,
    idempotencyKey: "  confirm-key-0001  ",
    ...overrides,
  };
}

const STATE_CHANGED = { code: "VERSION_CONFLICT", status: 409, publicCode: "STATE_CHANGED" };
const PREVIEW_STALE = { code: "VERSION_CONFLICT", status: 409, publicCode: "PREVIEW_STALE" };
const BAD_REQUEST = { code: "VERSION_CONFLICT", status: 400 };
const PROVIDER_EVIDENCE = {
  code: "UNVERIFIED_PROVIDER_EVENT",
  status: 409,
  publicCode: "PROVIDER_UNAVAILABLE",
};
const NON_CANONICAL_PRICE = {
  code: "PRICE_PLAN_NOT_AVAILABLE",
  status: 409,
  publicCode: "UNSUPPORTED_QUARANTINE",
};

// ---------------------------------------------------------------------------
// normalizeSaasReconciliationReason
// ---------------------------------------------------------------------------

describe("normalizeSaasReconciliationReason", () => {
  it("trims and NFC-normalizes the reason", () => {
    expect(normalizeSaasReconciliationReason(REASON)).toBe(NORMALIZED_REASON);
    const decomposed = "Revisión: el café se cobró por transferencia";
    expect(normalizeSaasReconciliationReason(decomposed)).toBe(
      "Revisión: el café se cobró por transferencia"
    );
  });

  it("accepts 20 to 1000 characters counted as code points after trimming", () => {
    expect(normalizeSaasReconciliationReason("a".repeat(20))).toBe("a".repeat(20));
    expect(normalizeSaasReconciliationReason("a".repeat(1000))).toHaveLength(1000);
    expect(normalizeSaasReconciliationReason("🙂".repeat(20))).toBe("🙂".repeat(20));
  });

  it.each([
    ["19 characters", "a".repeat(19)],
    ["1001 characters", "a".repeat(1001)],
    ["19 emoji (38 UTF-16 units)", "🙂".repeat(19)],
    ["19 characters once trimmed", `   ${"a".repeat(19)}   `],
  ])("rejects %s with a 400", (_label, reason) => {
    expectSyncFailure(() => normalizeSaasReconciliationReason(reason), BAD_REQUEST);
  });
});

// ---------------------------------------------------------------------------
// createSaasReconciliationRequestHash
// ---------------------------------------------------------------------------

describe("createSaasReconciliationRequestHash", () => {
  const previewTokenSha256 = "d".repeat(64);

  it("hashes the canonical JSON of version, actor, preview hash and normalized reason", () => {
    const expected = sha256(
      JSON.stringify({
        actorUserId: actorId,
        previewTokenSha256,
        reason: NORMALIZED_REASON,
        version: 1,
      })
    );
    expect(
      createSaasReconciliationRequestHash({
        actorUserId: actorId,
        previewTokenSha256,
        reason: REASON,
      })
    ).toBe(expected);
  });

  it("is stable under reason normalization and changes with the actor", () => {
    const base = { actorUserId: actorId, previewTokenSha256, reason: NORMALIZED_REASON };
    const hash = createSaasReconciliationRequestHash(base);
    expect(createSaasReconciliationRequestHash({ ...base, reason: `\n${NORMALIZED_REASON}\t` })).toBe(hash);
    expect(createSaasReconciliationRequestHash({ ...base, actorUserId: otherActorId })).not.toBe(hash);
  });

  it("rejects an invalid reason", () => {
    expectSyncFailure(
      () =>
        createSaasReconciliationRequestHash({
          actorUserId: actorId,
          previewTokenSha256,
          reason: "corto",
        }),
      BAD_REQUEST
    );
  });
});

// ---------------------------------------------------------------------------
// previewSaasReconciliation
// ---------------------------------------------------------------------------

describe("previewSaasReconciliation: guards", () => {
  it.each([
    ["an invalid eventId", { eventId: "not-a-uuid" }],
    ["an invalid actorUserId", { actorUserId: "20000000-0000-0000-0000-000000000002" }],
    ["a blank requestId", { requestId: "   " }],
    ["a requestId longer than 200", { requestId: "r".repeat(201) }],
  ])("rejects %s with a 400 before touching the database", async (_label, override) => {
    await expectFailure(
      previewSaasReconciliation({ ...previewInput, ...override }, dependencies()),
      BAD_REQUEST
    );
    expect(mocks.select).not.toHaveBeenCalled();
    expect(world.calls).toEqual([]);
  });

  it.each([
    ["no profile", []],
    ["an owner", [{ role: "owner", isSuspended: false }]],
    ["a suspended super admin", [{ role: "super_admin", isSuspended: true }]],
  ])("requires an active platform operator (%s)", async (_label, operator) => {
    world.operator = operator;
    await expectFailure(preview(), { code: "FORBIDDEN", status: 403 });
    expect(world.calls).toEqual([]);
  });

  it("reports an unconfigured Stripe integration as PROVIDER_UNAVAILABLE", async () => {
    await expectFailure(
      previewSaasReconciliation(previewInput, {
        signingSecret: SECRET,
        provider: provider as unknown as StripeReconciliationProvider,
      }),
      { code: "FEATURE_NOT_AVAILABLE", status: 503, publicCode: "PROVIDER_UNAVAILABLE" }
    );
  });

  it("returns EVENT_NOT_FOUND for a missing event", async () => {
    world.handlers.readEvent = () => [];
    await expectFailure(preview(), { code: "NOT_FOUND", status: 404, publicCode: "EVENT_NOT_FOUND" });
  });

  it("hides events of another Stripe account or environment as not found", async () => {
    world.handlers.readEvent = () => [eventRow({ provider_account_reference: "acct_other" })];
    await expectFailure(preview(), { code: "NOT_FOUND", status: 404, publicCode: "EVENT_NOT_FOUND" });
    world.handlers.readEvent = () => [eventRow({ environment: "live" })];
    await expectFailure(preview(), { code: "NOT_FOUND", status: 404, publicCode: "EVENT_NOT_FOUND" });
  });

  it.each(["charge.refunded", "charge.dispute.created", "checkout.session.completed"])(
    "does not offer recovery for %s events",
    async (eventType) => {
      world.handlers.readEvent = () => [eventRow({ event_type: eventType })];
      await expectFailure(preview(), {
        code: "INVALID_STATE_TRANSITION",
        status: 409,
        publicCode: "UNSUPPORTED_QUARANTINE",
      });
      expect(provider.retrieveSubscription).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["not quarantined", { status: "processed" }],
    ["quarantined for another reason", { last_error_code: "signature_mismatch" }],
  ])("refuses an event that is %s", async (_label, override) => {
    world.handlers.readEvent = () => [eventRow(override)];
    await expectFailure(preview(), {
      code: "INVALID_STATE_TRANSITION",
      status: 409,
      publicCode: "RECONCILIATION_NOT_ALLOWED",
    });
  });

  it("allows a new preview only when the previous decision ended stale", async () => {
    world.handlers.readEvent = () => [eventRow({ reconciliation_decision_id: previousDecisionId })];
    world.handlers.staleResult = () => [{ outcome: "applied" }];
    await expectFailure(preview(), {
      code: "INVALID_STATE_TRANSITION",
      status: 409,
      publicCode: "RECONCILIATION_NOT_ALLOWED",
    });

    world.handlers.staleResult = () => [];
    await expectFailure(preview(), {
      code: "INVALID_STATE_TRANSITION",
      status: 409,
      publicCode: "RECONCILIATION_NOT_ALLOWED",
    });

    world.handlers.staleResult = () => [{ outcome: "stale" }];
    const result = await preview();
    expect(result.resolutionKind).toBe("status_snapshot");
    expect(callsOf("staleResult").at(-1)?.params).toEqual([previousDecisionId]);
  });

  it.each([
    ["livemode in a test account", { livemode: true }],
    ["a connected-account event", { event_account_reference: "acct_connected" }],
  ])("rejects an event identity with %s", async (_label, override) => {
    world.handlers.readEvent = () => [eventRow(override)];
    await expectFailure(preview(), STATE_CHANGED);
  });

  it("maps provider outages to PROVIDER_UNAVAILABLE", async () => {
    provider.retrieveSubscription.mockRejectedValueOnce(new Error("socket hang up"));
    await expectFailure(preview(), {
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
      publicCode: "PROVIDER_UNAVAILABLE",
    });
  });

  it("requires a signing secret of at least 32 bytes", async () => {
    await expectFailure(preview({ signingSecret: "x".repeat(31) }), {
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
    });
    await expectFailure(
      previewSaasReconciliation(previewInput, {
        config,
        provider: provider as unknown as StripeReconciliationProvider,
        now: () => new Date(),
      }),
      { code: "FEATURE_NOT_AVAILABLE", status: 503 }
    );
    // 16 characters but 32 UTF-8 bytes are enough.
    await expect(preview({ signingSecret: "ñ".repeat(16) })).resolves.toMatchObject({
      resolutionKind: "status_snapshot",
    });
  });
});

describe("previewSaasReconciliation: subscription snapshot", () => {
  it("returns a signed token, the expiry and the observed evidence", async () => {
    const result = await preview();
    const evidence = {
      subscription: expectedSubscriptionEvidence,
      invoice: null,
      statusInvoice: null,
    };
    expect(result).toEqual({
      previewToken: expect.stringMatching(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
      expiresAt: "2026-11-10T12:05:00.000Z",
      event: {
        id: eventId,
        type: "customer.subscription.updated",
        createdAt: "2026-11-09 08:00:00+00",
        objectReference: "sub_synthetic",
      },
      resolutionKind: "status_snapshot",
      snapshotSha256: canonicalHash(evidence),
      evidence,
    });
    expect(provider.retrieveInvoice).not.toHaveBeenCalled();
    expect(provider.retrieveSubscription).toHaveBeenCalledWith("sub_synthetic");
    expect(trace()).toEqual(["readEvent", "readBaseline"]);
    expect(paramsOf("readEvent")).toEqual([[eventId]]);
    // Scoped by the event's organization, environment and Stripe account.
    expect(paramsOf("readBaseline")).toEqual([
      [organizationId, "test", "acct_synthetic", "sub_synthetic"],
    ]);
  });

  it("signs the deflated canonical claims with HMAC-SHA256", async () => {
    const { previewToken } = await preview();
    const [version, payload, signature] = previewToken.split(".");
    expect(version).toBe("v1");
    expect(signature).toBe(
      createHmac("sha256", SECRET)
        .update(`saas-reconciliation-v1.${payload}`)
        .digest("base64url")
    );
    const claims = decodeToken(previewToken);
    expect(claims).toMatchObject({
      version: 1,
      actorUserId: actorId,
      eventId,
      organizationId,
      requestId: "req-preview",
      resolutionKind: "status_snapshot",
      issuedAt: "2026-11-10T12:00:00.000Z",
      expiresAt: "2026-11-10T12:05:00.000Z",
      evidenceObservedAt: "2026-11-10T12:00:00.000Z",
      executionExpiresAt: "2026-11-10T12:02:00.000Z",
      event: {
        providerAccountReference: "acct_synthetic",
        environment: "test",
        providerEventId: "evt_synthetic",
        eventCreatedAt: "2026-11-09 08:00:00+00",
        providerObjectReference: "sub_synthetic",
        payloadSha256: "a".repeat(64),
        eventType: "customer.subscription.updated",
        fencingVersion: 3,
        lastErrorCode: "ambiguous_event_order",
        previousDecisionId: null,
      },
      baseline: {
        subscription: {
          id: subscriptionId,
          plan_code: "starter",
          price_reference: "price_starter_month",
          updated_at: "2026-11-01 00:00:05.123456+00",
        },
        entitlement: {
          revision: 4,
          source_reference: "stripe-invoice:in_previous",
        },
      },
    });
  });

  it("reads the secret from SAAS_RECONCILIATION_SIGNING_SECRET, trimmed", async () => {
    const envSecret = "e".repeat(32);
    vi.stubEnv("SAAS_RECONCILIATION_SIGNING_SECRET", `  ${envSecret}  `);
    const { previewToken } = await previewSaasReconciliation(previewInput, {
      config,
      provider: provider as unknown as StripeReconciliationProvider,
      now: () => new Date(),
    });
    const [, payload, signature] = previewToken.split(".");
    expect(signature).toBe(
      createHmac("sha256", envSecret)
        .update(`saas-reconciliation-v1.${payload}`)
        .digest("base64url")
    );
  });

  it.each([
    ["starter", "year"],
    ["growth", "month"],
    ["growth", "year"],
  ] as const)("maps the canonical %s/%s price", async (planCode, interval) => {
    world.stripeSubscription = stripeSubscription({
      items: { data: [{ quantity: 1, price: stripePrice(planCode, interval) }] },
    });
    // The baseline must still be the same subscription and customer.
    const { evidence } = await preview();
    expect(evidence.subscription).toMatchObject({
      planCode,
      billingInterval: interval,
      priceReference: config.prices[planCode][interval],
    });
  });

  it.each([
    ["an amount one cent above the catalog", { unit_amount: 1901 }],
    ["an amount one cent below the catalog", { unit_amount: 1899 }],
    ["another currency", { currency: "usd" }],
    ["an uppercase currency", { currency: "EUR" }],
    ["an inactive price", { active: false }],
    ["a live price in the test account", { livemode: true }],
    ["a one-time price", { type: "one_time" }],
    ["an interval count of 2", { recurring: { interval: "month", interval_count: 2 } }],
    ["a mismatched interval", { recurring: { interval: "year", interval_count: 1 } }],
    ["an unknown price id", { id: "price_legacy" }],
  ])("rejects a subscription price with %s", async (_label, override) => {
    world.stripeSubscription = stripeSubscription({
      items: { data: [{ quantity: 1, price: stripePrice("starter", "month", override) }] },
    });
    await expectFailure(preview(), NON_CANONICAL_PRICE);
  });

  it.each([
    ["two units", { items: { data: [{ quantity: 2, price: stripePrice() }] } }],
    [
      "two items",
      {
        items: {
          data: [
            { quantity: 1, price: stripePrice() },
            { quantity: 1, price: stripePrice("growth", "month") },
          ],
        },
      },
    ],
    ["a live subscription", { livemode: true }],
    ["no customer", { customer: null }],
    ["an unknown status", { status: "on_hold" }],
    ["an end before the start", { current_period_end: epoch(periodStart) }],
    ["a non-numeric period", { current_period_start: periodStart }],
  ])("rejects a subscription with %s", async (_label, override) => {
    world.stripeSubscription = stripeSubscription(override);
    await expectFailure(preview(), PROVIDER_EVIDENCE);
  });

  it("rejects a subscription whose id differs from the requested one", async () => {
    world.stripeSubscription = stripeSubscription({ id: "sub_other" });
    await expectFailure(preview(), PROVIDER_EVIDENCE);
  });

  it("accepts item-level periods, object customers and cancellation fields", async () => {
    const subscription = stripeSubscription({
      customer: { id: "cus_synthetic" },
      status: "paused",
      cancel_at_period_end: true,
      canceled_at: epoch("2026-11-05T10:30:00.000Z"),
      latest_invoice: { id: "in_object" },
      current_period_start: undefined,
      current_period_end: undefined,
      items: {
        data: [
          {
            quantity: 1,
            price: stripePrice(),
            current_period_start: epoch(periodStart),
            current_period_end: epoch(periodEnd),
          },
        ],
      },
    });
    world.stripeSubscription = subscription;
    const { evidence } = await preview();
    expect(evidence.subscription).toEqual({
      ...expectedSubscriptionEvidence,
      providerStatus: "paused",
      cancelAtPeriodEnd: true,
      canceledAt: "2026-11-05T10:30:00.000Z",
      latestInvoiceReference: "in_object",
    });
  });

  it("treats cancel_at_period_end strictly as the boolean true", async () => {
    world.stripeSubscription = stripeSubscription({ cancel_at_period_end: "true" });
    const { evidence } = await preview();
    expect(evidence.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it.each([
    ["no canonical subscription", []],
    ["two canonical subscriptions", [baselineRow(), baselineRow()]],
    ["a subscription of another organization", [baselineRow({ organization_id: subscriptionId })]],
    ["another customer", [baselineRow({ customer_reference: "cus_other" })]],
  ])("rejects a baseline with %s", async (_label, rows) => {
    world.handlers.readBaseline = () => rows;
    await expectFailure(preview(), STATE_CHANGED);
  });
});

describe("previewSaasReconciliation: invoices", () => {
  function invoiceEvent(eventType: string) {
    world.handlers.readEvent = () => [
      eventRow({ event_type: eventType, provider_object_reference: "in_synthetic" }),
    ];
  }

  it("captures paid invoice evidence for invoice.paid", async () => {
    invoiceEvent("invoice.paid");
    const result = await preview();
    const evidence = {
      subscription: expectedSubscriptionEvidence,
      invoice: expectedPaidInvoiceEvidence,
      statusInvoice: null,
    };
    expect(result.resolutionKind).toBe("paid_invoice_grant");
    expect(result.evidence).toEqual(evidence);
    expect(result.snapshotSha256).toBe(canonicalHash(evidence));
    expect(provider.retrieveInvoice).toHaveBeenCalledWith("in_synthetic");
    expect(provider.retrieveSubscription).toHaveBeenCalledWith("sub_synthetic");
  });

  it.each([
    ["a zero amount (fully discounted)", 0],
    ["a one-cent partial amount", 1],
    ["an amount above the plan price", 999_999],
    ["the largest safe integer", Number.MAX_SAFE_INTEGER],
  ])("records the paid amount as-is for %s", async (_label, amountPaid) => {
    invoiceEvent("invoice.paid");
    world.stripeInvoice = stripeInvoice({ amount_paid: amountPaid });
    const { evidence } = await preview();
    expect(evidence.invoice?.paidAmount).toBe(amountPaid);
  });

  it("normalizes the invoice currency to lowercase eur", async () => {
    invoiceEvent("invoice.paid");
    world.stripeInvoice = stripeInvoice({ currency: "EUR" });
    const { evidence } = await preview();
    expect(evidence.invoice?.currency).toBe("eur");
  });

  it.each([
    ["a negative amount (refund-like)", { amount_paid: -1 }],
    ["a fractional amount", { amount_paid: 1900.5 }],
    ["an amount as text", { amount_paid: "1900" }],
    ["an unsafe integer amount", { amount_paid: Number.MAX_SAFE_INTEGER + 1 }],
    ["another currency", { currency: "usd" }],
    ["an open invoice", { status: "open" }],
    ["another customer", { customer: "cus_other" }],
    ["another subscription", { subscription: "sub_other" }],
    [
      "two lines (proration)",
      {
        lines: {
          data: [
            { price: { id: "price_starter_month" }, period: { start: epoch(periodStart), end: epoch(periodEnd) } },
            { price: { id: "price_starter_month" }, period: { start: epoch(periodStart), end: epoch(periodEnd) } },
          ],
        },
      },
    ],
    ["no lines", { lines: { data: [] } }],
    [
      "an empty period",
      {
        lines: {
          data: [{ price: { id: "price_starter_month" }, period: { start: epoch(periodStart), end: epoch(periodStart) } }],
        },
      },
    ],
  ])("rejects a paid invoice with %s", async (_label, override) => {
    invoiceEvent("invoice.paid");
    world.stripeInvoice = stripeInvoice(override);
    await expectFailure(preview(), PROVIDER_EVIDENCE);
  });

  it("rejects an invoice that does not match the signed event", async () => {
    invoiceEvent("invoice.paid");
    world.stripeInvoice = stripeInvoice({ id: "in_other" });
    await expectFailure(preview(), PROVIDER_EVIDENCE);
    world.stripeInvoice = stripeInvoice({ livemode: true });
    await expectFailure(preview(), PROVIDER_EVIDENCE);
  });

  it("reads the price and subscription from the newer Stripe invoice shape", async () => {
    invoiceEvent("invoice.paid");
    world.stripeInvoice = stripeInvoice({
      subscription: undefined,
      parent: { subscription_details: { subscription: "sub_synthetic" } },
      lines: {
        data: [
          {
            pricing: { price_details: { price: "price_growth_month" } },
            period: { start: epoch(periodStart), end: epoch(periodEnd) },
          },
        ],
      },
    });
    const { evidence } = await preview();
    expect(evidence.invoice).toEqual({
      ...expectedPaidInvoiceEvidence,
      priceReference: "price_growth_month",
      planCode: "growth",
    });
  });

  it("refuses an unmapped invoice price unless the entitlement already granted that invoice", async () => {
    invoiceEvent("invoice.paid");
    const legacyLine = {
      lines: {
        data: [{ price: { id: "price_legacy" }, period: { start: epoch(periodStart), end: epoch(periodEnd) } }],
      },
    };
    world.stripeInvoice = stripeInvoice(legacyLine);
    await expectFailure(preview(), NON_CANONICAL_PRICE);

    world.handlers.readBaseline = () => [
      baselineRow({
        entitlement_plan_code: "growth",
        entitlement_source_reference: "stripe-invoice:in_synthetic",
        entitlement_effective_from: periodStart,
        entitlement_effective_until: periodEnd,
      }),
    ];
    const { evidence } = await preview();
    expect(evidence.invoice).toMatchObject({ priceReference: "price_legacy", planCode: "growth" });
  });

  it("captures the failed invoice status for invoice.payment_failed", async () => {
    invoiceEvent("invoice.payment_failed");
    world.stripeInvoice = stripeInvoice({ status: "open", amount_paid: 0 });
    const result = await preview();
    expect(result.resolutionKind).toBe("status_snapshot");
    expect(result.evidence).toEqual({
      subscription: expectedSubscriptionEvidence,
      invoice: null,
      statusInvoice: {
        reference: "in_synthetic",
        status: "open",
        customerReference: "cus_synthetic",
        subscriptionReference: "sub_synthetic",
      },
    });

    world.stripeInvoice = stripeInvoice({ status: undefined });
    const unknown = await preview();
    expect(unknown.evidence.statusInvoice?.status).toBe("unknown");
  });

  it("rejects a failed invoice of another customer", async () => {
    invoiceEvent("invoice.payment_failed");
    world.stripeInvoice = stripeInvoice({ customer: "cus_other" });
    await expectFailure(preview(), STATE_CHANGED);
  });
});

// ---------------------------------------------------------------------------
// confirmSaasReconciliation
// ---------------------------------------------------------------------------

async function previewToken(): Promise<string> {
  const { previewToken: token } = await preview();
  clearCalls();
  return token;
}

/** Signs arbitrary claims with the test secret, as a forged-but-signed token. */
function signedToken(payload: Buffer): string {
  const encoded = payload.toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(`saas-reconciliation-v1.${encoded}`)
    .digest("base64url");
  return `v1.${encoded}.${signature}`;
}

const deflated = (value: unknown) =>
  deflateRawSync(Buffer.from(JSON.stringify(value), "utf8"));

/** Zips the column list of the decision INSERT with its parameters. */
function insertedDecision(): Row {
  const call = callsOf("insertDecision")[0]!;
  const columnList = /reconciliation_decisions \((.*?)\) values/.exec(call.sql)?.[1];
  const columns = (columnList ?? "").split(",").map((column) => column.trim());
  expect(columns).toHaveLength(60);
  expect(call.params).toHaveLength(columns.length);
  return Object.fromEntries(columns.map((column, index) => [column, call.params[index]]));
}

const noInvoiceColumns = {
  invoice_reference: null,
  invoice_status: null,
  invoice_customer_reference: null,
  invoice_subscription_reference: null,
  invoice_currency: null,
  invoice_paid_amount: null,
  invoice_period_started_at: null,
  invoice_period_ends_at: null,
  invoice_price_reference: null,
  invoice_plan_code: null,
};

/** Every column of the decision INSERT for the default status snapshot. */
function expectedDecisionColumns(token: string, overrides: Row = {}): Row {
  const claims = decodeToken(token);
  return {
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    organization_id: organizationId,
    webhook_event_id: eventId,
    actor_user_id: actorId,
    request_id: "req-confirm",
    idempotency_key: "confirm-key-0001",
    confirmation_request_sha256: requestHashFor(token),
    resolution_kind: "status_snapshot",
    reason: NORMALIZED_REASON,
    provider_account_reference: "acct_synthetic",
    environment: "test",
    provider_event_id: "evt_synthetic",
    event_created_at: "2026-11-09 08:00:00+00",
    provider_object_reference: "sub_synthetic",
    payload_sha256: "a".repeat(64),
    preview_token_sha256: sha256(token),
    preview_issued_at: "2026-11-10T12:00:00.000Z",
    preview_expires_at: "2026-11-10T12:05:00.000Z",
    expected_fencing_version: 3,
    expected_last_provider_event_reference: "evt_previous",
    expected_subscription_updated_at: "2026-11-01 00:00:05.123456+00",
    expected_subscription_plan_code: "starter",
    expected_subscription_price_reference: "price_starter_month",
    expected_subscription_billing_interval: "month",
    expected_subscription_provider_status: "active",
    expected_subscription_cancel_at_period_end: false,
    expected_subscription_canceled_at: null,
    expected_subscription_period_started_at: pgPeriodStart,
    expected_subscription_period_ends_at: pgPeriodEnd,
    expected_entitlement_revision: 4,
    expected_entitlement_plan_code: "starter",
    expected_entitlement_source: "stripe_subscription",
    expected_entitlement_source_reference: "stripe-invoice:in_previous",
    expected_entitlement_subscription_id: subscriptionId,
    expected_entitlement_trial_id: null,
    expected_entitlement_effective_from: pgPeriodStart,
    expected_entitlement_effective_until: pgPeriodEnd,
    evidence_observed_at: "2026-11-10T12:00:00.000Z",
    execution_expires_at: "2026-11-10T12:02:00.000Z",
    snapshot_sha256: claims.snapshotSha256,
    observed_subscription_reference: "sub_synthetic",
    observed_customer_reference: "cus_synthetic",
    observed_plan_code: "starter",
    observed_provider_status: "active",
    observed_cancel_at_period_end: false,
    observed_canceled_at: null,
    observed_current_period_started_at: periodStart,
    observed_current_period_ends_at: periodEnd,
    observed_price_reference: "price_starter_month",
    observed_latest_invoice_reference: "in_synthetic",
    ...noInvoiceColumns,
    ...overrides,
  };
}

function requestHashFor(token: string, actor = actorId) {
  return createSaasReconciliationRequestHash({
    actorUserId: actor,
    previewTokenSha256: sha256(token),
    reason: REASON,
  });
}

/** Last preview token of a test, for cases that build forged claims from it. */
let lastToken = "";

describe("confirmSaasReconciliation", () => {
  it("queues a decision, links it to the inbox event and audits it", async () => {
    const token = await previewToken();
    vi.setSystemTime(new Date(T0.getTime() + 60_000));
    const result = await confirmSaasReconciliation(confirmInput(token), dependencies());

    expect(result).toEqual({
      decisionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      eventId,
      status: "queued",
    });
    expect(trace()).toEqual([
      "findDecisionByKey",
      "readEvent",
      "readEvent",
      "lockEvent@tx1",
      "findDecisionByKey@tx1",
      "lockOrganization@tx1",
      "lockBaseline@tx1",
      "insertDecision@tx1",
      "linkDecision@tx1",
      "insertAudit@tx1",
    ]);
    expect(paramsOf("findDecisionByKey")).toEqual([
      [eventId, "confirm-key-0001"],
      [eventId, "confirm-key-0001"],
    ]);
    expect(paramsOf("readEvent")).toEqual([[eventId], [eventId]]);
    expect(paramsOf("lockEvent")).toEqual([[eventId]]);
    expect(paramsOf("lockOrganization")).toEqual([[organizationId]]);
    expect(paramsOf("lockBaseline")).toEqual([
      [organizationId, "test", "acct_synthetic", "sub_synthetic"],
    ]);

    // Every column of the INSERT paired with its value (catches swapped columns).
    const decision = insertedDecision();
    expect(decision).toEqual(
      expectedDecisionColumns(token, {
        id: result.decisionId,
        evidence_observed_at: "2026-11-10T12:01:00.000Z",
        execution_expires_at: "2026-11-10T12:03:00.000Z",
      })
    );
    expect(decision.snapshot_sha256).toBe(subscriptionSnapshotHash);

    expect(paramsOf("linkDecision")).toEqual([[result.decisionId, eventId, 3]]);

    const auditParams = callsOf("insertAudit")[0]!.params;
    expect(auditParams.slice(0, 6)).toEqual([
      organizationId,
      actorId,
      "saas_webhook.quarantine_resolution_authorized",
      eventId,
      "req-confirm",
      `${result.decisionId}:authorized`,
    ]);
    expect(JSON.parse(auditParams[6] as string)).toEqual({ status: "quarantined", fencingVersion: 3 });
    expect(JSON.parse(auditParams[7] as string)).toEqual({
      status: "received",
      decisionId: result.decisionId,
      resolutionKind: "status_snapshot",
    });
    expect(JSON.parse(auditParams[8] as string)).toEqual({
      decisionId: result.decisionId,
      snapshotSha256: decodeToken(token).snapshotSha256,
      reasonSha256: sha256(NORMALIZED_REASON),
    });
  });

  it("stores the paid invoice amount and currency in the decision", async () => {
    world.handlers.readEvent = () => [
      eventRow({ event_type: "invoice.paid", provider_object_reference: "in_synthetic" }),
    ];
    world.handlers.lockEvent = world.handlers.readEvent;
    world.stripeInvoice = stripeInvoice({ amount_paid: 1 });
    const token = await previewToken();
    await confirmSaasReconciliation(confirmInput(token), dependencies());
    expect(insertedDecision()).toEqual(
      expectedDecisionColumns(token, {
        resolution_kind: "paid_invoice_grant",
        provider_object_reference: "in_synthetic",
        invoice_reference: "in_synthetic",
        invoice_status: "paid",
        invoice_customer_reference: "cus_synthetic",
        invoice_subscription_reference: "sub_synthetic",
        invoice_currency: "eur",
        invoice_paid_amount: 1,
        invoice_period_started_at: periodStart,
        invoice_period_ends_at: periodEnd,
        invoice_price_reference: "price_starter_month",
        invoice_plan_code: "starter",
      })
    );
  });

  it("stores only the status columns of a failed invoice", async () => {
    world.handlers.readEvent = () => [
      eventRow({ event_type: "invoice.payment_failed", provider_object_reference: "in_synthetic" }),
    ];
    world.handlers.lockEvent = world.handlers.readEvent;
    world.stripeInvoice = stripeInvoice({ status: "open", amount_paid: 0 });
    const token = await previewToken();
    await confirmSaasReconciliation(confirmInput(token), dependencies());
    expect(insertedDecision()).toEqual(
      expectedDecisionColumns(token, {
        provider_object_reference: "in_synthetic",
        invoice_reference: "in_synthetic",
        invoice_status: "open",
        invoice_customer_reference: "cus_synthetic",
        invoice_subscription_reference: "sub_synthetic",
      })
    );
  });

  it("validates the request before touching the database", async () => {
    const token = await previewToken();
    await expectFailure(
      confirmSaasReconciliation(confirmInput(token, { idempotencyKey: " 1234567 " }), dependencies()),
      BAD_REQUEST
    );
    await expectFailure(
      confirmSaasReconciliation(confirmInput(token, { idempotencyKey: "k".repeat(151) }), dependencies()),
      BAD_REQUEST
    );
    await expectFailure(
      confirmSaasReconciliation(confirmInput(token, { reason: "demasiado corto" }), dependencies()),
      BAD_REQUEST
    );
    expect(world.calls).toEqual([]);
  });

  it.each([
    ["a tampered signature", (token: string) => {
      const [version, payload, signature] = token.split(".");
      const first = signature!.startsWith("A") ? "B" : "A";
      return `${version}.${payload}.${first}${signature!.slice(1)}`;
    }],
    ["an extra segment", (token: string) => `${token}.extra`],
    ["another version", (token: string) => token.replace(/^v1\./, "v2.")],
  ])("rejects a preview token with %s as PREVIEW_STALE", async (_label, mutate) => {
    const token = await previewToken();
    await expectFailure(confirmSaasReconciliation(confirmInput(mutate(token)), dependencies()), PREVIEW_STALE);
    expect(world.calls).toEqual([]);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await previewToken();
    await expectFailure(
      confirmSaasReconciliation(confirmInput(token), dependencies({ signingSecret: "t".repeat(32) })),
      PREVIEW_STALE
    );
  });

  it("rejects an oversized token with a 400", async () => {
    await expectFailure(
      confirmSaasReconciliation(confirmInput(`v1.${"a".repeat(16_400)}.sig`), dependencies()),
      BAD_REQUEST
    );
  });

  it("rejects a preview issued to another operator", async () => {
    const token = await previewToken();
    await expectFailure(
      confirmSaasReconciliation(confirmInput(token, { actorUserId: otherActorId }), dependencies()),
      { code: "FORBIDDEN", status: 403 }
    );
  });

  it("replays an existing decision for the same key and request", async () => {
    const token = await previewToken();
    const existing = decisionRow("e".repeat(64), {
      confirmation_request_sha256: requestHashFor(token),
    });
    world.handlers.findDecisionByKey = () => [existing];

    await expect(confirmSaasReconciliation(confirmInput(token), dependencies())).resolves.toEqual({
      decisionId,
      eventId,
      status: "replayed",
    });

    world.handlers.resultOutcome = () => [{ outcome: "applied" }];
    await expect(confirmSaasReconciliation(confirmInput(token), dependencies())).resolves.toEqual({
      decisionId,
      eventId,
      status: "completed",
      outcome: "applied",
    });
    expect(provider.retrieveSubscription).toHaveBeenCalledTimes(1);
    expect(callsOf("insertDecision")).toEqual([]);
  });

  it("refuses to reuse a key with another request or operator", async () => {
    const token = await previewToken();
    world.handlers.findDecisionByKey = () => [
      decisionRow("e".repeat(64), { confirmation_request_sha256: "f".repeat(64) }),
    ];
    await expectFailure(confirmSaasReconciliation(confirmInput(token), dependencies()), {
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
      publicCode: "IDEMPOTENCY_KEY_REUSED",
    });

    world.handlers.findDecisionByKey = () => [
      decisionRow("e".repeat(64), {
        actor_user_id: otherActorId,
        confirmation_request_sha256: requestHashFor(token),
      }),
    ];
    await expectFailure(confirmSaasReconciliation(confirmInput(token), dependencies()), {
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
      publicCode: "IDEMPOTENCY_KEY_REUSED",
    });
  });

  it("replays the winner when a concurrent confirmation commits first", async () => {
    const token = await previewToken();
    world.handlers.findDecisionByKey = (_params, previousCalls) =>
      previousCalls === 0
        ? []
        : [decisionRow("e".repeat(64), { confirmation_request_sha256: requestHashFor(token) })];
    await expect(confirmSaasReconciliation(confirmInput(token), dependencies())).resolves.toEqual({
      decisionId,
      eventId,
      status: "replayed",
    });
    expect(callsOf("insertDecision")).toEqual([]);
  });

  it("rejects an expired preview", async () => {
    const token = await previewToken();
    vi.setSystemTime(new Date(T0.getTime() + 5 * 60_000));
    await expectFailure(confirmSaasReconciliation(confirmInput(token), dependencies()), PREVIEW_STALE);
    expect(callsOf("insertDecision")).toEqual([]);
  });

  it("rejects the confirmation when Stripe evidence changed since the preview", async () => {
    const token = await previewToken();
    world.stripeSubscription = stripeSubscription({ status: "past_due" });
    await expectFailure(confirmSaasReconciliation(confirmInput(token), dependencies()), PREVIEW_STALE);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects the confirmation when the inbox event changed", async () => {
    const token = await previewToken();
    world.handlers.readEvent = () => [eventRow({ fencing_version: 4 })];
    await expectFailure(confirmSaasReconciliation(confirmInput(token), dependencies()), STATE_CHANGED);
  });

  it("rejects the confirmation when the locked subscription or entitlement changed", async () => {
    const token = await previewToken();
    world.handlers.lockBaseline = () => [
      baselineRow({ subscription_updated_at: "2026-11-10 11:59:00+00" }),
    ];
    await expectFailure(confirmSaasReconciliation(confirmInput(token), dependencies()), STATE_CHANGED);
    expect(callsOf("insertDecision")).toEqual([]);

    world.handlers.lockBaseline = () => [baselineRow({ entitlement_revision: 5 })];
    await expectFailure(confirmSaasReconciliation(confirmInput(token), dependencies()), STATE_CHANGED);
  });

  it("fails when the inbox row can no longer be linked", async () => {
    const token = await previewToken();
    world.handlers.linkDecision = () => [];
    await expectFailure(confirmSaasReconciliation(confirmInput(token), dependencies()), STATE_CHANGED);
    expect(callsOf("insertAudit")).toEqual([]);
  });

  // Concurrency guard on the row locked inside the transaction (L1274-1289):
  // the unlocked re-read passed, but the locked row changed meanwhile.
  it.each([
    ["has disappeared", () => []],
    ["has another fencing version", () => [eventRow({ fencing_version: 4 })]],
    ["was already requeued", () => [eventRow({ status: "received" })]],
    ["got another decision", () => [eventRow({ reconciliation_decision_id: previousDecisionId })]],
    ["changed its error code", () => [eventRow({ last_error_code: "signature_mismatch" })]],
    ["changed its payload", () => [eventRow({ payload_sha256: "f".repeat(64) })]],
    ["moved to another organization", () => [eventRow({ organization_id: subscriptionId })]],
  ])("rejects the confirmation when the locked inbox row %s", async (_label, lockedEvent) => {
    const token = await previewToken();
    world.handlers.lockEvent = lockedEvent;
    await expectFailure(confirmSaasReconciliation(confirmInput(token), dependencies()), STATE_CHANGED);
    expect(trace()).toEqual([
      "findDecisionByKey",
      "readEvent",
      "readEvent",
      "lockEvent@tx1",
      "findDecisionByKey@tx1",
    ]);
    expect(callsOf("insertDecision")).toEqual([]);
  });

  it("returns 404 when the event's organization cannot be locked", async () => {
    const token = await previewToken();
    world.handlers.lockOrganization = () => [];
    await expectFailure(confirmSaasReconciliation(confirmInput(token), dependencies()), {
      code: "NOT_FOUND",
      status: 404,
      publicCode: "EVENT_NOT_FOUND",
    });
    expect(callsOf("lockBaseline")).toEqual([]);
    expect(callsOf("insertDecision")).toEqual([]);
  });

  it("rejects the confirmation when the locked baseline disappeared", async () => {
    const token = await previewToken();
    world.handlers.lockBaseline = () => [];
    await expectFailure(confirmSaasReconciliation(confirmInput(token), dependencies()), STATE_CHANGED);
    expect(callsOf("insertDecision")).toEqual([]);
  });

  it("rejects a preview issued for another event with a 403", async () => {
    const token = await previewToken();
    await expectFailure(
      confirmSaasReconciliation(
        confirmInput(token, { eventId: "20000000-0000-4000-8000-00000000000a" }),
        dependencies()
      ),
      { code: "FORBIDDEN", status: 403 }
    );
    expect(world.calls).toEqual([]);
  });

  it.each([
    ["a payload that is not deflated", () => Buffer.from(JSON.stringify({ version: 1 }), "utf8")],
    ["a payload that is not JSON", () => deflateRawSync(Buffer.from("not json", "utf8"))],
    ["a payload above 16 KiB once inflated", () => deflated({ version: 1, padding: "x".repeat(17_000) })],
    ["claims that are an array", () => deflated([])],
    ["claims with version \"1\"", () => deflated({ ...decodeToken(lastToken), version: "1" })],
    ["claims without snapshotSha256", () => {
      const claims = decodeToken(lastToken);
      delete claims.snapshotSha256;
      return deflated(claims);
    }],
    ["claims without evidence", () => deflated({ ...decodeToken(lastToken), evidence: null })],
  ])("rejects a correctly signed token with %s as PREVIEW_STALE", async (_label, payload) => {
    lastToken = await previewToken();
    await expectFailure(
      confirmSaasReconciliation(confirmInput(signedToken(payload())), dependencies()),
      PREVIEW_STALE
    );
    expect(world.calls).toEqual([]);
  });

  it("replays an existing decision without Stripe configuration", async () => {
    const token = await previewToken();
    const unconfigured = {
      signingSecret: SECRET,
      provider: provider as unknown as StripeReconciliationProvider,
    };
    world.handlers.findDecisionByKey = () => [
      decisionRow("e".repeat(64), { confirmation_request_sha256: requestHashFor(token) }),
    ];
    await expect(confirmSaasReconciliation(confirmInput(token), unconfigured)).resolves.toEqual({
      decisionId,
      eventId,
      status: "replayed",
    });
    expect(trace()).toEqual(["findDecisionByKey", "resultOutcome"]);

    // A first confirmation still needs the configuration.
    world.handlers.findDecisionByKey = () => [];
    clearCalls();
    await expectFailure(confirmSaasReconciliation(confirmInput(token), unconfigured), {
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
      publicCode: "PROVIDER_UNAVAILABLE",
    });
    expect(trace()).toEqual(["findDecisionByKey"]);
  });
});

// ---------------------------------------------------------------------------
// consumeSaasReconciliationBatch
// ---------------------------------------------------------------------------

const subscriptionSnapshotHash = canonicalHash({
  subscription: expectedSubscriptionEvidence,
  invoice: null,
  statusInvoice: null,
});

const paidHash = canonicalHash({
  subscription: expectedSubscriptionEvidence,
  invoice: expectedPaidInvoiceEvidence,
  statusInvoice: null,
});

function scenarioDecision(snapshot: string, overrides: Row = {}) {
  world.handlers.claimEvents = () => [claimRow()];
  world.handlers.readDecision = () => [decisionRow(snapshot, overrides)];
}

function paidInvoiceEvent() {
  world.handlers.readEvent = () => [
    eventRow({ event_type: "invoice.paid", provider_object_reference: "in_synthetic" }),
  ];
}

const zero = { claimed: 0, applied: 0, stale: 0, retrying: 0, leaseLost: 0 };
const consume = (overrides: SaasReconciliationDependencies = {}) =>
  consumeSaasReconciliationBatch({}, dependencies(overrides));

const inTx = (transaction: number, ...names: Statement[]) =>
  names.map((name) => `${name}@tx${transaction}`);
/** Statements before the transaction of a claim whose evidence is re-read. */
const READ_PHASE = ["claimEvents", "readDecision", "readEvent", "readBaseline"];
const LOCKED_STATE: Statement[] = [
  "lockClaimedEvent",
  "lockOrganization",
  "lockSubscription",
  "lockEntitlement",
];
/** A stale close decided inside applyDecision's transaction. */
const STALE_IN_TX = inTx(1, ...LOCKED_STATE, "insertResult", "insertAudit", "finishEvent");
/** A stale close through closeStaleDecision (its own transaction). */
const CLOSE_STALE = inTx(1, ...LOCKED_STATE, "insertResult", "insertAudit", "finishStale");

const STALE_FINISH = ["quarantined", false, "reconciliation_stale", eventId, decisionId, leaseToken, 5];
const PROCESSED_FINISH = ["processed", true, null, eventId, decisionId, leaseToken, 5];

/** Lock statements are fenced by event, decision, lease and fencing version. */
function expectLockedStateParams() {
  expect(paramsOf("lockClaimedEvent")).toEqual([[eventId, decisionId, leaseToken, 5]]);
  expect(paramsOf("lockOrganization")).toEqual([[organizationId]]);
  expect(paramsOf("lockSubscription")).toEqual([
    [organizationId, "test", "acct_synthetic", "sub_synthetic"],
  ]);
  expect(paramsOf("lockEntitlement")).toEqual([[organizationId]]);
}

function auditOf(index = 0) {
  const params = callsOf("insertAudit")[index]!.params;
  return {
    head: params.slice(0, 6),
    before: JSON.parse(params[6] as string) as unknown,
    after: JSON.parse(params[7] as string) as unknown,
    metadata: JSON.parse(params[8] as string) as unknown,
  };
}

const previousGrant = { revision: 4, sourceReference: "stripe-invoice:in_previous" };

describe("consumeSaasReconciliationBatch: claiming", () => {
  it.each([0, 51, 2.5, -1])("rejects a batch size of %s", async (batchSize) => {
    await expectFailure(consumeSaasReconciliationBatch({ batchSize }, dependencies()), BAD_REQUEST);
    expect(world.calls).toEqual([]);
  });

  it("claims 10 events by default with a 60 s lease and reports an empty batch", async () => {
    await expect(consumeSaasReconciliationBatch(undefined, dependencies())).resolves.toEqual(zero);
    expect(paramsOf("claimEvents")).toEqual([[10, 60_000]]);
    await consumeSaasReconciliationBatch({ batchSize: 50 }, dependencies());
    expect(paramsOf("claimEvents")[1]).toEqual([50, 60_000]);
    expect(trace()).toEqual(["claimEvents", "claimEvents"]);
  });

  it("counts a claim without decision as a lost lease", async () => {
    world.handlers.claimEvents = () => [claimRow()];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, leaseLost: 1 });
    expect(trace()).toEqual(["claimEvents", "readDecision"]);
    expect(paramsOf("readDecision")).toEqual([[decisionId]]);
  });

  it("processes a batch of three claims in order: applied, stale and retrying", async () => {
    const batch = [
      { event: eventId, decision: decisionId, lease: leaseToken, fencing: 5 },
      {
        event: "20000000-0000-4000-8000-00000000000b",
        decision: "20000000-0000-4000-8000-00000000000c",
        lease: "20000000-0000-4000-8000-00000000000d",
        fencing: 7,
      },
      {
        event: "20000000-0000-4000-8000-00000000000e",
        decision: "20000000-0000-4000-8000-00000000000f",
        lease: "20000000-0000-4000-8000-000000000010",
        fencing: 9,
      },
    ];
    world.handlers.claimEvents = () =>
      batch.map((entry) =>
        claimRow({
          id: entry.event,
          decision_id: entry.decision,
          lease_token: entry.lease,
          fencing_version: entry.fencing,
        })
      );
    world.handlers.readDecision = (params) => {
      const index = batch.findIndex((entry) => entry.decision === params[0]);
      const entry = batch[index]!;
      return [
        decisionRow(subscriptionSnapshotHash, {
          id: entry.decision,
          webhook_event_id: entry.event,
          // The second decision expired before the consumer reached it.
          ...(index === 1 ? { execution_expires_at: T0.toISOString() } : {}),
        }),
      ];
    };
    world.handlers.readEvent = (params) => [eventRow({ id: params[0] })];
    // First Stripe call (claim 1) answers; the second (claim 3) times out.
    provider.retrieveSubscription
      .mockImplementationOnce(async () => world.stripeSubscription)
      .mockRejectedValueOnce(new Error("timeout"));

    await expect(consume()).resolves.toEqual({
      claimed: 3,
      applied: 1,
      stale: 1,
      retrying: 1,
      leaseLost: 0,
    });
    expect(trace()).toEqual([
      "claimEvents",
      "readDecision",
      "readEvent",
      "readBaseline",
      ...inTx(1, ...LOCKED_STATE, "updateSubscription", "insertResult", "insertAudit", "finishEvent"),
      "readDecision",
      ...inTx(2, ...LOCKED_STATE, "insertResult", "insertAudit", "finishStale"),
      "readDecision",
      "readEvent",
      "scheduleRetry",
    ]);
    expect(paramsOf("readDecision")).toEqual(batch.map((entry) => [entry.decision]));
    expect(paramsOf("readEvent")).toEqual([[batch[0]!.event], [batch[2]!.event]]);
    expect(paramsOf("lockClaimedEvent")).toEqual([
      [batch[0]!.event, batch[0]!.decision, batch[0]!.lease, 5],
      [batch[1]!.event, batch[1]!.decision, batch[1]!.lease, 7],
    ]);
    expect(paramsOf("insertResult").map((params) => [params[0], params.at(-1)])).toEqual([
      [batch[0]!.decision, "status_snapshot_applied"],
      [batch[1]!.decision, "evidence_expired"],
    ]);
    expect(paramsOf("finishEvent")).toEqual([
      ["processed", true, null, batch[0]!.event, batch[0]!.decision, batch[0]!.lease, 5],
    ]);
    expect(paramsOf("finishStale")).toEqual([
      [batch[1]!.event, batch[1]!.decision, batch[1]!.lease, 7],
    ]);
    expect(paramsOf("scheduleRetry")).toEqual([
      [3_000, batch[2]!.event, batch[2]!.decision, batch[2]!.lease, 9],
    ]);
  });
});

describe("consumeSaasReconciliationBatch: expired evidence and retries", () => {
  it("closes an expired decision as stale without calling Stripe", async () => {
    scenarioDecision(subscriptionSnapshotHash, {
      execution_expires_at: T0.toISOString(),
    });
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, stale: 1 });
    expect(provider.retrieveSubscription).not.toHaveBeenCalled();
    expect(trace()).toEqual(["claimEvents", "readDecision", ...CLOSE_STALE]);
    expectLockedStateParams();
    expect(paramsOf("insertResult")).toEqual([
      [
        decisionId,
        5,
        null,
        4,
        4,
        "stripe-invoice:in_previous",
        "stripe-invoice:in_previous",
        "evidence_expired",
      ],
    ]);
    expect(auditOf()).toEqual({
      head: [
        organizationId,
        actorId,
        "saas_webhook.quarantine_resolution_stale",
        eventId,
        "req-confirm",
        `${decisionId}:stale`,
      ],
      before: previousGrant,
      after: previousGrant,
      metadata: { decisionId, resultCode: "evidence_expired", observedSnapshotSha256: null },
    });
    expect(paramsOf("finishStale")).toEqual([[eventId, decisionId, leaseToken, 5]]);
  });

  it("counts an expired decision whose lease was lost", async () => {
    scenarioDecision(subscriptionSnapshotHash, { execution_expires_at: T0.toISOString() });
    world.handlers.lockClaimedEvent = () => [];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, leaseLost: 1 });
    expect(trace()).toEqual(["claimEvents", "readDecision", ...inTx(1, "lockClaimedEvent")]);
  });

  it("closes as stale when the evidence expires between the pre-check and the transaction", async () => {
    scenarioDecision(subscriptionSnapshotHash);
    const clock = vi.fn(() => new Date(T0.getTime() + 2 * 60_000));
    clock.mockReturnValueOnce(T0);
    await expect(consume({ now: clock })).resolves.toEqual({ ...zero, claimed: 1, stale: 1 });
    expect(clock).toHaveBeenCalledTimes(2);
    expect(trace()).toEqual([...READ_PHASE, ...STALE_IN_TX]);
    expect(paramsOf("insertResult")).toEqual([
      [
        decisionId,
        5,
        null,
        4,
        4,
        "stripe-invoice:in_previous",
        "stripe-invoice:in_previous",
        "evidence_expired",
      ],
    ]);
    expect(paramsOf("finishEvent")).toEqual([STALE_FINISH]);
    expect(callsOf("updateSubscription")).toEqual([]);
  });

  it.each([
    [1, 3_000],
    [3, 12_000],
    [8, 300_000],
    [20, 300_000],
  ])("retries provider outages with backoff (attempt %s -> %s ms)", async (attempts, backoff) => {
    world.handlers.claimEvents = () => [claimRow({ attempts })];
    world.handlers.readDecision = () => [decisionRow(subscriptionSnapshotHash)];
    provider.retrieveSubscription.mockRejectedValueOnce(new Error("timeout"));
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, retrying: 1 });
    expect(trace()).toEqual(["claimEvents", "readDecision", "readEvent", "scheduleRetry"]);
    expect(paramsOf("scheduleRetry")).toEqual([[backoff, eventId, decisionId, leaseToken, 5]]);
  });

  it("counts a retry that lost its lease", async () => {
    scenarioDecision(subscriptionSnapshotHash);
    provider.retrieveSubscription.mockRejectedValueOnce(new Error("timeout"));
    world.handlers.scheduleRetry = () => [];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, leaseLost: 1 });
  });

  it.each([
    ["the stale close of an expired decision", { execution_expires_at: T0.toISOString() }, false],
    ["the stale close of a changed Stripe snapshot", {}, true],
  ])(
    "CURRENT BEHAVIOUR: rejects the whole batch with a 409 when %s loses its lease (possible bug)",
    async (_label, overrides, changeStripe) => {
      scenarioDecision(subscriptionSnapshotHash, overrides);
      if (changeStripe) world.stripeSubscription = stripeSubscription({ status: "past_due" });
      world.handlers.finishStale = () => [];
      // closeStaleDecision is not wrapped like applyDecision: the lease error
      // escapes consume() instead of being counted as leaseLost.
      await expectFailure(consume(), STATE_CHANGED);
      expect(trace().at(-1)).toBe("finishStale@tx1");
    }
  );

  it.each([
    ["a zero revision", [lockedEntitlementRow({ revision: 0 })], { code: "FEATURE_NOT_AVAILABLE", status: 503 }],
    ["a non-numeric revision", [lockedEntitlementRow({ revision: "abc" })], { code: "FEATURE_NOT_AVAILABLE", status: 503 }],
    ["no entitlement row", [], STATE_CHANGED],
  ])(
    "CURRENT BEHAVIOUR: rejects the whole batch when the stale close finds %s (possible bug)",
    async (_label, entitlementRows, expected) => {
      scenarioDecision(subscriptionSnapshotHash, { execution_expires_at: T0.toISOString() });
      world.handlers.lockEntitlement = () => entitlementRows;
      await expectFailure(consume(), expected);
      expect(trace()).toEqual(["claimEvents", "readDecision", ...inTx(1, ...LOCKED_STATE)]);
      expect(callsOf("insertResult")).toEqual([]);
    }
  );
});

describe("consumeSaasReconciliationBatch: status snapshots", () => {
  it("applies a status snapshot without touching the entitlement", async () => {
    scenarioDecision(subscriptionSnapshotHash);
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });
    expect(trace()).toEqual([
      ...READ_PHASE,
      ...inTx(1, ...LOCKED_STATE, "updateSubscription", "insertResult", "insertAudit", "finishEvent"),
    ]);
    expect(paramsOf("readDecision")).toEqual([[decisionId]]);
    expect(paramsOf("readEvent")).toEqual([[eventId]]);
    expect(paramsOf("readBaseline")).toEqual([
      [organizationId, "test", "acct_synthetic", "sub_synthetic"],
    ]);
    expectLockedStateParams();
    expect(paramsOf("updateSubscription")).toEqual([
      ["active", false, null, "evt_synthetic", subscriptionId],
    ]);
    expect(callsOf("updateEntitlement")).toEqual([]);
    expect(paramsOf("insertResult")).toEqual([
      [
        decisionId,
        "applied",
        5,
        subscriptionSnapshotHash,
        4,
        4,
        "stripe-invoice:in_previous",
        "stripe-invoice:in_previous",
        "status_snapshot_applied",
      ],
    ]);
    expect(auditOf()).toEqual({
      head: [
        organizationId,
        actorId,
        "saas_webhook.quarantine_resolution_applied",
        eventId,
        "req-confirm",
        `${decisionId}:result`,
      ],
      before: previousGrant,
      after: previousGrant,
      metadata: { decisionId, resultCode: "status_snapshot_applied", outcome: "applied" },
    });
    expect(paramsOf("finishEvent")).toEqual([PROCESSED_FINISH]);
  });

  it("closes the decision as stale when the Stripe snapshot changed", async () => {
    scenarioDecision(subscriptionSnapshotHash);
    world.stripeSubscription = stripeSubscription({ status: "past_due" });
    const changedHash = canonicalHash({
      subscription: { ...expectedSubscriptionEvidence, providerStatus: "past_due" },
      invoice: null,
      statusInvoice: null,
    });
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, stale: 1 });
    expect(trace()).toEqual([...READ_PHASE, ...CLOSE_STALE]);
    expect(paramsOf("insertResult")).toEqual([
      [
        decisionId,
        5,
        changedHash,
        4,
        4,
        "stripe-invoice:in_previous",
        "stripe-invoice:in_previous",
        "provider_snapshot_changed",
      ],
    ]);
    expect(auditOf().metadata).toEqual({
      decisionId,
      resultCode: "provider_snapshot_changed",
      observedSnapshotSha256: changedHash,
    });
  });

  it("closes a status snapshot as stale when the locked baseline changed", async () => {
    scenarioDecision(subscriptionSnapshotHash);
    world.handlers.lockEntitlement = () => [lockedEntitlementRow({ revision: 5 })];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, stale: 1 });
    expect(trace()).toEqual([...READ_PHASE, ...STALE_IN_TX]);
    expect(paramsOf("insertResult")).toEqual([
      [
        decisionId,
        5,
        subscriptionSnapshotHash,
        5,
        5,
        "stripe-invoice:in_previous",
        "stripe-invoice:in_previous",
        "baseline_changed",
      ],
    ]);
    expect(paramsOf("finishEvent")).toEqual([STALE_FINISH]);
    expect(callsOf("updateSubscription")).toEqual([]);
  });

  it("closes as stale when the canonical subscription disappeared", async () => {
    scenarioDecision(subscriptionSnapshotHash);
    world.handlers.lockSubscription = () => [];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, stale: 1 });
    expect(trace()).toEqual([...READ_PHASE, ...STALE_IN_TX]);
    expect(paramsOf("insertResult")[0]!.at(-1)).toBe("canonical_state_missing");
  });

  it.each([
    [
      "the plan",
      { items: { data: [{ quantity: 1, price: stripePrice("growth", "month") }] } },
      { planCode: "growth", priceReference: "price_growth_month" },
    ],
    [
      "the price within the same plan",
      { items: { data: [{ quantity: 1, price: stripePrice("starter", "year") }] } },
      { billingInterval: "year", priceReference: "price_starter_year" },
    ],
    [
      "the period start",
      { current_period_start: epoch("2026-11-02T00:00:00.000Z") },
      { currentPeriodStartedAt: "2026-11-02T00:00:00.000Z" },
    ],
    [
      "the period end",
      { current_period_end: epoch("2026-12-15T00:00:00.000Z") },
      { currentPeriodEndsAt: "2026-12-15T00:00:00.000Z" },
    ],
  ])("refuses a status snapshot that would change %s", async (_label, stripeOverride, evidenceOverride) => {
    world.stripeSubscription = stripeSubscription(stripeOverride);
    const snapshot = canonicalHash({
      subscription: { ...expectedSubscriptionEvidence, ...evidenceOverride },
      invoice: null,
      statusInvoice: null,
    });
    scenarioDecision(snapshot);
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, stale: 1 });
    expect(trace()).toEqual([...READ_PHASE, ...STALE_IN_TX]);
    expect(paramsOf("insertResult")[0]!.at(-1)).toBe("status_snapshot_would_change_entitlement");
    expect(callsOf("updateSubscription")).toEqual([]);
  });

  it("CURRENT BEHAVIOUR: turns a stale close with an invalid entitlement revision into a retry", async () => {
    scenarioDecision(subscriptionSnapshotHash);
    world.handlers.lockEntitlement = () => [lockedEntitlementRow({ revision: 0 })];
    // baseline_changed -> actualEntitlement throws 503 -> applyDecision retries.
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, retrying: 1 });
    expect(trace()).toEqual([...READ_PHASE, ...inTx(1, ...LOCKED_STATE), "scheduleRetry"]);
    expect(callsOf("insertResult")).toEqual([]);
  });
});

describe("consumeSaasReconciliationBatch: paid invoice grants", () => {
  beforeEach(paidInvoiceEvent);

  const paidDecision = { resolution_kind: "paid_invoice_grant", invoice_plan_code: "starter" };

  it("grants the paid period and bumps the entitlement revision", async () => {
    scenarioDecision(paidHash, paidDecision);
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });
    expect(trace()).toEqual([
      ...READ_PHASE,
      ...inTx(
        1,
        ...LOCKED_STATE,
        "updateSubscription",
        "updateEntitlement",
        "insertResult",
        "insertAudit",
        "finishEvent"
      ),
    ]);
    expectLockedStateParams();
    expect(paramsOf("updateSubscription")).toEqual([
      [
        "price_starter_month",
        "starter",
        "active",
        "month",
        periodStart,
        periodEnd,
        false,
        null,
        "evt_synthetic",
        subscriptionId,
      ],
    ]);
    expect(callsOf("updateTrial")).toEqual([]);
    expect(paramsOf("updateEntitlement")).toEqual([
      [
        "starter",
        "stripe-invoice:in_synthetic",
        subscriptionId,
        periodStart,
        periodEnd,
        organizationId,
      ],
    ]);
    expect(paramsOf("insertResult")).toEqual([
      [
        decisionId,
        "applied",
        5,
        paidHash,
        4,
        5,
        "stripe-invoice:in_previous",
        "stripe-invoice:in_synthetic",
        "paid_invoice_granted",
      ],
    ]);
    expect(auditOf()).toEqual({
      head: [
        organizationId,
        actorId,
        "saas_webhook.quarantine_resolution_applied",
        eventId,
        "req-confirm",
        `${decisionId}:result`,
      ],
      before: previousGrant,
      after: { revision: 5, sourceReference: "stripe-invoice:in_synthetic" },
      metadata: { decisionId, resultCode: "paid_invoice_granted", outcome: "applied" },
    });
    expect(paramsOf("finishEvent")).toEqual([PROCESSED_FINISH]);
  });

  it("converts an active trial when the paid invoice replaces it", async () => {
    scenarioDecision(paidHash, { ...paidDecision, expected_entitlement_trial_id: trialId });
    world.handlers.lockEntitlement = () => [lockedEntitlementRow({ trial_id: trialId })];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });
    expect(trace()).toEqual([
      ...READ_PHASE,
      ...inTx(
        1,
        ...LOCKED_STATE,
        "updateSubscription",
        "updateTrial",
        "updateEntitlement",
        "insertResult",
        "insertAudit",
        "finishEvent"
      ),
    ]);
    expect(paramsOf("updateTrial")).toEqual([[trialId, organizationId]]);
  });

  it("reports an invoice that was already granted without a second grant", async () => {
    scenarioDecision(paidHash, {
      ...paidDecision,
      expected_entitlement_source_reference: "stripe-invoice:in_synthetic",
    });
    world.handlers.lockEntitlement = () => [
      lockedEntitlementRow({ source_reference: "stripe-invoice:in_synthetic" }),
    ];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });
    expect(trace()).toEqual([
      ...READ_PHASE,
      ...inTx(1, ...LOCKED_STATE, "insertResult", "insertAudit", "finishEvent"),
    ]);
    expect(paramsOf("insertResult")).toEqual([
      [
        decisionId,
        "already_applied",
        5,
        paidHash,
        4,
        4,
        "stripe-invoice:in_synthetic",
        "stripe-invoice:in_synthetic",
        "invoice_already_granted",
      ],
    ]);
    expect(auditOf().metadata).toEqual({
      decisionId,
      resultCode: "invoice_already_granted",
      outcome: "already_applied",
    });
  });

  it("refuses an invoice that is no longer the latest one", async () => {
    world.stripeSubscription = stripeSubscription({ latest_invoice: "in_newer" });
    const hash = canonicalHash({
      subscription: { ...expectedSubscriptionEvidence, latestInvoiceReference: "in_newer" },
      invoice: expectedPaidInvoiceEvidence,
      statusInvoice: null,
    });
    scenarioDecision(hash, paidDecision);
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, stale: 1 });
    expect(trace()).toEqual([...READ_PHASE, ...STALE_IN_TX]);
    expect(paramsOf("insertResult")[0]!.at(-1)).toBe("invoice_not_current_or_price_changed");
    expect(callsOf("updateEntitlement")).toEqual([]);
  });

  it("refuses a paid period that already ended", async () => {
    scenarioDecision(paidHash, {
      ...paidDecision,
      execution_expires_at: "2026-12-01T00:02:00.000Z",
    });
    vi.setSystemTime(new Date("2026-12-01T00:00:00.000Z"));
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, stale: 1 });
    expect(paramsOf("insertResult")[0]!.at(-1)).toBe("invoice_not_current_or_price_changed");
  });

  it("closes a paid grant without invoice evidence as paid_evidence_missing", async () => {
    // The decision says paid_invoice_grant but the event is a subscription
    // event, so the re-read evidence carries no invoice.
    world.handlers.readEvent = () => [eventRow()];
    scenarioDecision(subscriptionSnapshotHash, paidDecision);
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, stale: 1 });
    expect(trace()).toEqual([...READ_PHASE, ...STALE_IN_TX]);
    expect(paramsOf("insertResult")).toEqual([
      [
        decisionId,
        5,
        subscriptionSnapshotHash,
        4,
        4,
        "stripe-invoice:in_previous",
        "stripe-invoice:in_previous",
        "paid_evidence_missing",
      ],
    ]);
    expect(callsOf("updateSubscription")).toEqual([]);
  });

  it("schedules a retry after the subscription update when the entitlement update returns nothing", async () => {
    scenarioDecision(paidHash, paidDecision);
    world.handlers.updateEntitlement = () => [];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, retrying: 1 });
    // In PostgreSQL the transaction rolls back the subscription update.
    expect(trace()).toEqual([
      ...READ_PHASE,
      ...inTx(1, ...LOCKED_STATE, "updateSubscription", "updateEntitlement"),
      "scheduleRetry",
    ]);
    expect(paramsOf("scheduleRetry")).toEqual([[3_000, eventId, decisionId, leaseToken, 5]]);
  });

  it("counts a lost lease when the event can no longer be finished", async () => {
    scenarioDecision(paidHash, paidDecision);
    world.handlers.finishEvent = () => [];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, leaseLost: 1 });
    expect(trace().at(-1)).toBe("finishEvent@tx1");
    expect(callsOf("scheduleRetry")).toEqual([]);
  });

  it("CURRENT BEHAVIOUR: reports a changed revision as baseline_changed (entitlement_revision_changed is unreachable)", async () => {
    scenarioDecision(paidHash, paidDecision);
    world.handlers.lockEntitlement = () => [lockedEntitlementRow({ revision: 5 })];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, stale: 1 });
    expect(paramsOf("insertResult")[0]!.at(-1)).toBe("baseline_changed");
  });

  it("CURRENT BEHAVIOUR: a non-integer revision reaches entitlement_revision_changed but ends in a retry", async () => {
    // matchesDecisionBaseline accepts 4.5 === 4.5; the paid path then rejects
    // it as not a safe integer, and the stale close throws 503 on the same
    // revision, so the entitlement_revision_changed result is never written.
    scenarioDecision(paidHash, { ...paidDecision, expected_entitlement_revision: 4.5 });
    world.handlers.lockEntitlement = () => [lockedEntitlementRow({ revision: 4.5 })];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, retrying: 1 });
    expect(trace()).toEqual([...READ_PHASE, ...inTx(1, ...LOCKED_STATE), "scheduleRetry"]);
    expect(callsOf("insertResult")).toEqual([]);
    expect(callsOf("updateEntitlement")).toEqual([]);
  });

  it("grants the full period for a one-cent invoice, from preview to consumer", async () => {
    world.handlers.lockEvent = world.handlers.readEvent;
    world.stripeInvoice = stripeInvoice({ amount_paid: 1 });
    const token = await previewToken();
    const confirmed = await confirmSaasReconciliation(confirmInput(token), dependencies());
    const stored = insertedDecision();
    expect(stored).toMatchObject({
      resolution_kind: "paid_invoice_grant",
      invoice_paid_amount: 1,
      invoice_currency: "eur",
    });

    clearCalls();
    vi.setSystemTime(new Date(T0.getTime() + 30_000));
    world.handlers.claimEvents = () => [claimRow({ decision_id: confirmed.decisionId })];
    world.handlers.readDecision = () => [stored];
    await expect(consume()).resolves.toEqual({ ...zero, claimed: 1, applied: 1 });
    // amount_paid is never compared with the plan price (1900 cents).
    expect(paramsOf("updateEntitlement")).toEqual([
      [
        "starter",
        "stripe-invoice:in_synthetic",
        subscriptionId,
        periodStart,
        periodEnd,
        organizationId,
      ],
    ]);
    expect(paramsOf("insertResult")[0]!.at(-1)).toBe("paid_invoice_granted");
  });
});

// ---------------------------------------------------------------------------
// SQL text
// ---------------------------------------------------------------------------

const ALL_STATEMENTS: Statement[] = [
  "claimEvents",
  "findDecisionByKey",
  "finishEvent",
  "finishStale",
  "insertAudit",
  "insertDecision",
  "insertResult",
  "linkDecision",
  "lockBaseline",
  "lockClaimedEvent",
  "lockEntitlement",
  "lockEvent",
  "lockOrganization",
  "lockSubscription",
  "readBaseline",
  "readDecision",
  "readEvent",
  "resultOutcome",
  "scheduleRetry",
  "staleResult",
  "updateEntitlement",
  "updateSubscription",
  "updateTrial",
];

describe("SQL text", () => {
  it("pins the normalized SQL of every statement the service issues", async () => {
    const seen = new Map<Statement, Set<string>>();
    const collect = () => {
      for (const call of world.calls) {
        const texts = seen.get(call.name) ?? new Set<string>();
        texts.add(call.sql);
        seen.set(call.name, texts);
      }
    };
    const scenario = async (setup: () => void, body: () => Promise<unknown>) => {
      resetWorld();
      setup();
      await body();
      collect();
    };

    // Preview after a stale decision, first confirmation and its replay.
    await scenario(
      () => {
        world.handlers.readEvent = () => [eventRow({ reconciliation_decision_id: previousDecisionId })];
        world.handlers.staleResult = () => [{ outcome: "stale" }];
      },
      () => preview()
    );
    await scenario(
      () => undefined,
      async () => confirmSaasReconciliation(confirmInput(await previewToken()), dependencies())
    );
    await scenario(
      () => {
        world.handlers.resultOutcome = () => [{ outcome: "applied" }];
      },
      async () => {
        const token = await previewToken();
        world.handlers.findDecisionByKey = () => [
          decisionRow("e".repeat(64), { confirmation_request_sha256: requestHashFor(token) }),
        ];
        return confirmSaasReconciliation(confirmInput(token), dependencies());
      }
    );
    // Consumer: stale close, status snapshot, stale in transaction, paid grant
    // with a trial, and a provider retry.
    await scenario(
      () => scenarioDecision(subscriptionSnapshotHash, { execution_expires_at: T0.toISOString() }),
      () => consume()
    );
    await scenario(() => scenarioDecision(subscriptionSnapshotHash), () => consume());
    await scenario(
      () => {
        scenarioDecision(subscriptionSnapshotHash);
        world.handlers.lockEntitlement = () => [lockedEntitlementRow({ revision: 5 })];
      },
      () => consume()
    );
    await scenario(
      () => {
        paidInvoiceEvent();
        scenarioDecision(paidHash, {
          resolution_kind: "paid_invoice_grant",
          expected_entitlement_trial_id: trialId,
        });
        world.handlers.lockEntitlement = () => [lockedEntitlementRow({ trial_id: trialId })];
      },
      () => consume()
    );
    await scenario(
      () => {
        scenarioDecision(subscriptionSnapshotHash);
        provider.retrieveSubscription.mockRejectedValueOnce(new Error("timeout"));
      },
      () => consume()
    );

    expect([...seen.keys()].sort()).toEqual(ALL_STATEMENTS);
    const listing = [...seen.keys()]
      .sort()
      .flatMap((name) => [...seen.get(name)!].sort().map((text) => `-- ${name}\n${text}\n`))
      .join("\n");
    // Regenerate with `vitest -u` after a deliberate SQL change and review the diff.
    await expect(listing).toMatchFileSnapshot("./__snapshots__/saas-reconciliation-service-sql.txt");
  });
});
