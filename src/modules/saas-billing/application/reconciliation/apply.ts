/**
 * Applies a decision under the lease: status snapshot or paid invoice grant
 * (subscription, trial conversion, entitlement revision), or a stale close
 * when the baseline or the evidence no longer match.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { sameInstant } from "../reconciliation-time";
import { objectRows } from "./canonical";
import { fail } from "./errors";
import { hashEvidence } from "./evidence";
import { lockClaimedState, scheduleRetry } from "./lease";
import type { EventRecord, SubscriptionBaseline, EntitlementBaseline, BaselineRecord, SnapshotEvidence, DecisionRecord, ClaimedEvent } from "./model";
import { insertStaleWithinTransaction, finishAppliedWithinTransaction } from "./outcomes";

/**
 * @internal Solo para consumeSaasReconciliationBatch. Exige un evento
 * reclamado por ese consumidor (lease_token, fencing_version y lease_until
 * vigentes) y bloquea en el orden evento, organización, suscripción y
 * entitlement; fuera de él puede escribir sin lease o interbloquear. Importa
 * desde reconciliation-service.
 */
export async function applyDecision(
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

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function baselineFromLocked(
  subscription: SubscriptionBaseline,
  entitlement: EntitlementBaseline
): BaselineRecord {
  return { subscription, entitlement };
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function matchesDecisionBaseline(
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

/**
 * @internal Solo dentro de la transacción de consumeSaasReconciliationBatch,
 * después de lockClaimedState: presupone el lease y los bloqueos ya tomados.
 * Importa desde reconciliation-service.
 */
export async function applyPaidInvoiceWithinTransaction(
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
  if (!changed) throw fail("FEATURE_NOT_AVAILABLE", "No se pudo activar el plan pagado", 503);
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
