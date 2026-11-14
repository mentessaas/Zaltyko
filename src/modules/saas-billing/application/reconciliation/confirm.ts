/**
 * confirmSaasReconciliation: verifies the preview, replays by idempotency
 * key, re-checks the event and the locked baseline, and queues the decision
 * on the inbox row in one transaction.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import type { SaasBillingInterval } from "../saas-billing-config";
import { appendReconciliationAudit } from "./audit";
import { objectRows, canonicalJson, sha256, createSaasReconciliationRequestHash } from "./canonical";
import { fail } from "./errors";
import { retrieveProviderEvidence, hashEvidence } from "./evidence";
import { EVIDENCE_TTL_MS, type PlanCode, type ProviderStatus, type ConfirmSaasReconciliationInput, type SaasReconciliationDependencies, type EventRecord, type BaselineRecord, type PreviewClaims, type DecisionRecord } from "./model";
import { assertOperator } from "./operator";
import { signingSecret, verifyToken } from "./preview-token";
import { readEvent, existingIdempotency } from "./reads";
import { getRuntime } from "./runtime";
import { validateConfirmationInput } from "./validation";

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export async function idempotentResponse(
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

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export async function assertFreshClaims(claims: PreviewClaims): Promise<void> {
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

/**
 * @internal Solo para confirmSaasReconciliation, dentro de su transacción y
 * después de bloquear la fila del inbox: bloquea organización, suscripción y
 * entitlement en ese orden. Importa desde reconciliation-service.
 */
export async function assertLockedBaseline(
  tx: TransactionClient,
  claims: PreviewClaims
): Promise<void> {
  const organization = await tx.execute(sql`
    select id from zaltyko.organizations
    where id = ${claims.organizationId}::uuid
    for update
  `);
  if (organization.rows.length !== 1) {
    throw fail("NOT_FOUND", "Academia del evento no encontrada", 404);
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
  if (!row) throw fail("VERSION_CONFLICT", "La suscripción o el plan ya no existen", 409);
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
    throw fail("VERSION_CONFLICT", "La suscripción o el plan cambió desde la vista previa", 409);
  }
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function compareBaseline(
  current: BaselineRecord,
  expected: BaselineRecord
): boolean {
  return canonicalJson(current) === canonicalJson(expected);
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
