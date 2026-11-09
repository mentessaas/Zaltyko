import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { profiles } from "@/db/schema/profiles";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { sameInstant } from "./reconciliation-time";
import {
  createSaasStripeClient,
  getSaasStripeConfig,
  type SaasBillingInterval,
  type SaasStripeConfig,
  type SelfServePlanCode,
} from "./saas-billing-config";

const PREVIEW_TTL_MS = 5 * 60_000;
const EVIDENCE_TTL_MS = 2 * 60_000;
const LEASE_TTL_MS = 60_000;
const MAX_BATCH_SIZE = 50;

type ResolutionKind = "status_snapshot" | "paid_invoice_grant";
type PlanCode = SelfServePlanCode;
type ProviderStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export interface PreviewSaasReconciliationInput {
  eventId: string;
  actorUserId: string;
  requestId: string;
}

export interface ConfirmSaasReconciliationInput {
  eventId: string;
  actorUserId: string;
  requestId: string;
  previewToken: string;
  reason: string;
  idempotencyKey: string;
}

export interface ConsumeSaasReconciliationBatchInput {
  batchSize?: number;
}

export interface StripeReconciliationProvider {
  retrieveSubscription(reference: string): Promise<unknown>;
  retrieveInvoice(reference: string): Promise<unknown>;
}

/** Dependencies are injectable for synthetic tests; production never invents a key. */
export interface SaasReconciliationDependencies {
  config?: SaasStripeConfig;
  signingSecret?: string;
  provider?: StripeReconciliationProvider;
  now?: () => Date;
}

interface EventRecord {
  id: string;
  organization_id: string | null;
  provider_account_reference: string;
  environment: "test" | "live";
  provider_event_id: string;
  event_account_reference: string | null;
  event_type: string;
  event_created_at: string | null;
  provider_object_reference: string | null;
  livemode: boolean;
  payload_sha256: string;
  status: string;
  last_error_code: string | null;
  fencing_version: number | string;
  reconciliation_decision_id: string | null;
}

interface SubscriptionBaseline {
  id: string;
  organization_id: string;
  environment: "test" | "live";
  provider_account_reference: string;
  customer_reference: string;
  subscription_reference: string;
  price_reference: string;
  plan_code: PlanCode | "network";
  provider_status: ProviderStatus;
  billing_interval: SaasBillingInterval;
  current_period_started_at: string;
  current_period_ends_at: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  last_provider_event_reference: string | null;
  updated_at: string;
}

interface EntitlementBaseline {
  revision: number | string;
  plan_code: string;
  source: string;
  source_reference: string;
  subscription_id: string | null;
  trial_id: string | null;
  effective_from: string;
  effective_until: string | null;
}

interface BaselineRecord {
  subscription: SubscriptionBaseline;
  entitlement: EntitlementBaseline;
}

interface SubscriptionEvidence {
  reference: string;
  customerReference: string;
  planCode: PlanCode;
  billingInterval: SaasBillingInterval;
  providerStatus: ProviderStatus;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  currentPeriodStartedAt: string;
  currentPeriodEndsAt: string;
  priceReference: string;
  latestInvoiceReference: string | null;
}

interface InvoiceEvidence {
  reference: string;
  status: string;
  customerReference: string;
  subscriptionReference: string;
  currency: string;
  paidAmount: number;
  periodStartedAt: string;
  periodEndsAt: string;
  priceReference: string;
  planCode: PlanCode;
}

interface SnapshotEvidence {
  subscription: SubscriptionEvidence;
  invoice: InvoiceEvidence | null;
  statusInvoice: {
    reference: string;
    status: string;
    customerReference: string;
    subscriptionReference: string;
  } | null;
}

interface PreviewClaims {
  version: 1;
  actorUserId: string;
  eventId: string;
  organizationId: string;
  requestId: string;
  resolutionKind: ResolutionKind;
  issuedAt: string;
  expiresAt: string;
  event: {
    providerAccountReference: string;
    environment: "test" | "live";
    providerEventId: string;
    eventCreatedAt: string;
    providerObjectReference: string;
    payloadSha256: string;
    eventType: string;
    fencingVersion: number;
    lastErrorCode: string;
    previousDecisionId: string | null;
  };
  baseline: BaselineRecord;
  evidence: SnapshotEvidence;
  evidenceObservedAt: string;
  executionExpiresAt: string;
  snapshotSha256: string;
}

interface DecisionRecord {
  id: string;
  organization_id: string;
  webhook_event_id: string;
  actor_user_id: string;
  request_id: string;
  idempotency_key: string;
  confirmation_request_sha256: string;
  resolution_kind: ResolutionKind;
  reason: string;
  provider_account_reference: string;
  environment: "test" | "live";
  provider_event_id: string;
  event_created_at: string;
  provider_object_reference: string;
  payload_sha256: string;
  preview_token_sha256: string;
  preview_issued_at: string;
  preview_expires_at: string;
  expected_fencing_version: number | string;
  expected_last_provider_event_reference: string | null;
  expected_subscription_updated_at: string;
  expected_subscription_plan_code: string;
  expected_subscription_price_reference: string;
  expected_subscription_billing_interval: SaasBillingInterval;
  expected_subscription_provider_status: ProviderStatus;
  expected_subscription_cancel_at_period_end: boolean;
  expected_subscription_canceled_at: string | null;
  expected_subscription_period_started_at: string;
  expected_subscription_period_ends_at: string;
  expected_entitlement_revision: number | string;
  expected_entitlement_plan_code: string;
  expected_entitlement_source: string;
  expected_entitlement_source_reference: string;
  expected_entitlement_subscription_id: string | null;
  expected_entitlement_trial_id: string | null;
  expected_entitlement_effective_from: string;
  expected_entitlement_effective_until: string | null;
  evidence_observed_at: string;
  execution_expires_at: string;
  snapshot_sha256: string;
  observed_subscription_reference: string;
  observed_customer_reference: string;
  observed_plan_code: PlanCode;
  observed_provider_status: ProviderStatus;
  observed_cancel_at_period_end: boolean;
  observed_canceled_at: string | null;
  observed_current_period_started_at: string;
  observed_current_period_ends_at: string;
  observed_price_reference: string;
  observed_latest_invoice_reference: string | null;
  invoice_reference: string | null;
  invoice_status: string | null;
  invoice_customer_reference: string | null;
  invoice_subscription_reference: string | null;
  invoice_currency: string | null;
  invoice_paid_amount: number | string | null;
  invoice_period_started_at: string | null;
  invoice_period_ends_at: string | null;
  invoice_price_reference: string | null;
  invoice_plan_code: PlanCode | null;
}

interface ClaimedEvent {
  id: string;
  decision_id: string;
  lease_token: string;
  lease_until: string;
  fencing_version: number | string;
  attempts: number;
}

interface Runtime {
  config: SaasStripeConfig;
  provider: StripeReconciliationProvider;
  now: () => Date;
}

function fail(
  code: ConstructorParameters<typeof OperationalError>[0],
  message: string,
  status: number,
  publicCode?: string
): OperationalError {
  const mappedCode =
    publicCode ??
    (code === "NOT_FOUND"
      ? "EVENT_NOT_FOUND"
      : code === "VERSION_CONFLICT" && status === 409
        ? "STATE_CHANGED"
        : code === "INVALID_STATE_TRANSITION"
          ? "RECONCILIATION_NOT_ALLOWED"
          : code === "IDEMPOTENCY_CONFLICT"
            ? "IDEMPOTENCY_KEY_REUSED"
            : code === "UNVERIFIED_PROVIDER_EVENT"
              ? "PROVIDER_UNAVAILABLE"
              : code === "PRICE_PLAN_NOT_AVAILABLE"
                ? "UNSUPPORTED_QUARANTINE"
                : undefined);
  return new OperationalError(
    code,
    message,
    status,
    mappedCode ? { code: mappedCode } : undefined
  );
}

function assertUuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw fail("VERSION_CONFLICT", `${label} no es válido`, 400);
  }
}

function dateIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringId(value: unknown): string | null {
  if (typeof value === "string") return value;
  const nested = record(value);
  return typeof nested?.id === "string" ? nested.id : null;
}

function objectRows<T>(result: { rows: unknown[] }): T[] {
  return result.rows as T[];
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  const source = record(value);
  if (!source) return value;
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .map((key) => [key, canonicalValue(source[key])])
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeSaasReconciliationReason(reason: string): string {
  const normalized = reason.normalize("NFC").trim();
  const characterCount = Array.from(normalized).length;
  if (characterCount < 20 || characterCount > 1000) {
    throw fail("VERSION_CONFLICT", "El motivo debe tener entre 20 y 1000 caracteres", 400);
  }
  return normalized;
}

export function createSaasReconciliationRequestHash(input: {
  actorUserId: string;
  previewTokenSha256: string;
  reason: string;
}): string {
  return sha256(
    canonicalJson({
      version: 1,
      actorUserId: input.actorUserId,
      previewTokenSha256: input.previewTokenSha256,
      reason: normalizeSaasReconciliationReason(input.reason),
    })
  );
}

function signingSecret(dependencies?: SaasReconciliationDependencies): string {
  const secret =
    dependencies?.signingSecret ??
    process.env.SAAS_RECONCILIATION_SIGNING_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw fail(
      "FEATURE_NOT_AVAILABLE",
      "La firma de previews de recuperación no está configurada",
      503
    );
  }
  return secret;
}

function signToken(claims: PreviewClaims, secret: string): string {
  const payload = deflateRawSync(Buffer.from(canonicalJson(claims), "utf8"), {
    level: 9,
  }).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`saas-reconciliation-v1.${payload}`)
    .digest("base64url");
  return `v1.${payload}.${signature}`;
}

