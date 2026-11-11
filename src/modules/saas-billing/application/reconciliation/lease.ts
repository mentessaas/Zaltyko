/**
 * Lease and fencing of a claimed inbox event: lock the claimed state, finish
 * the event and schedule a retry, all guarded by status, decision, lease
 * token, fencing version and lease expiry.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { objectRows } from "./canonical";
import { fail } from "./errors";
import type { EventRecord, SubscriptionBaseline, EntitlementBaseline, DecisionRecord, ClaimedEvent } from "./model";

export async function lockClaimedState(
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

export async function scheduleRetry(
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

export async function finishEvent(
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
