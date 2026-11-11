/**
 * Reads outside transactions: inbox event, canonical baseline, decisions
 * and their results.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { SaasBillingInterval } from "../saas-billing-config";
import { objectRows } from "./canonical";
import { fail } from "./errors";
import type { PlanCode, ProviderStatus, EventRecord, BaselineRecord, DecisionRecord } from "./model";

export async function readEvent(eventId: string): Promise<EventRecord> {
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

export async function readBaseline(
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

export async function hasStaleResult(decisionId: string): Promise<boolean> {
  const result = await db.execute(sql`
    select result.outcome
    from zaltyko.organization_saas_webhook_reconciliation_results result
    where result.decision_id = ${decisionId}::uuid
    limit 1
  `);
  const row = objectRows<{ outcome: string }>(result)[0];
  return row?.outcome === "stale";
}

export async function existingIdempotency(
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

export async function readDecision(decisionId: string): Promise<DecisionRecord | null> {
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