function verifyToken(token: string, secret: string): PreviewClaims {
  if (token.length > 16_384) {
    throw fail("VERSION_CONFLICT", "El preview no es válido", 400);
  }
  const [version, payload, providedSignature, extra] = token.split(".");
  if (version !== "v1" || !payload || !providedSignature || extra) {
    throw fail("VERSION_CONFLICT", "El preview no es válido", 409, "PREVIEW_STALE");
  }
  const expected = createHmac("sha256", secret)
    .update(`saas-reconciliation-v1.${payload}`)
    .digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(providedSignature, "base64url");
  } catch {
    throw fail("VERSION_CONFLICT", "El preview no es válido", 409, "PREVIEW_STALE");
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw fail("VERSION_CONFLICT", "La firma del preview no es válida", 409, "PREVIEW_STALE");
  }
  let value: unknown;
  try {
    const inflated = inflateRawSync(Buffer.from(payload, "base64url"), {
      maxOutputLength: 16_384,
    });
    value = JSON.parse(inflated.toString("utf8"));
  } catch {
    throw fail("VERSION_CONFLICT", "El preview no es válido", 409, "PREVIEW_STALE");
  }
  const claims = record(value);
  if (
    claims?.version !== 1 ||
    typeof claims.actorUserId !== "string" ||
    typeof claims.eventId !== "string" ||
    typeof claims.organizationId !== "string" ||
    typeof claims.expiresAt !== "string" ||
    typeof claims.snapshotSha256 !== "string" ||
    !record(claims.event) ||
    !record(claims.baseline) ||
    !record(claims.evidence)
  ) {
    throw fail("VERSION_CONFLICT", "El preview no es válido", 409, "PREVIEW_STALE");
  }
  return claims as unknown as PreviewClaims;
}

function providerFor(config: SaasStripeConfig): StripeReconciliationProvider {
  const stripe = createSaasStripeClient(config);
  return {
    async retrieveSubscription(reference) {
      return stripe.subscriptions.retrieve(reference, {
        expand: ["items.data.price", "latest_invoice"],
      });
    },
    async retrieveInvoice(reference) {
      return stripe.invoices.retrieve(reference, {
        expand: ["lines.data.price"],
      });
    },
  };
}

function getRuntime(
  dependencies?: SaasReconciliationDependencies
): Runtime {
  const config = dependencies?.config ?? getSaasStripeConfig();
  if (!config) {
    throw fail(
      "FEATURE_NOT_AVAILABLE",
      "La integración SaaS de Stripe no está configurada",
      503,
      "PROVIDER_UNAVAILABLE"
    );
  }
  return {
    config,
    provider: dependencies?.provider ?? providerFor(config),
    now: dependencies?.now ?? (() => new Date()),
  };
}

function resolvePrice(
  config: SaasStripeConfig,
  priceReference: string
): { planCode: PlanCode; billingInterval: SaasBillingInterval } | null {
  for (const planCode of ["starter", "growth"] as const) {
    for (const billingInterval of ["month", "year"] as const) {
      if (config.prices[planCode][billingInterval] === priceReference) {
        return { planCode, billingInterval };
      }
    }
  }
  return null;
}

function canonicalPrice(
  value: unknown,
  config: SaasStripeConfig
): { planCode: PlanCode; billingInterval: SaasBillingInterval; priceReference: string } {
  const price = record(value);
  const priceReference = typeof price?.id === "string" ? price.id : null;
  const mapped = priceReference ? resolvePrice(config, priceReference) : null;
  const recurring = record(price?.recurring);
  const amount =
    mapped?.planCode === "starter"
      ? mapped.billingInterval === "month"
        ? 1900
        : 19000
      : mapped?.billingInterval === "month"
        ? 4900
        : 49000;
  if (
    !priceReference ||
    !mapped ||
    price?.active !== true ||
    price?.livemode !== (config.environment === "live") ||
    price?.currency !== "eur" ||
    price?.type !== "recurring" ||
    recurring?.interval !== mapped.billingInterval ||
    recurring?.interval_count !== 1 ||
    price?.unit_amount !== amount
  ) {
    throw fail(
      "PRICE_PLAN_NOT_AVAILABLE",
      "El precio observado no coincide con un plan mensual o anual canónico",
      409
    );
  }
  return { ...mapped, priceReference };
}

function providerStatus(value: unknown): ProviderStatus {
  const allowed: ProviderStatus[] = [
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ];
  if (typeof value !== "string" || !allowed.includes(value as ProviderStatus)) {
    throw fail("UNVERIFIED_PROVIDER_EVENT", "Estado de suscripción no reconocido", 409);
  }
  return value as ProviderStatus;
}

function epochFrom(value: unknown): string {
  const timestamp = dateIso(value);
  if (!timestamp) {
    throw fail("UNVERIFIED_PROVIDER_EVENT", "Periodo de suscripción no verificable", 409);
  }
  return timestamp;
}

function linePriceReference(line: Record<string, unknown>): string | null {
  const legacy = line.price;
  const legacyId = stringId(legacy);
  if (legacyId) return legacyId;
  const pricing = record(line.pricing);
  const details = record(pricing?.price_details);
  return stringId(details?.price);
}

function toSubscriptionEvidence(
  value: unknown,
  config: SaasStripeConfig
): SubscriptionEvidence {
  const subscription = record(value);
  const reference = typeof subscription?.id === "string" ? subscription.id : null;
  const customerReference = stringId(subscription?.customer);
  const items = record(subscription?.items);
  const itemRows = Array.isArray(items?.data) ? items.data : [];
  const item = record(itemRows[0]);
  if (
    !reference ||
    !customerReference ||
    subscription?.livemode !== (config.environment === "live") ||
    itemRows.length !== 1 ||
    item?.quantity !== 1
  ) {
    throw fail("UNVERIFIED_PROVIDER_EVENT", "La suscripción no coincide con la cuenta SaaS", 409);
  }
  const price = canonicalPrice(item.price, config);
  const periodStart =
    subscription.current_period_start ?? item.current_period_start;
  const periodEnd = subscription.current_period_end ?? item.current_period_end;
  const currentPeriodStartedAt = epochFrom(periodStart);
  const currentPeriodEndsAt = epochFrom(periodEnd);
  if (currentPeriodEndsAt <= currentPeriodStartedAt) {
    throw fail("UNVERIFIED_PROVIDER_EVENT", "Periodo Stripe inválido", 409);
  }
  return {
    reference,
    customerReference,
    planCode: price.planCode,
    billingInterval: price.billingInterval,
    providerStatus: providerStatus(subscription.status),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    canceledAt: dateIso(subscription.canceled_at),
    currentPeriodStartedAt,
    currentPeriodEndsAt,
    priceReference: price.priceReference,
    latestInvoiceReference: stringId(subscription.latest_invoice),
  };
}

function resolutionFor(eventType: string): ResolutionKind {
  if (eventType === "invoice.paid") return "paid_invoice_grant";
  if (
    eventType === "invoice.payment_failed" ||
    eventType === "customer.subscription.created" ||
    eventType === "customer.subscription.updated" ||
    eventType === "customer.subscription.deleted"
  ) {
    return "status_snapshot";
  }
  throw fail(
    "INVALID_STATE_TRANSITION",
    "Este tipo de evento no admite recuperación",
    409,
    "UNSUPPORTED_QUARANTINE"
  );
}

async function retrieveFromProvider<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw fail(
      "FEATURE_NOT_AVAILABLE",
      "No se pudo verificar la información del proveedor",
      503,
      "PROVIDER_UNAVAILABLE"
    );
  }
}

async function readEvent(eventId: string): Promise<EventRecord> {
  const result = await db.execute(sql`
    select id, organization_id, provider_account_reference, environment,
      provider_event_id, event_account_reference, event_type,
      event_created_at::text as event_created_at,
      provider_object_reference, livemode, payload_sha256, status,
      last_error_code, fencing_version, reconciliation_decision_id
    from zaltyko.organization_saas_webhook_events
    where id = ${eventId}::uuid
    limit 1
  `);
  const event = objectRows<EventRecord>(result)[0];
  if (!event) throw fail("NOT_FOUND", "Evento SaaS no encontrado", 404);
  return event;
}

