/**
 * Types and limits of the SaaS webhook reconciliation: public inputs and
 * dependencies, inbox / baseline / evidence / decision records, preview
 * claims, and the preview, evidence and lease TTLs.
 */
import type { SaasBillingInterval, SaasStripeConfig, SelfServePlanCode } from "../saas-billing-config";

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export const PREVIEW_TTL_MS = 5 * 60_000;

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export const EVIDENCE_TTL_MS = 2 * 60_000;

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export const LEASE_TTL_MS = 60_000;

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export const MAX_BATCH_SIZE = 50;

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export type ResolutionKind = "status_snapshot" | "paid_invoice_grant";

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export type PlanCode = SelfServePlanCode;

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export type ProviderStatus =
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

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export interface EventRecord {
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

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export interface SubscriptionBaseline {
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

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export interface EntitlementBaseline {
  revision: number | string;
  plan_code: string;
  source: string;
  source_reference: string;
  subscription_id: string | null;
  trial_id: string | null;
  effective_from: string;
  effective_until: string | null;
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export interface BaselineRecord {
  subscription: SubscriptionBaseline;
  entitlement: EntitlementBaseline;
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export interface SubscriptionEvidence {
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

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export interface InvoiceEvidence {
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

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export interface SnapshotEvidence {
  subscription: SubscriptionEvidence;
  invoice: InvoiceEvidence | null;
  statusInvoice: {
    reference: string;
    status: string;
    customerReference: string;
    subscriptionReference: string;
  } | null;
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export interface PreviewClaims {
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

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export interface DecisionRecord {
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

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export interface ClaimedEvent {
  id: string;
  decision_id: string;
  lease_token: string;
  lease_until: string;
  fencing_version: number | string;
  attempts: number;
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export interface Runtime {
  config: SaasStripeConfig;
  provider: StripeReconciliationProvider;
  now: () => Date;
}