async function readBaseline(
  event: EventRecord,
  subscriptionReference: string
): Promise<BaselineRecord> {
  const result = await db.execute(sql`
    select
      s.id as subscription_id,
      s.organization_id::text as organization_id,
      s.environment,
      s.provider_account_reference,
      s.customer_reference,
      s.subscription_reference,
      s.price_reference,
      s.plan_code as subscription_plan_code,
      s.provider_status,
      s.billing_interval,
      s.current_period_started_at::text as subscription_period_started_at,
      s.current_period_ends_at::text as subscription_period_ends_at,
      s.cancel_at_period_end,
      s.canceled_at::text as subscription_canceled_at,
      s.last_provider_event_reference,
      s.updated_at::text as subscription_updated_at,
      e.revision as entitlement_revision,
      e.plan_code as entitlement_plan_code,
      e.source as entitlement_source,
      e.source_reference as entitlement_source_reference,
      e.subscription_id as entitlement_subscription_id,
      e.trial_id as entitlement_trial_id,
      e.effective_from::text as entitlement_effective_from,
      e.effective_until::text as entitlement_effective_until
    from zaltyko.organization_saas_subscriptions s
    join zaltyko.organization_entitlements e
      on e.organization_id = s.organization_id
    where s.organization_id = ${event.organization_id}::uuid
      and s.environment = ${event.environment}::zaltyko.stripe_environment
      and s.provider_account_reference = ${event.provider_account_reference}
      and s.subscription_reference = ${subscriptionReference}
    limit 2
  `);
  const row = objectRows<Record<string, unknown>>(result)[0];
  if (!row || objectRows<Record<string, unknown>>(result).length !== 1) {
    throw fail("VERSION_CONFLICT", "No hay una suscripción canónica única para el evento", 409);
  }
  if (row.organization_id !== event.organization_id) {
    throw fail("VERSION_CONFLICT", "La suscripción no pertenece a la organización del evento", 409);
  }
  return {
    subscription: {
      id: String(row.subscription_id),
      organization_id: String(row.organization_id),
      environment: row.environment as "test" | "live",
      provider_account_reference: String(row.provider_account_reference),
      customer_reference: String(row.customer_reference),
      subscription_reference: String(row.subscription_reference),
      price_reference: String(row.price_reference),
      plan_code: String(row.subscription_plan_code) as PlanCode | "network",
      provider_status: String(row.provider_status) as ProviderStatus,
      billing_interval: String(row.billing_interval) as SaasBillingInterval,
      current_period_started_at: String(row.subscription_period_started_at),
      current_period_ends_at: String(row.subscription_period_ends_at),
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      canceled_at: (row.subscription_canceled_at as string | null) ?? null,
      last_provider_event_reference:
        (row.last_provider_event_reference as string | null) ?? null,
      updated_at: String(row.subscription_updated_at),
    },
    entitlement: {
      revision: row.entitlement_revision as number | string,
      plan_code: String(row.entitlement_plan_code),
      source: String(row.entitlement_source),
      source_reference: String(row.entitlement_source_reference),
      subscription_id: (row.entitlement_subscription_id as string | null) ?? null,
      trial_id: (row.entitlement_trial_id as string | null) ?? null,
      effective_from: String(row.entitlement_effective_from),
      effective_until: (row.entitlement_effective_until as string | null) ?? null,
    },
  };
}

function subscriptionReferenceFromInvoice(invoice: Record<string, unknown>): string | null {
  const direct = stringId(invoice.subscription);
  if (direct) return direct;
  const parent = record(invoice.parent);
  const details = record(parent?.subscription_details);
  return stringId(details?.subscription);
}

async function retrieveProviderEvidence(input: {
  event: EventRecord;
  baseline?: BaselineRecord;
  fallbackInvoicePlanCode?: PlanCode | null;
  config: SaasStripeConfig;
  provider: StripeReconciliationProvider;
}): Promise<{ evidence: SnapshotEvidence; baseline: BaselineRecord }> {
  const { event, config, provider } = input;
  if (
    event.provider_account_reference !== config.providerAccountReference ||
    event.environment !== config.environment ||
    event.livemode !== (config.environment === "live") ||
    event.event_account_reference !== null ||
    !event.organization_id ||
    !event.provider_object_reference ||
    !event.event_created_at
  ) {
    throw fail("VERSION_CONFLICT", "La identidad del evento no coincide con la cuenta SaaS", 409);
  }

  let invoice: Record<string, unknown> | null = null;
  let subscriptionReference: string | null = null;
  if (event.event_type.startsWith("customer.subscription.")) {
    subscriptionReference = event.provider_object_reference;
  } else {
    const invoiceValue = record(
      await retrieveFromProvider(() => provider.retrieveInvoice(event.provider_object_reference as string))
    );
    if (
      !invoiceValue ||
      invoiceValue.id !== event.provider_object_reference ||
      invoiceValue.livemode !== (config.environment === "live")
    ) {
      throw fail("UNVERIFIED_PROVIDER_EVENT", "La factura no coincide con el evento firmado", 409);
    }
    invoice = invoiceValue;
    subscriptionReference = subscriptionReferenceFromInvoice(invoiceValue);
  }
  if (!subscriptionReference) {
    throw fail("UNVERIFIED_PROVIDER_EVENT", "No se pudo resolver la suscripción del evento", 409);
  }

  const subscriptionValue = record(
    await retrieveFromProvider(() => provider.retrieveSubscription(subscriptionReference as string))
  );
  if (!subscriptionValue || subscriptionValue.id !== subscriptionReference) {
    throw fail("UNVERIFIED_PROVIDER_EVENT", "La suscripción recuperada no coincide", 409);
  }
  const subscription = toSubscriptionEvidence(subscriptionValue, config);
  const baseline = input.baseline ?? await readBaseline(event, subscriptionReference);
  if (
    baseline.subscription.subscription_reference !== subscription.reference ||
    baseline.subscription.customer_reference !== subscription.customerReference ||
    baseline.subscription.environment !== config.environment ||
    baseline.subscription.provider_account_reference !== config.providerAccountReference
  ) {
    throw fail("VERSION_CONFLICT", "La factura apunta a otra organización o suscripción", 409);
  }

  let invoiceEvidence: InvoiceEvidence | null = null;
  let statusInvoice: SnapshotEvidence["statusInvoice"] = null;
  if (event.event_type === "invoice.payment_failed") {
    if (!invoice || invoice.id !== event.provider_object_reference) {
      throw fail("UNVERIFIED_PROVIDER_EVENT", "La factura fallida no coincide con el evento", 409);
    }
    const invoiceCustomer = stringId(invoice.customer);
    if (
      !invoiceCustomer ||
      invoiceCustomer !== subscription.customerReference ||
      subscriptionReferenceFromInvoice(invoice) !== subscription.reference
    ) {
      throw fail("VERSION_CONFLICT", "Customer o suscripción de factura no coinciden", 409);
    }
    statusInvoice = {
      reference: String(invoice.id),
      status: typeof invoice.status === "string" ? invoice.status : "unknown",
      customerReference: invoiceCustomer,
      subscriptionReference: subscription.reference,
    };
  }

  if (event.event_type === "invoice.paid") {
    if (!invoice || invoice.id !== event.provider_object_reference) {
      throw fail("UNVERIFIED_PROVIDER_EVENT", "La factura pagada no coincide con el evento", 409);
    }
    const invoiceCustomer = stringId(invoice.customer);
    const invoiceSub = subscriptionReferenceFromInvoice(invoice);
    const lines = record(invoice.lines);
    const lineRows = Array.isArray(lines?.data) ? lines.data : [];
    const matchingLines = lineRows
      .map((entry) => record(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null);
    const paidLine = matchingLines.length === 1 ? matchingLines[0] : null;
    const priceReference = paidLine ? linePriceReference(paidLine) : null;
    const period = record(paidLine?.period);
    const periodStartedAt = dateIso(period?.start);
    const periodEndsAt = dateIso(period?.end);
    const amountPaid = invoice.amount_paid;
    if (
      invoice.status !== "paid" ||
      String(invoice.currency).toLowerCase() !== "eur" ||
      !invoiceCustomer ||
      invoiceCustomer !== subscription.customerReference ||
      invoiceSub !== subscription.reference ||
      typeof amountPaid !== "number" ||
      !Number.isSafeInteger(amountPaid) ||
      amountPaid < 0 ||
      !priceReference ||
      !periodStartedAt ||
      !periodEndsAt ||
      periodEndsAt <= periodStartedAt
    ) {
      throw fail("UNVERIFIED_PROVIDER_EVENT", "La factura no cumple la evidencia mínima de pago", 409);
    }
    const existingGrant =
      baseline.entitlement.source === "stripe_subscription" &&
      baseline.entitlement.source_reference === `stripe-invoice:${invoice.id}` &&
      baseline.entitlement.subscription_id === baseline.subscription.id &&
      sameInstant(baseline.entitlement.effective_from, periodStartedAt) &&
      sameInstant(baseline.entitlement.effective_until, periodEndsAt) &&
      (baseline.entitlement.plan_code === "starter" ||
        baseline.entitlement.plan_code === "growth");
    const mappedInvoicePrice = resolvePrice(config, priceReference);
    const planCode = existingGrant
      ? (baseline.entitlement.plan_code as PlanCode)
      : (mappedInvoicePrice?.planCode ?? input.fallbackInvoicePlanCode ?? null);
    if (!planCode) {
      throw fail(
        "PRICE_PLAN_NOT_AVAILABLE",
        "No se puede mapear esta factura a un plan sin revisión manual",
        409
      );
    }
    invoiceEvidence = {
      reference: String(invoice.id),
      status: String(invoice.status),
      customerReference: invoiceCustomer,
      subscriptionReference: subscription.reference,
      currency: "eur",
      paidAmount: amountPaid,
      periodStartedAt,
      periodEndsAt,
      priceReference,
      planCode,
    };
  }

  if (
    event.event_type.startsWith("customer.subscription.") &&
    event.provider_object_reference !== subscription.reference
  ) {
    throw fail("VERSION_CONFLICT", "El id de suscripción no coincide con el objeto del evento", 409);
  }
  return {
    baseline,
    evidence: { subscription, invoice: invoiceEvidence, statusInvoice },
  };
}

async function assertOperator(actorUserId: string): Promise<void> {
  const [profile] = await db
    .select({ role: profiles.role, isSuspended: profiles.isSuspended })
    .from(profiles)
    .where(eq(profiles.userId, actorUserId))
    .limit(1);
  if (!profile || profile.role !== "super_admin" || profile.isSuspended) {
    throw fail("FORBIDDEN", "Se requiere un operador de plataforma activo", 403);
  }
}

function hashEvidence(evidence: SnapshotEvidence): string {
  return sha256(canonicalJson(evidence));
}

function claimsFrom(input: {
  event: EventRecord;
  baseline: BaselineRecord;
  evidence: SnapshotEvidence;
  actorUserId: string;
  requestId: string;
  now: Date;
}): PreviewClaims {
  const { event, baseline, evidence, actorUserId, requestId, now } = input;
  if (
    event.status !== "quarantined" ||
    event.last_error_code !== "ambiguous_event_order" ||
    !event.organization_id ||
    !event.provider_object_reference ||
    !event.event_created_at ||
    event.event_account_reference !== null
  ) {
    throw fail("INVALID_STATE_TRANSITION", "El evento no está en cuarentena recuperable", 409);
  }
  return {
    version: 1,
    actorUserId,
    eventId: event.id,
    organizationId: event.organization_id,
    requestId,
    resolutionKind: resolutionFor(event.event_type),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PREVIEW_TTL_MS).toISOString(),
    event: {
      providerAccountReference: event.provider_account_reference,
      environment: event.environment,
      providerEventId: event.provider_event_id,
      eventCreatedAt: event.event_created_at,
      providerObjectReference: event.provider_object_reference,
      payloadSha256: event.payload_sha256,
      eventType: event.event_type,
      fencingVersion: Number(event.fencing_version),
      lastErrorCode: event.last_error_code,
      previousDecisionId: event.reconciliation_decision_id,
    },
    baseline,
    evidence,
    evidenceObservedAt: now.toISOString(),
    executionExpiresAt: new Date(now.getTime() + EVIDENCE_TTL_MS).toISOString(),
    snapshotSha256: hashEvidence(evidence),
  };
}

function compareBaseline(
  current: BaselineRecord,
  expected: BaselineRecord
): boolean {
  return canonicalJson(current) === canonicalJson(expected);
}

function validateRequestId(requestId: string): void {
  if (!requestId.trim() || requestId.length > 200) {
    throw fail("VERSION_CONFLICT", "requestId no válido", 400);
  }
}

export async function previewSaasReconciliation(
  input: PreviewSaasReconciliationInput,
  dependencies?: SaasReconciliationDependencies
): Promise<{
  previewToken: string;
  expiresAt: string;
  event: { id: string; type: string; createdAt: string; objectReference: string };
  resolutionKind: ResolutionKind;
  snapshotSha256: string;
  evidence: SnapshotEvidence;
}> {
  assertUuid(input.eventId, "eventId");
  assertUuid(input.actorUserId, "actorUserId");
  validateRequestId(input.requestId);
  await assertOperator(input.actorUserId);
  const runtime = getRuntime(dependencies);
  const event = await readEvent(input.eventId);
  const resolutionKind = resolutionFor(event.event_type);
  if (
    event.provider_account_reference !== runtime.config.providerAccountReference ||
    event.environment !== runtime.config.environment
  ) {
    throw fail("NOT_FOUND", "Evento no encontrado en la cuenta SaaS configurada", 404);
  }
  if (
    event.status !== "quarantined" ||
    event.last_error_code !== "ambiguous_event_order" ||
    (event.reconciliation_decision_id &&
      !(await hasStaleResult(event.reconciliation_decision_id)))
  ) {
    throw fail("INVALID_STATE_TRANSITION", "El evento no está disponible para un nuevo preview", 409);
  }
  const { evidence, baseline } = await retrieveProviderEvidence({
    event,
    config: runtime.config,
    provider: runtime.provider,
  });
  const now = runtime.now();
  const claims = claimsFrom({
    event,
    baseline,
    evidence,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    now,
  });
  const token = signToken(claims, signingSecret(dependencies));
  return {
    previewToken: token,
    expiresAt: claims.expiresAt,
    event: {
      id: event.id,
      type: event.event_type,
      createdAt: event.event_created_at as string,
      objectReference: event.provider_object_reference as string,
    },
    resolutionKind,
    snapshotSha256: claims.snapshotSha256,
    evidence,
  };
}

async function hasStaleResult(decisionId: string): Promise<boolean> {
  const result = await db.execute(sql`
    select result.outcome
    from zaltyko.organization_saas_webhook_reconciliation_results result
    where result.decision_id = ${decisionId}::uuid
    limit 1
  `);
  const row = objectRows<{ outcome: string }>(result)[0];
  return row?.outcome === "stale";
}

async function existingIdempotency(
  eventId: string,
  idempotencyKey: string
): Promise<DecisionRecord | null> {
  const result = await db.execute(sql`
    select *
    from zaltyko.organization_saas_webhook_reconciliation_decisions
    where webhook_event_id = ${eventId}::uuid
      and idempotency_key = ${idempotencyKey}
    limit 1
  `);
  return objectRows<DecisionRecord>(result)[0] ?? null;
}

async function idempotentResponse(
  decision: DecisionRecord,
  actorUserId: string,
  requestHash: string
): Promise<{ decisionId: string; eventId: string; status: "replayed" | "completed"; outcome?: string }> {
  if (
    decision.actor_user_id !== actorUserId ||
    decision.confirmation_request_sha256 !== requestHash
  ) {
    throw fail("IDEMPOTENCY_CONFLICT", "La clave ya se usó con otra confirmación", 409);
  }
  const result = await db.execute(sql`
    select outcome
    from zaltyko.organization_saas_webhook_reconciliation_results
    where decision_id = ${decision.id}::uuid
    limit 1
  `);
  const outcome = objectRows<{ outcome: string }>(result)[0]?.outcome;
  return {
    decisionId: decision.id,
    eventId: decision.webhook_event_id,
    status: outcome ? "completed" : "replayed",
    ...(outcome ? { outcome } : {}),
  };
}

async function assertFreshClaims(claims: PreviewClaims): Promise<void> {
  if (Date.parse(claims.expiresAt) <= Date.now()) {
    throw fail("VERSION_CONFLICT", "El preview ha caducado; genera uno nuevo", 409, "PREVIEW_STALE");
  }
  const event = await readEvent(claims.eventId);
  if (
    event.status !== "quarantined" ||
    event.last_error_code !== claims.event.lastErrorCode ||
    event.organization_id !== claims.organizationId ||
    event.provider_account_reference !== claims.event.providerAccountReference ||
    event.environment !== claims.event.environment ||
    event.provider_event_id !== claims.event.providerEventId ||
    event.event_created_at !== claims.event.eventCreatedAt ||
    event.provider_object_reference !== claims.event.providerObjectReference ||
    event.payload_sha256 !== claims.event.payloadSha256 ||
    Number(event.fencing_version) !== claims.event.fencingVersion ||
    event.reconciliation_decision_id !== claims.event.previousDecisionId
  ) {
    throw fail("VERSION_CONFLICT", "La identidad o el estado del evento cambió desde el preview", 409);
  }
}

async function assertLockedBaseline(
  tx: TransactionClient,
  claims: PreviewClaims
): Promise<void> {
  const organization = await tx.execute(sql`
    select id from zaltyko.organizations
    where id = ${claims.organizationId}::uuid
    for update
  `);
  if (organization.rows.length !== 1) {
    throw fail("NOT_FOUND", "Organización del evento no encontrada", 404);
  }
  const result = await tx.execute(sql`
    select
      s.id as subscription_id,
      s.organization_id::text as organization_id,
      s.environment,
      s.provider_account_reference,
      s.customer_reference,
      s.subscription_reference,
      s.price_reference,
      s.plan_code as subscription_plan_code,
      s.provider_status,
      s.billing_interval,
      s.current_period_started_at::text as subscription_period_started_at,
      s.current_period_ends_at::text as subscription_period_ends_at,
      s.cancel_at_period_end,
      s.canceled_at::text as subscription_canceled_at,
      s.last_provider_event_reference,
      s.updated_at::text as subscription_updated_at,
      e.revision as entitlement_revision,
      e.plan_code as entitlement_plan_code,
      e.source as entitlement_source,
      e.source_reference as entitlement_source_reference,
      e.subscription_id as entitlement_subscription_id,
      e.trial_id as entitlement_trial_id,
      e.effective_from::text as entitlement_effective_from,
      e.effective_until::text as entitlement_effective_until
    from zaltyko.organization_saas_subscriptions s
    join zaltyko.organization_entitlements e on e.organization_id = s.organization_id
    where s.organization_id = ${claims.organizationId}::uuid
      and s.environment = ${claims.event.environment}::zaltyko.stripe_environment
      and s.provider_account_reference = ${claims.event.providerAccountReference}
      and s.subscription_reference = ${claims.evidence.subscription.reference}
    for update of s, e
  `);
  const row = objectRows<Record<string, unknown>>(result)[0];
  if (!row) throw fail("VERSION_CONFLICT", "La suscripción o el entitlement ya no existen", 409);
  const current: BaselineRecord = {
    subscription: {
      id: String(row.subscription_id),
      organization_id: String(row.organization_id),
      environment: row.environment as "test" | "live",
      provider_account_reference: String(row.provider_account_reference),
      customer_reference: String(row.customer_reference),
      subscription_reference: String(row.subscription_reference),
      price_reference: String(row.price_reference),
      plan_code: String(row.subscription_plan_code) as PlanCode | "network",
      provider_status: String(row.provider_status) as ProviderStatus,
      billing_interval: String(row.billing_interval) as SaasBillingInterval,
      current_period_started_at: String(row.subscription_period_started_at),
      current_period_ends_at: String(row.subscription_period_ends_at),
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      canceled_at: (row.subscription_canceled_at as string | null) ?? null,
      last_provider_event_reference:
        (row.last_provider_event_reference as string | null) ?? null,
      updated_at: String(row.subscription_updated_at),
    },
    entitlement: {
      revision: row.entitlement_revision as number | string,
      plan_code: String(row.entitlement_plan_code),
      source: String(row.entitlement_source),
      source_reference: String(row.entitlement_source_reference),
      subscription_id: (row.entitlement_subscription_id as string | null) ?? null,
      trial_id: (row.entitlement_trial_id as string | null) ?? null,
      effective_from: String(row.entitlement_effective_from),
      effective_until: (row.entitlement_effective_until as string | null) ?? null,
    },
  };
  if (!compareBaseline(current, claims.baseline)) {
    throw fail("VERSION_CONFLICT", "La suscripción o el entitlement cambió desde el preview", 409);
  }
}

function validateConfirmationInput(input: ConfirmSaasReconciliationInput): string {
  assertUuid(input.eventId, "eventId");
  assertUuid(input.actorUserId, "actorUserId");
  validateRequestId(input.requestId);
  if (
    input.idempotencyKey.trim().length < 8 ||
    input.idempotencyKey.trim().length > 150
  ) {
    throw fail("VERSION_CONFLICT", "Idempotency-Key no válido", 400);
  }
  return normalizeSaasReconciliationReason(input.reason);
}

export async function confirmSaasReconciliation(
  input: ConfirmSaasReconciliationInput,
  dependencies?: SaasReconciliationDependencies
): Promise<{
  decisionId: string;
  eventId: string;
  status: "queued" | "replayed" | "completed";
  outcome?: string;
}> {
  const reason = validateConfirmationInput(input);
  await assertOperator(input.actorUserId);
  const secret = signingSecret(dependencies);
  const claims = verifyToken(input.previewToken, secret);
  if (claims.actorUserId !== input.actorUserId || claims.eventId !== input.eventId) {
    throw fail("FORBIDDEN", "El preview pertenece a otro operador o evento", 403);
  }
  const previewTokenSha256 = sha256(input.previewToken);
  const requestHash = createSaasReconciliationRequestHash({
    actorUserId: input.actorUserId,
    previewTokenSha256,
    reason,
  });
  const prior = await existingIdempotency(input.eventId, input.idempotencyKey.trim());
  if (prior) return idempotentResponse(prior, input.actorUserId, requestHash);

  const runtime = getRuntime(dependencies);
  await assertFreshClaims(claims);
  const event = await readEvent(input.eventId);
  const { evidence } = await retrieveProviderEvidence({
    event,
    baseline: claims.baseline,
    fallbackInvoicePlanCode: claims.evidence.invoice?.planCode ?? null,
    config: runtime.config,
    provider: runtime.provider,
  });
  if (hashEvidence(evidence) !== claims.snapshotSha256) {
    throw fail("VERSION_CONFLICT", "La evidencia de Stripe cambió desde el preview", 409, "PREVIEW_STALE");
  }
  const observedAt = runtime.now();
  const executionExpiresAt = new Date(observedAt.getTime() + EVIDENCE_TTL_MS);
  const decisionId = randomUUID();
  const confirmedAt = runtime.now();

  return db.transaction(async (tx) => {
    const eventResult = await tx.execute(sql`
      select id, organization_id, status, last_error_code,
        provider_account_reference, environment, provider_event_id,
        event_created_at::text as event_created_at,
        provider_object_reference, payload_sha256, fencing_version,
        reconciliation_decision_id
      from zaltyko.organization_saas_webhook_events
      where id = ${input.eventId}::uuid
      for update
    `);
    const lockedEvent = objectRows<EventRecord>(eventResult)[0];

    // Concurrent confirmations serialize on the inbox row. A request that
    // waited for the winner must replay its decision before checking whether
    // the event is still quarantined.
    const repeated = await tx.execute(sql`
      select * from zaltyko.organization_saas_webhook_reconciliation_decisions
      where webhook_event_id = ${input.eventId}::uuid
        and idempotency_key = ${input.idempotencyKey.trim()}
      limit 1
    `);
    const existing = objectRows<DecisionRecord>(repeated)[0];
    if (existing) return idempotentResponse(existing, input.actorUserId, requestHash);

    if (
      !lockedEvent ||
      lockedEvent.status !== "quarantined" ||
      lockedEvent.last_error_code !== claims.event.lastErrorCode ||
      lockedEvent.organization_id !== claims.organizationId ||
      lockedEvent.provider_account_reference !== claims.event.providerAccountReference ||
      lockedEvent.environment !== claims.event.environment ||
      lockedEvent.provider_event_id !== claims.event.providerEventId ||
      lockedEvent.event_created_at !== claims.event.eventCreatedAt ||
      lockedEvent.provider_object_reference !== claims.event.providerObjectReference ||
      lockedEvent.payload_sha256 !== claims.event.payloadSha256 ||
      Number(lockedEvent.fencing_version) !== claims.event.fencingVersion ||
      lockedEvent.reconciliation_decision_id !== claims.event.previousDecisionId
    ) {
      throw fail("VERSION_CONFLICT", "El estado del evento cambió al confirmar", 409);
    }

    await assertLockedBaseline(tx, claims);
    if (Date.parse(claims.expiresAt) <= confirmedAt.getTime()) {
      throw fail("VERSION_CONFLICT", "El preview ha caducado; genera uno nuevo", 409, "PREVIEW_STALE");
    }
    const latestEvidenceHash = hashEvidence(evidence);
    if (latestEvidenceHash !== claims.snapshotSha256) {
      throw fail("VERSION_CONFLICT", "La evidencia cambió al confirmar", 409, "PREVIEW_STALE");
    }

    const invoice = evidence.invoice;
    await tx.execute(sql`
      insert into zaltyko.organization_saas_webhook_reconciliation_decisions (
        id, organization_id, webhook_event_id, actor_user_id, request_id,
        idempotency_key, confirmation_request_sha256, resolution_kind, reason,
        provider_account_reference, environment, provider_event_id,
        event_created_at, provider_object_reference, payload_sha256,
        preview_token_sha256, preview_issued_at, preview_expires_at,
        expected_fencing_version, expected_last_provider_event_reference,
        expected_subscription_updated_at, expected_subscription_plan_code,
        expected_subscription_price_reference, expected_subscription_billing_interval,
        expected_subscription_provider_status, expected_subscription_cancel_at_period_end,
        expected_subscription_canceled_at, expected_subscription_period_started_at,
        expected_subscription_period_ends_at, expected_entitlement_revision,
        expected_entitlement_plan_code, expected_entitlement_source,
        expected_entitlement_source_reference, expected_entitlement_subscription_id,
        expected_entitlement_trial_id, expected_entitlement_effective_from,
        expected_entitlement_effective_until, evidence_observed_at,
        execution_expires_at, snapshot_sha256, observed_subscription_reference,
        observed_customer_reference, observed_plan_code, observed_provider_status,
        observed_cancel_at_period_end, observed_canceled_at,
        observed_current_period_started_at, observed_current_period_ends_at,
        observed_price_reference, observed_latest_invoice_reference,
        invoice_reference, invoice_status, invoice_customer_reference,
        invoice_subscription_reference, invoice_currency, invoice_paid_amount,
        invoice_period_started_at, invoice_period_ends_at, invoice_price_reference,
        invoice_plan_code
      ) values (
        ${decisionId}::uuid, ${claims.organizationId}::uuid, ${claims.eventId}::uuid,
        ${input.actorUserId}::uuid, ${input.requestId.trim()},
        ${input.idempotencyKey.trim()}, ${requestHash}, ${claims.resolutionKind}, ${reason},
        ${claims.event.providerAccountReference}, ${claims.event.environment}::zaltyko.stripe_environment,
        ${claims.event.providerEventId}, ${claims.event.eventCreatedAt}::timestamptz,
        ${claims.event.providerObjectReference}, ${claims.event.payloadSha256},
        ${previewTokenSha256}, ${claims.issuedAt}::timestamptz, ${claims.expiresAt}::timestamptz,
        ${claims.event.fencingVersion}, ${claims.baseline.subscription.last_provider_event_reference},
        ${claims.baseline.subscription.updated_at}::timestamptz,
        ${claims.baseline.subscription.plan_code}::zaltyko.saas_plan_code,
        ${claims.baseline.subscription.price_reference},
        ${claims.baseline.subscription.billing_interval}::zaltyko.saas_billing_interval,
        ${claims.baseline.subscription.provider_status},
        ${claims.baseline.subscription.cancel_at_period_end},
        ${claims.baseline.subscription.canceled_at}::timestamptz,
        ${claims.baseline.subscription.current_period_started_at}::timestamptz,
        ${claims.baseline.subscription.current_period_ends_at}::timestamptz,
        ${Number(claims.baseline.entitlement.revision)},
        ${claims.baseline.entitlement.plan_code}::zaltyko.saas_plan_code,
        ${claims.baseline.entitlement.source}::zaltyko.entitlement_source,
        ${claims.baseline.entitlement.source_reference},
        ${claims.baseline.entitlement.subscription_id}::uuid,
        ${claims.baseline.entitlement.trial_id}::uuid,
        ${claims.baseline.entitlement.effective_from}::timestamptz,
        ${claims.baseline.entitlement.effective_until}::timestamptz,
        ${observedAt.toISOString()}::timestamptz,
        ${executionExpiresAt.toISOString()}::timestamptz, ${claims.snapshotSha256},
        ${evidence.subscription.reference}, ${evidence.subscription.customerReference},
        ${evidence.subscription.planCode}::zaltyko.saas_plan_code,
        ${evidence.subscription.providerStatus}, ${evidence.subscription.cancelAtPeriodEnd},
        ${evidence.subscription.canceledAt}::timestamptz,
        ${evidence.subscription.currentPeriodStartedAt}::timestamptz,
        ${evidence.subscription.currentPeriodEndsAt}::timestamptz,
        ${evidence.subscription.priceReference}, ${evidence.subscription.latestInvoiceReference},
        ${invoice?.reference ?? evidence.statusInvoice?.reference ?? null},
        ${invoice?.status ?? evidence.statusInvoice?.status ?? null},
        ${invoice?.customerReference ?? evidence.statusInvoice?.customerReference ?? null},
        ${invoice?.subscriptionReference ?? evidence.statusInvoice?.subscriptionReference ?? null},
        ${invoice?.currency ?? null}, ${invoice?.paidAmount ?? null},
        ${invoice?.periodStartedAt ?? null}::timestamptz,
        ${invoice?.periodEndsAt ?? null}::timestamptz,
        ${invoice?.priceReference ?? null}, ${invoice?.planCode ?? null}::zaltyko.saas_plan_code
      )
    `);

    const linked = await tx.execute(sql`
      update zaltyko.organization_saas_webhook_events
      set reconciliation_decision_id = ${decisionId}::uuid,
          status = 'received',
          fencing_version = fencing_version + 1,
          reconciliation_next_attempt_at = clock_timestamp()
      where id = ${claims.eventId}::uuid
        and status = 'quarantined'
        and fencing_version = ${claims.event.fencingVersion}
      returning id
    `);
    if (linked.rows.length !== 1) {
      throw fail("VERSION_CONFLICT", "No se pudo enlazar la decisión al inbox", 409);
    }
    await appendReconciliationAudit(tx, {
      organizationId: claims.organizationId,
      eventId: claims.eventId,
      actorUserId: input.actorUserId,
      requestId: input.requestId.trim(),
      idempotencyKey: `${decisionId}:authorized`,
      action: "saas_webhook.quarantine_resolution_authorized",
      beforeState: { status: "quarantined", fencingVersion: claims.event.fencingVersion },
      afterState: { status: "received", decisionId, resolutionKind: claims.resolutionKind },
      metadata: {
        decisionId,
        snapshotSha256: claims.snapshotSha256,
        reasonSha256: sha256(reason),
      },
    });
    return { decisionId, eventId: claims.eventId, status: "queued" };
  });
}

async function appendReconciliationAudit(
  tx: TransactionClient,
  input: {
    organizationId: string;
    eventId: string;
    actorUserId: string;
    requestId: string;
    idempotencyKey: string;
    action: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  await tx.execute(sql`
    insert into zaltyko.audit_log (
      organization_id, actor_user_id, action, target_type, target_id,
      request_id, idempotency_key, before, after, metadata
    ) values (
      ${input.organizationId}::uuid, ${input.actorUserId}::uuid, ${input.action},
      'saas_webhook_event', ${input.eventId}::uuid, ${input.requestId},
      ${input.idempotencyKey}, ${JSON.stringify(input.beforeState)}::jsonb,
      ${JSON.stringify(input.afterState)}::jsonb, ${JSON.stringify(input.metadata)}::jsonb
    )
  `);
}

export async function consumeSaasReconciliationBatch(
  input: ConsumeSaasReconciliationBatchInput = {},
  dependencies?: SaasReconciliationDependencies
): Promise<{ claimed: number; applied: number; stale: number; retrying: number; leaseLost: number }> {
  const batchSize = input.batchSize ?? 10;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw fail("VERSION_CONFLICT", `batchSize debe estar entre 1 y ${MAX_BATCH_SIZE}`, 400);
  }
  const claimedRows = await db.execute(sql`
    with candidates as (
      select id, status as candidate_status, lease_until as candidate_lease_until,
        gen_random_uuid() as lease_token
      from zaltyko.organization_saas_webhook_events
      where reconciliation_decision_id is not null
        and (
          (status in ('received', 'failed')
            and (reconciliation_next_attempt_at is null
              or reconciliation_next_attempt_at <= clock_timestamp()))
          or (status = 'processing' and lease_until <= clock_timestamp())
        )
      order by reconciliation_next_attempt_at nulls first, received_at
      for update skip locked
      limit ${batchSize}
    )
    update zaltyko.organization_saas_webhook_events event
    set status = 'processing',
        lease_token = candidates.lease_token,
        lease_until = clock_timestamp() + ${LEASE_TTL_MS} * interval '1 millisecond',
        fencing_version = event.fencing_version + 1,
        attempts = event.attempts + 1,
        reconciliation_next_attempt_at = null,
        last_error_code = null
    from candidates
    where event.id = candidates.id
      and event.status = candidates.candidate_status
      and event.reconciliation_decision_id is not null
      and (
        (candidates.candidate_status in ('received', 'failed')
          and (event.reconciliation_next_attempt_at is null
            or event.reconciliation_next_attempt_at <= clock_timestamp()))
        or (candidates.candidate_status = 'processing'
          and event.lease_until = candidates.candidate_lease_until
          and event.lease_until <= clock_timestamp())
      )
    returning event.id, event.reconciliation_decision_id as decision_id,
      event.lease_token, event.lease_until::text as lease_until,
      event.fencing_version, event.attempts
  `);
  const claims = objectRows<ClaimedEvent>(claimedRows);
  const counts = { claimed: claims.length, applied: 0, stale: 0, retrying: 0, leaseLost: 0 };
  for (const claim of claims) {
    const decision = await readDecision(claim.decision_id);
    if (!decision) {
      counts.leaseLost += 1;
      continue;
    }
    const now = (dependencies?.now ?? (() => new Date()))();
    if (Date.parse(decision.execution_expires_at) <= now.getTime()) {
      const closed = await closeStaleDecision(claim, decision, null, "evidence_expired");
      if (closed) counts.stale += 1;
      else counts.leaseLost += 1;
      continue;
    }
    let runtime: Runtime;
    let event: EventRecord;
    let evidence: SnapshotEvidence;
    try {
      runtime = getRuntime(dependencies);
      event = await readEvent(decision.webhook_event_id);
      const resolved = await retrieveProviderEvidence({
        event,
        config: runtime.config,
        provider: runtime.provider,
        fallbackInvoicePlanCode: decision.invoice_plan_code,
      });
      evidence = resolved.evidence;
    } catch {
      const retried = await scheduleRetry(claim, decision);
      if (retried) counts.retrying += 1;
      else counts.leaseLost += 1;
      continue;
    }
    if (hashEvidence(evidence) !== decision.snapshot_sha256) {
      const staleClosed = await closeStaleDecision(
        claim,
        decision,
        hashEvidence(evidence),
        "provider_snapshot_changed"
      );
      if (staleClosed) counts.stale += 1;
      else counts.leaseLost += 1;
      continue;
    }
    const applied = await applyDecision(claim, decision, evidence, runtime.now());
    if (applied === "applied") counts.applied += 1;
    else if (applied === "stale") counts.stale += 1;
    else if (applied === "retrying") counts.retrying += 1;
    else counts.leaseLost += 1;
  }
  return counts;
}

async function readDecision(decisionId: string): Promise<DecisionRecord | null> {
  const result = await db.execute(sql`
    select
      id, organization_id, webhook_event_id, actor_user_id, request_id,
      idempotency_key, confirmation_request_sha256, resolution_kind, reason,
      provider_account_reference, environment, provider_event_id,
      event_created_at::text as event_created_at,
      provider_object_reference, payload_sha256, preview_token_sha256,
      preview_issued_at::text as preview_issued_at,
      preview_expires_at::text as preview_expires_at,
      expected_fencing_version, expected_last_provider_event_reference,
      expected_subscription_updated_at::text as expected_subscription_updated_at,
      expected_subscription_plan_code, expected_subscription_price_reference,
      expected_subscription_billing_interval, expected_subscription_provider_status,
      expected_subscription_cancel_at_period_end,
      expected_subscription_canceled_at::text as expected_subscription_canceled_at,
      expected_subscription_period_started_at::text as expected_subscription_period_started_at,
      expected_subscription_period_ends_at::text as expected_subscription_period_ends_at,
      expected_entitlement_revision, expected_entitlement_plan_code,
      expected_entitlement_source, expected_entitlement_source_reference,
      expected_entitlement_subscription_id, expected_entitlement_trial_id,
      expected_entitlement_effective_from::text as expected_entitlement_effective_from,
      expected_entitlement_effective_until::text as expected_entitlement_effective_until,
      evidence_observed_at::text as evidence_observed_at,
      execution_expires_at::text as execution_expires_at, snapshot_sha256,
      observed_subscription_reference, observed_customer_reference,
      observed_plan_code, observed_provider_status, observed_cancel_at_period_end,
      observed_canceled_at::text as observed_canceled_at,
      observed_current_period_started_at::text as observed_current_period_started_at,
      observed_current_period_ends_at::text as observed_current_period_ends_at,
      observed_price_reference, observed_latest_invoice_reference,
      invoice_reference, invoice_status, invoice_customer_reference,
      invoice_subscription_reference, invoice_currency, invoice_paid_amount,
      invoice_period_started_at::text as invoice_period_started_at,
      invoice_period_ends_at::text as invoice_period_ends_at,
      invoice_price_reference, invoice_plan_code
    from zaltyko.organization_saas_webhook_reconciliation_decisions
    where id = ${decisionId}::uuid
    limit 1
  `);
  return objectRows<DecisionRecord>(result)[0] ?? null;
}

async function lockClaimedState(
  tx: TransactionClient,
  claim: ClaimedEvent,
  decision: DecisionRecord
): Promise<{
  event: EventRecord;
  subscription: SubscriptionBaseline | null;
  entitlement: EntitlementBaseline | null;
} | null> {
  const eventResult = await tx.execute(sql`
    select id, organization_id, provider_account_reference, environment,
      provider_event_id, event_account_reference, event_type,
      event_created_at::text as event_created_at, provider_object_reference,
      livemode, payload_sha256, status, last_error_code, fencing_version,
      reconciliation_decision_id
    from zaltyko.organization_saas_webhook_events
    where id = ${claim.id}::uuid and status = 'processing'
      and reconciliation_decision_id = ${decision.id}::uuid
      and lease_token = ${claim.lease_token}::uuid
      and fencing_version = ${claim.fencing_version}
      and lease_until > clock_timestamp()
    for update
  `);
  const event = objectRows<EventRecord>(eventResult)[0];
  if (!event) return null;
  await tx.execute(sql`select id from zaltyko.organizations where id = ${decision.organization_id}::uuid for update`);
  const subscriptionResult = await tx.execute(sql`
    select id, organization_id::text as organization_id, environment,
      provider_account_reference, customer_reference, subscription_reference,
      price_reference, plan_code, provider_status, billing_interval,
      current_period_started_at::text as current_period_started_at,
      current_period_ends_at::text as current_period_ends_at,
      cancel_at_period_end, canceled_at::text as canceled_at,
      last_provider_event_reference, updated_at::text as updated_at
    from zaltyko.organization_saas_subscriptions
    where organization_id = ${decision.organization_id}::uuid
      and environment = ${decision.environment}::zaltyko.stripe_environment
      and provider_account_reference = ${decision.provider_account_reference}
      and subscription_reference = ${decision.observed_subscription_reference}
    for update
  `);
  const row = objectRows<SubscriptionBaseline & { id: string }>(subscriptionResult)[0];
  const subscription = row
    ? ({
        ...row,
        id: row.id,
        organization_id: row.organization_id,
      } as SubscriptionBaseline)
    : null;
  const entitlementResult = await tx.execute(sql`
    select revision, plan_code, source, source_reference,
      subscription_id, trial_id, effective_from::text as effective_from,
      effective_until::text as effective_until
    from zaltyko.organization_entitlements
    where organization_id = ${decision.organization_id}::uuid
    for update
  `);
  const entitlement = objectRows<EntitlementBaseline>(entitlementResult)[0] ?? null;
  return { event, subscription, entitlement };
}

function actualEntitlement(entitlement: EntitlementBaseline | null): {
  revision: number;
  sourceReference: string;
} {
  if (!entitlement) throw fail("VERSION_CONFLICT", "El entitlement ya no existe", 409);
  const revision = Number(entitlement.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw fail("FEATURE_NOT_AVAILABLE", "Revisión de entitlement inválida", 503);
  }
  return { revision, sourceReference: entitlement.source_reference };
}

async function closeStaleDecision(
  claim: ClaimedEvent,
  decision: DecisionRecord,
  observedSnapshotSha256: string | null,
  resultCode: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const locked = await lockClaimedState(tx, claim, decision);
    if (!locked) return false;
    const actual = actualEntitlement(locked.entitlement);
    await tx.execute(sql`
      insert into zaltyko.organization_saas_webhook_reconciliation_results (
        decision_id, outcome, processor_fencing_version,
        observed_snapshot_sha256, entitlement_revision_before,
        entitlement_revision_after, entitlement_source_reference_before,
        entitlement_source_reference_after, result_code
      ) values (
        ${decision.id}::uuid, 'stale', ${Number(claim.fencing_version)},
        ${observedSnapshotSha256}, ${actual.revision}, ${actual.revision},
        ${actual.sourceReference}, ${actual.sourceReference}, ${resultCode}
      )
    `);
    await appendReconciliationAudit(tx, {
      organizationId: decision.organization_id,
      eventId: decision.webhook_event_id,
      actorUserId: decision.actor_user_id,
      requestId: decision.request_id,
      idempotencyKey: `${decision.id}:stale`,
      action: "saas_webhook.quarantine_resolution_stale",
      beforeState: { revision: actual.revision, sourceReference: actual.sourceReference },
      afterState: { revision: actual.revision, sourceReference: actual.sourceReference },
      metadata: { decisionId: decision.id, resultCode, observedSnapshotSha256 },
    });
    const finished = await tx.execute(sql`
      update zaltyko.organization_saas_webhook_events
      set status = 'quarantined', processed_at = null,
          lease_token = null, lease_until = null,
          last_error_code = 'reconciliation_stale',
          reconciliation_next_attempt_at = null
      where id = ${claim.id}::uuid and status = 'processing'
        and reconciliation_decision_id = ${decision.id}::uuid
        and lease_token = ${claim.lease_token}::uuid
        and fencing_version = ${claim.fencing_version}
        and lease_until > clock_timestamp()
      returning id
    `);
    if (finished.rows.length !== 1) {
      throw fail("VERSION_CONFLICT", "El lease venció antes del cierre stale", 409);
    }
    return true;
  });
}

async function scheduleRetry(
  claim: ClaimedEvent,
  decision: DecisionRecord
): Promise<boolean> {
  const backoffMs = Math.min(5 * 60_000, 3000 * 2 ** Math.min(claim.attempts - 1, 7));
  const result = await db.execute(sql`
    update zaltyko.organization_saas_webhook_events
    set status = 'failed', processed_at = null,
        lease_token = null, lease_until = null,
        last_error_code = 'reconciliation_provider_unavailable',
        reconciliation_next_attempt_at =
          clock_timestamp() + ${backoffMs} * interval '1 millisecond'
    where id = ${claim.id}::uuid and status = 'processing'
      and reconciliation_decision_id = ${decision.id}::uuid
      and lease_token = ${claim.lease_token}::uuid
      and fencing_version = ${claim.fencing_version}
      and lease_until > clock_timestamp()
    returning id
  `);
  return result.rows.length === 1;
}

async function applyDecision(
  claim: ClaimedEvent,
  decision: DecisionRecord,
  evidence: SnapshotEvidence,
  now: Date
): Promise<"applied" | "stale" | "retrying" | "lease_lost"> {
  try {
    return await db.transaction(async (tx) => {
      const locked = await lockClaimedState(tx, claim, decision);
      if (!locked) return "lease_lost";
      if (!locked.subscription || !locked.entitlement) {
        return await insertStaleWithinTransaction(
          tx,
          claim,
          decision,
          locked,
          hashEvidence(evidence),
          "canonical_state_missing"
        );
      }
      const currentBaseline = baselineFromLocked(locked.subscription, locked.entitlement);
      if (!matchesDecisionBaseline(currentBaseline, decision)) {
        return await insertStaleWithinTransaction(
          tx,
          claim,
          decision,
          locked,
          hashEvidence(evidence),
          "baseline_changed"
        );
      }
      if (Date.parse(decision.execution_expires_at) <= now.getTime()) {
        return await insertStaleWithinTransaction(
          tx,
          claim,
          decision,
          locked,
          null,
          "evidence_expired"
        );
      }
      if (decision.resolution_kind === "status_snapshot") {
        if (
          evidence.subscription.planCode !== decision.expected_subscription_plan_code ||
          evidence.subscription.priceReference !== decision.expected_subscription_price_reference ||
          !sameInstant(evidence.subscription.currentPeriodStartedAt, decision.expected_subscription_period_started_at) ||
          !sameInstant(evidence.subscription.currentPeriodEndsAt, decision.expected_subscription_period_ends_at)
        ) {
          return await insertStaleWithinTransaction(
            tx,
            claim,
            decision,
            locked,
            hashEvidence(evidence),
            "status_snapshot_would_change_entitlement"
          );
        }
        await tx.execute(sql`
          update zaltyko.organization_saas_subscriptions
          set provider_status = ${evidence.subscription.providerStatus},
              cancel_at_period_end = ${evidence.subscription.cancelAtPeriodEnd},
              canceled_at = ${evidence.subscription.canceledAt}::timestamptz,
              last_provider_event_reference = ${decision.provider_event_id},
              last_synced_at = clock_timestamp(), updated_at = clock_timestamp()
          where id = ${locked.subscription.id}::uuid
        `);
        return await finishAppliedWithinTransaction(
          tx,
          claim,
          decision,
          locked,
          "applied",
          "status_snapshot_applied",
          now
        );
      }
      return await applyPaidInvoiceWithinTransaction(
        tx,
        claim,
        decision,
        locked,
        evidence,
        now
      );
    });
  } catch (error) {
    if (error instanceof OperationalError && error.status === 409) return "lease_lost";
    const retried = await scheduleRetry(claim, decision);
    return retried ? "retrying" : "lease_lost";
  }
}

function baselineFromLocked(
  subscription: SubscriptionBaseline,
  entitlement: EntitlementBaseline
): BaselineRecord {
  return { subscription, entitlement };
}

function matchesDecisionBaseline(
  current: BaselineRecord,
  decision: DecisionRecord
): boolean {
  const subscription = current.subscription;
  const entitlement = current.entitlement;
  return (
    subscription.organization_id === decision.organization_id &&
    subscription.environment === decision.environment &&
    subscription.provider_account_reference === decision.provider_account_reference &&
    subscription.customer_reference === decision.observed_customer_reference &&
    subscription.subscription_reference === decision.observed_subscription_reference &&
    subscription.price_reference === decision.expected_subscription_price_reference &&
    subscription.plan_code === decision.expected_subscription_plan_code &&
    subscription.provider_status === decision.expected_subscription_provider_status &&
    subscription.billing_interval === decision.expected_subscription_billing_interval &&
    subscription.current_period_started_at === decision.expected_subscription_period_started_at &&
    subscription.current_period_ends_at === decision.expected_subscription_period_ends_at &&
    subscription.cancel_at_period_end === decision.expected_subscription_cancel_at_period_end &&
    subscription.canceled_at === decision.expected_subscription_canceled_at &&
    subscription.last_provider_event_reference === decision.expected_last_provider_event_reference &&
    subscription.updated_at === decision.expected_subscription_updated_at &&
    Number(entitlement.revision) === Number(decision.expected_entitlement_revision) &&
    entitlement.plan_code === decision.expected_entitlement_plan_code &&
    entitlement.source === decision.expected_entitlement_source &&
    entitlement.source_reference === decision.expected_entitlement_source_reference &&
    entitlement.subscription_id === decision.expected_entitlement_subscription_id &&
    entitlement.trial_id === decision.expected_entitlement_trial_id &&
    entitlement.effective_from === decision.expected_entitlement_effective_from &&
    entitlement.effective_until === decision.expected_entitlement_effective_until
  );
}

async function insertStaleWithinTransaction(
  tx: TransactionClient,
  claim: ClaimedEvent,
  decision: DecisionRecord,
  locked: {
    event: EventRecord;
    subscription: SubscriptionBaseline | null;
    entitlement: EntitlementBaseline | null;
  },
  observedSnapshotSha256: string | null,
  resultCode: string
): Promise<"stale"> {
  const actual = actualEntitlement(locked.entitlement);
  await tx.execute(sql`
    insert into zaltyko.organization_saas_webhook_reconciliation_results (
      decision_id, outcome, processor_fencing_version, observed_snapshot_sha256,
      entitlement_revision_before, entitlement_revision_after,
      entitlement_source_reference_before, entitlement_source_reference_after, result_code
    ) values (
      ${decision.id}::uuid, 'stale', ${Number(claim.fencing_version)},
      ${observedSnapshotSha256}, ${actual.revision}, ${actual.revision},
      ${actual.sourceReference}, ${actual.sourceReference}, ${resultCode}
    )
  `);
  await appendReconciliationAudit(tx, {
    organizationId: decision.organization_id,
    eventId: decision.webhook_event_id,
    actorUserId: decision.actor_user_id,
    requestId: decision.request_id,
    idempotencyKey: `${decision.id}:stale`,
    action: "saas_webhook.quarantine_resolution_stale",
    beforeState: { revision: actual.revision, sourceReference: actual.sourceReference },
    afterState: { revision: actual.revision, sourceReference: actual.sourceReference },
    metadata: { decisionId: decision.id, resultCode, observedSnapshotSha256 },
  });
  await finishEvent(tx, claim, decision, "quarantined", "reconciliation_stale");
  return "stale";
}

async function finishAppliedWithinTransaction(
  tx: TransactionClient,
  claim: ClaimedEvent,
  decision: DecisionRecord,
  locked: { event: EventRecord; subscription: SubscriptionBaseline | null; entitlement: EntitlementBaseline | null },
  outcome: "applied" | "already_applied",
  resultCode: string,
  _now: Date
): Promise<"applied"> {
  const actual = actualEntitlement(locked.entitlement);
  await tx.execute(sql`
    insert into zaltyko.organization_saas_webhook_reconciliation_results (
      decision_id, outcome, processor_fencing_version, observed_snapshot_sha256,
      entitlement_revision_before, entitlement_revision_after,
      entitlement_source_reference_before, entitlement_source_reference_after, result_code
    ) values (
      ${decision.id}::uuid, ${outcome}, ${Number(claim.fencing_version)},
      ${decision.snapshot_sha256}, ${Number(decision.expected_entitlement_revision)},
      ${actual.revision}, ${decision.expected_entitlement_source_reference},
      ${actual.sourceReference}, ${resultCode}
    )
  `);
  await appendReconciliationAudit(tx, {
    organizationId: decision.organization_id,
    eventId: decision.webhook_event_id,
    actorUserId: decision.actor_user_id,
    requestId: decision.request_id,
    idempotencyKey: `${decision.id}:result`,
    action: "saas_webhook.quarantine_resolution_applied",
    beforeState: {
      revision: Number(decision.expected_entitlement_revision),
      sourceReference: decision.expected_entitlement_source_reference,
    },
    afterState: { revision: actual.revision, sourceReference: actual.sourceReference },
    metadata: { decisionId: decision.id, resultCode, outcome },
  });
  await finishEvent(tx, claim, decision, "processed", null);
  return "applied";
}

async function applyPaidInvoiceWithinTransaction(
  tx: TransactionClient,
  claim: ClaimedEvent,
  decision: DecisionRecord,
  locked: { event: EventRecord; subscription: SubscriptionBaseline | null; entitlement: EntitlementBaseline | null },
  evidence: SnapshotEvidence,
  now: Date
): Promise<"applied" | "stale"> {
  const invoice = evidence.invoice;
  const subscription = locked.subscription;
  const entitlement = locked.entitlement;
  if (!invoice || !subscription || !entitlement) {
    return insertStaleWithinTransaction(tx, claim, decision, locked, hashEvidence(evidence), "paid_evidence_missing");
  }
  const sourceReference = `stripe-invoice:${invoice.reference}`;
  const periodStillValid = Date.parse(invoice.periodEndsAt) > now.getTime();
  const alreadyApplied =
    entitlement.source === "stripe_subscription" &&
    entitlement.source_reference === sourceReference &&
    entitlement.plan_code === invoice.planCode &&
    entitlement.subscription_id === subscription.id &&
    sameInstant(entitlement.effective_from, invoice.periodStartedAt) &&
    sameInstant(entitlement.effective_until, invoice.periodEndsAt) &&
    periodStillValid;
  if (alreadyApplied) {
    return finishAppliedWithinTransaction(tx, claim, decision, locked, "already_applied", "invoice_already_granted", now);
  }
  const invoiceIsCurrent =
    invoice.status === "paid" &&
    invoice.reference === evidence.subscription.latestInvoiceReference &&
    invoice.priceReference === evidence.subscription.priceReference &&
    invoice.planCode === evidence.subscription.planCode &&
    invoice.periodStartedAt === evidence.subscription.currentPeriodStartedAt &&
    invoice.periodEndsAt === evidence.subscription.currentPeriodEndsAt &&
    periodStillValid;
  if (!invoiceIsCurrent) {
    return insertStaleWithinTransaction(tx, claim, decision, locked, hashEvidence(evidence), "invoice_not_current_or_price_changed");
  }

  const expected = Number(decision.expected_entitlement_revision);
  if (!Number.isSafeInteger(expected) || expected !== Number(entitlement.revision)) {
    return insertStaleWithinTransaction(tx, claim, decision, locked, hashEvidence(evidence), "entitlement_revision_changed");
  }
  await tx.execute(sql`
    update zaltyko.organization_saas_subscriptions
    set price_reference = ${evidence.subscription.priceReference},
        plan_code = ${invoice.planCode}::zaltyko.saas_plan_code,
        provider_status = ${evidence.subscription.providerStatus},
        billing_interval = ${evidence.subscription.billingInterval}::zaltyko.saas_billing_interval,
        current_period_started_at = ${invoice.periodStartedAt}::timestamptz,
        current_period_ends_at = ${invoice.periodEndsAt}::timestamptz,
        cancel_at_period_end = ${evidence.subscription.cancelAtPeriodEnd},
        canceled_at = ${evidence.subscription.canceledAt}::timestamptz,
        last_provider_event_reference = ${decision.provider_event_id},
        last_synced_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = ${subscription.id}::uuid
  `);
  if (entitlement.trial_id) {
    await tx.execute(sql`
      update zaltyko.organization_saas_trials
      set status = 'converted', ended_at = clock_timestamp(),
          converted_at = clock_timestamp(), updated_at = clock_timestamp()
      where id = ${entitlement.trial_id}::uuid
        and organization_id = ${decision.organization_id}::uuid
        and status = 'active'
    `);
  }
  const updated = await tx.execute(sql`
    update zaltyko.organization_entitlements
    set revision = revision + 1,
        plan_code = ${invoice.planCode}::zaltyko.saas_plan_code,
        source = 'stripe_subscription'::zaltyko.entitlement_source,
        source_reference = ${sourceReference},
        subscription_id = ${subscription.id}::uuid,
        trial_id = null,
        effective_from = ${invoice.periodStartedAt}::timestamptz,
        effective_until = ${invoice.periodEndsAt}::timestamptz,
        updated_at = clock_timestamp()
    where organization_id = ${decision.organization_id}::uuid
    returning revision, plan_code, source, source_reference, subscription_id,
      trial_id, effective_from::text as effective_from,
      effective_until::text as effective_until
  `);
  const changed = objectRows<Record<string, unknown>>(updated)[0];
  if (!changed) throw fail("FEATURE_NOT_AVAILABLE", "No se pudo conceder el entitlement pagado", 503);
  const entitlementAfter: EntitlementBaseline = {
    revision: Number(changed.revision),
    plan_code: String(changed.plan_code),
    source: String(changed.source),
    source_reference: String(changed.source_reference),
    subscription_id: String(changed.subscription_id),
    trial_id: (changed.trial_id as string | null) ?? null,
    effective_from: String(changed.effective_from),
    effective_until: String(changed.effective_until),
  };
  return finishAppliedWithinTransaction(
    tx,
    claim,
    decision,
    { ...locked, entitlement: entitlementAfter },
    "applied",
    "paid_invoice_granted",
    now
  );
}

async function finishEvent(
  tx: TransactionClient,
  claim: ClaimedEvent,
  decision: DecisionRecord,
  status: "processed" | "quarantined",
  lastErrorCode: string | null
): Promise<void> {
  const result = await tx.execute(sql`
    update zaltyko.organization_saas_webhook_events
    set status = ${status},
        processed_at = case when ${status === "processed"}
          then clock_timestamp() else null end,
        lease_token = null, lease_until = null,
        last_error_code = ${lastErrorCode},
        reconciliation_next_attempt_at = null
    where id = ${claim.id}::uuid and status = 'processing'
      and reconciliation_decision_id = ${decision.id}::uuid
      and lease_token = ${claim.lease_token}::uuid
      and fencing_version = ${claim.fencing_version}
      and lease_until > clock_timestamp()
    returning id
  `);
  if (result.rows.length !== 1) {
    throw fail("VERSION_CONFLICT", "El lease venció antes de finalizar el evento", 409);
  }
}
