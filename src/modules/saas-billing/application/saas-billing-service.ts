import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/db";
import {
  organizationEntitlements,
  organizationSaasCheckoutOperations,
  organizationSaasCustomers,
  organizationSaasSubscriptions,
  organizationSaasTrials,
  organizationSaasWebhookEvents,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { getAppUrl, getDatabaseUrl } from "@/lib/env";
import { isSaasCheckoutEnabled } from "@/lib/launch/commercial-launch-profile";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import type { OwnerSaasBillingSnapshot } from "../domain/owner-saas-contract";
import {
  grantOrganizationEntitlement,
  lockOrganizationForSaasMutation,
  resolveEffectiveOrganizationEntitlement,
} from "./entitlement-service";
import { resolveSaasOwnerScope } from "./owner-access";
import {
  createSaasStripeClient,
  getSaasStripeConfig,
  priceForPlan,
  type SaasBillingInterval,
  type SelfServePlanCode,
} from "./saas-billing-config";
import {
  assertShortPaidCheckoutCreationAllowed,
  assertShortPaidQaEnvironment,
  isShortPaidQaOrganization,
  resolveShortPaidCheckoutEnvelope,
  shortPaidStripeIdempotencyKey,
  type ShortPaidCheckoutEnvelope,
  type ShortPaidCheckoutIdentity,
} from "./short-paid-checkout-envelope";

const LEASE_MS = 90_000;
export type { OwnerSaasBillingSnapshot } from "../domain/owner-saas-contract";

export async function getOwnerSaasBillingSnapshot(input: {
  userId: string;
  organizationId: string;
  at?: Date;
}): Promise<OwnerSaasBillingSnapshot> {
  const now = input.at ?? new Date();
  const scope = await resolveSaasOwnerScope(input);
  const config = getSaasStripeConfig();
  return db.transaction(async (tx) => {
    const effective = await resolveEffectiveOrganizationEntitlement(
      tx,
      scope.organizationId,
      now
    );
    const [latestTrial] = await tx
      .select()
      .from(organizationSaasTrials)
      .where(eq(organizationSaasTrials.organizationId, scope.organizationId))
      .orderBy(desc(organizationSaasTrials.startedAt))
      .limit(1);
    const [entitlementRow] = await tx
      .select({
        source: organizationEntitlements.source,
        subscriptionId: organizationEntitlements.subscriptionId,
      })
      .from(organizationEntitlements)
      .where(eq(organizationEntitlements.organizationId, scope.organizationId))
      .limit(1);
    const [subscription] =
      config && entitlementRow?.subscriptionId
        ? await tx
            .select()
            .from(organizationSaasSubscriptions)
            .where(
              and(
                eq(
                  organizationSaasSubscriptions.id,
                  entitlementRow.subscriptionId
                ),
                eq(
                  organizationSaasSubscriptions.organizationId,
                  scope.organizationId
                ),
                eq(
                  organizationSaasSubscriptions.environment,
                  config.environment
                ),
                eq(
                  organizationSaasSubscriptions.providerAccountReference,
                  config.providerAccountReference
                )
              )
            )
            .limit(1)
        : [];
    const [customer] = config
      ? await tx
          .select({
            customerReference: organizationSaasCustomers.customerReference,
          })
          .from(organizationSaasCustomers)
          .where(
            and(
              eq(
                organizationSaasCustomers.organizationId,
                scope.organizationId
              ),
              eq(organizationSaasCustomers.environment, config.environment),
              eq(
                organizationSaasCustomers.providerAccountReference,
                config.providerAccountReference
              ),
              eq(organizationSaasCustomers.status, "ready")
            )
          )
          .limit(1)
      : [];
    const [pendingOperation] = config
      ? await tx
          .select({ status: organizationSaasCheckoutOperations.status })
          .from(organizationSaasCheckoutOperations)
          .where(
            and(
              eq(
                organizationSaasCheckoutOperations.organizationId,
                scope.organizationId
              ),
              eq(
                organizationSaasCheckoutOperations.environment,
                config.environment
              ),
              eq(
                organizationSaasCheckoutOperations.providerAccountReference,
                config.providerAccountReference
              ),
              inArray(organizationSaasCheckoutOperations.status, [
                "requested",
                "creating_customer",
                "creating_session",
                "open",
                "recovery_required",
              ])
            )
          )
          .limit(1)
      : [];

    const trialCooldownEnd = latestTrial?.cooldownEndsAt ?? null;
    const trialActive =
      latestTrial?.status === "active" &&
      latestTrial.endsAt.getTime() > now.getTime();
    const subscriptionNeedsResolution = Boolean(
      subscription &&
      [
        "active",
        "past_due",
        "unpaid",
        "incomplete",
        "paused",
        "trialing",
      ].includes(subscription.providerStatus)
    );
    const trialEligible =
      effective.planCode === "free" &&
      !trialActive &&
      !subscriptionNeedsResolution &&
      (!trialCooldownEnd || trialCooldownEnd.getTime() <= now.getTime());
    const isPaid =
      effective.source === "stripe_subscription" &&
      effective.planCode !== "free" &&
      Boolean(subscription);
    const hasOpenSubscription = subscriptionNeedsResolution;
    const hasPortalCustomer = Boolean(
      customer &&
      config?.portalEnabled &&
      subscription &&
      customer.customerReference === subscription.customerReference &&
      isPortalManageableSubscriptionStatus(subscription.providerStatus)
    );
    const [quarantinedEvent] = config ? await tx
      .select({ id: organizationSaasWebhookEvents.id })
      .from(organizationSaasWebhookEvents)
      .where(and(
        eq(organizationSaasWebhookEvents.organizationId, scope.organizationId),
        eq(organizationSaasWebhookEvents.environment, config.environment),
        eq(organizationSaasWebhookEvents.providerAccountReference, config.providerAccountReference),
        eq(organizationSaasWebhookEvents.status, "quarantined"),
      )).limit(1) : [];
    const syncStatus =
      (quarantinedEvent ? "quarantined" : pendingOperation?.status) ??
      (subscription ? "synced" : config ? "ready" : "unavailable");

    return {
      organization: {
        id: scope.organizationId,
        name: scope.organizationName,
      },
      entitlement: {
        planCode: effective.planCode,
        source: effective.source,
        revision: effective.revision,
        effectiveFrom: effective.effectiveFrom.toISOString(),
        effectiveUntil: effective.effectiveUntil?.toISOString() ?? null,
      },
      limits: {
        maxAthletes: effective.limits.athleteLimit,
        maxGroups: effective.limits.groupLimit,
        maxClasses: effective.limits.classLimit,
        maxAcademies: effective.limits.academyLimit,
      },
      trial: {
        eligible: trialEligible,
        startsAt: latestTrial?.startedAt.toISOString() ?? null,
        endsAt: latestTrial?.endsAt.toISOString() ?? null,
        nextEligibleAt: trialCooldownEnd?.toISOString() ?? null,
      },
      subscription: subscription
        ? {
            status: subscription.providerStatus,
            billingInterval: subscription.billingInterval,
            currentPeriodEndsAt: subscription.currentPeriodEndsAt.toISOString(),
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      syncStatus,
      actions: {
        canStartTrial: trialEligible && !quarantinedEvent,
        canCheckoutStarter:
          Boolean(config && isSaasCheckoutEnabled(config.environment)) &&
          !isPaid &&
          !hasOpenSubscription &&
          !pendingOperation && !quarantinedEvent,
        canCheckoutGrowth:
          Boolean(config && isSaasCheckoutEnabled(config.environment)) &&
          !isPaid &&
          !hasOpenSubscription &&
          !pendingOperation && !quarantinedEvent,
        canOpenPortal: hasPortalCustomer && !quarantinedEvent,
      },
    };
  });
}

/** Recover an existing open Checkout by reading only; never reserve or recreate it. */
export async function recoverOwnerSaasCheckout(input: {
  userId: string;
  organizationId: string;
}) {
  const scope = await resolveSaasOwnerScope(input);
  // The frozen natural-expiry experiment is outside delivery recovery.
  if (isShortPaidQaOrganization(scope.organizationId)) return null;
  const config = getSaasStripeConfig();
  if (!config) throw providerUnavailable();
  // A recovered payable URL must obey the same commercial gate as a new Checkout.
  if (!isSaasCheckoutEnabled(config.environment)) throw providerConfigUnavailable();
  const readTarget = () => db.transaction(async (tx) => {
    await resolveSaasOwnerScope({ ...input, tx });
    const [quarantined] = await tx.select({ id: organizationSaasWebhookEvents.id })
      .from(organizationSaasWebhookEvents).where(and(
        eq(organizationSaasWebhookEvents.organizationId, scope.organizationId),
        eq(organizationSaasWebhookEvents.environment, config.environment),
        eq(organizationSaasWebhookEvents.providerAccountReference, config.providerAccountReference),
        eq(organizationSaasWebhookEvents.status, "quarantined"),
      )).limit(1);
    if (quarantined) return null;
    const operations = await tx.select().from(organizationSaasCheckoutOperations).where(and(
      eq(organizationSaasCheckoutOperations.organizationId, scope.organizationId),
      eq(organizationSaasCheckoutOperations.environment, config.environment),
      eq(organizationSaasCheckoutOperations.providerAccountReference, config.providerAccountReference),
      eq(organizationSaasCheckoutOperations.status, "open"),
    )).limit(2);
    if (operations.length !== 1) return null;
    const operation = operations[0]!;
    if (!operation.customerId || !operation.checkoutSessionReference ||
      !operation.sessionExpiresAt || operation.sessionExpiresAt.getTime() <= Date.now() ||
      (operation.planCode !== "starter" && operation.planCode !== "growth")) return null;
    const [customer] = await tx.select({ customerReference: organizationSaasCustomers.customerReference })
      .from(organizationSaasCustomers).where(and(
        eq(organizationSaasCustomers.id, operation.customerId),
        eq(organizationSaasCustomers.organizationId, scope.organizationId),
        eq(organizationSaasCustomers.environment, config.environment),
        eq(organizationSaasCustomers.providerAccountReference, config.providerAccountReference),
        eq(organizationSaasCustomers.status, "ready"),
      )).limit(1);
    return customer?.customerReference ? { operation, customerReference: customer.customerReference } : null;
  });
  const target = await readTarget();
  if (!target) return null;
  const { operation, customerReference } = target;
  let session: Stripe.Checkout.Session;
  try {
    session = await createSaasStripeClient(config).checkout.sessions.retrieve(
      operation.checkoutSessionReference!, { expand: ["line_items.data.price"] }
    );
  } catch { throw providerUnavailable(); }
  if (session.status !== "open" || session.expires_at * 1000 <= Date.now()) return null;
  const expiresAt = validateCheckoutSession(session, {
    config, operation, customerReference,
    priceReference: priceForPlan(config, operation.planCode as SelfServePlanCode, operation.billingInterval),
    requireOpen: true,
  });
  if (expiresAt.getTime() !== operation.sessionExpiresAt!.getTime()) return null;
  // A webhook or permission change during the provider read must fail closed.
  const current = await readTarget();
  if (!current || current.operation.id !== operation.id ||
    current.operation.checkoutSessionReference !== session.id ||
    current.customerReference !== customerReference ||
    current.operation.requestHash !== operation.requestHash ||
    current.operation.sessionExpiresAt?.getTime() !== expiresAt.getTime()) return null;
  return { operationId: operation.id, checkoutUrl: validateCheckoutUrl(session.url),
    expiresAt, status: "pending" as const };
}

export async function startOwnerSaasTrial(input: {
  userId: string;
  organizationId: string;
  idempotencyKey: string;
  at?: Date;
}): Promise<{
  trialId: string;
  startsAt: Date;
  endsAt: Date;
  entitlementRevision: number;
  replayed: boolean;
}> {
  const requestHash = hashPayload({
    organizationId: input.organizationId,
    planCode: "starter",
    version: 1,
  });

  return db.transaction(async (tx) => {
    const scope = await resolveSaasOwnerScope({
      userId: input.userId,
      organizationId: input.organizationId,
      tx,
    });
    await lockOrganizationForSaasMutation(tx, scope.organizationId);
    const now = input.at ?? new Date();

    const [prior] = await tx
      .select()
      .from(organizationSaasTrials)
      .where(
        and(
          eq(organizationSaasTrials.organizationId, scope.organizationId),
          eq(organizationSaasTrials.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (prior) {
      if (prior.requestHash !== requestHash) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave ya se usó con otra operación",
          409
        );
      }
      const [entitlement] = await tx
        .select({ revision: organizationEntitlements.revision })
        .from(organizationEntitlements)
        .where(
          eq(organizationEntitlements.organizationId, scope.organizationId)
        )
        .limit(1);
      if (!entitlement) throw schemaUnavailable();
      return {
        trialId: prior.id,
        startsAt: prior.startedAt,
        endsAt: prior.endsAt,
        entitlementRevision: entitlement.revision,
        replayed: true,
      };
    }

    const effective = await resolveEffectiveOrganizationEntitlement(
      tx,
      scope.organizationId,
      now
    );
    const [subscriptionNeedingResolution] = await tx
      .select({ id: organizationSaasSubscriptions.id })
      .from(organizationSaasSubscriptions)
      .where(
        and(
          eq(
            organizationSaasSubscriptions.organizationId,
            scope.organizationId
          ),
          inArray(organizationSaasSubscriptions.providerStatus, [
            "active",
            "past_due",
            "unpaid",
            "incomplete",
            "paused",
            "trialing",
          ])
        )
      )
      .limit(1);
    if (effective.planCode !== "free" || subscriptionNeedingResolution) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "El trial no está disponible mientras haya una suscripción o acceso de pago",
        409,
        { code: "TRIAL_NOT_ELIGIBLE" }
      );
    }

    const [latestTrial] = await tx
      .select()
      .from(organizationSaasTrials)
      .where(eq(organizationSaasTrials.organizationId, scope.organizationId))
      .orderBy(desc(organizationSaasTrials.startedAt))
      .limit(1);
    if (
      latestTrial?.status === "active" &&
      latestTrial.endsAt.getTime() <= now.getTime()
    ) {
      await tx
        .update(organizationSaasTrials)
        .set({
          status: "expired",
          endedAt: latestTrial.endsAt,
          updatedAt: now,
        })
        .where(eq(organizationSaasTrials.id, latestTrial.id));
    }
    if (latestTrial && latestTrial.cooldownEndsAt.getTime() > now.getTime()) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "La organización aún no puede activar otro trial",
        409,
        {
          code: "TRIAL_NOT_ELIGIBLE",
          nextEligibleAt: latestTrial.cooldownEndsAt.toISOString(),
        }
      );
    }

    const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const cooldownEndsAt = addUtcCalendarMonthsClamped(now, 12);
    const [trial] = await tx
      .insert(organizationSaasTrials)
      .values({
        organizationId: scope.organizationId,
        startedByMemberId: scope.memberId,
        status: "active",
        idempotencyKey: input.idempotencyKey,
        requestHash,
        startedAt: now,
        endsAt,
        cooldownEndsAt,
      })
      .returning();
    if (!trial) throw schemaUnavailable();

    const updatedEntitlement = await grantOrganizationEntitlement(tx, {
      organizationId: scope.organizationId,
      planCode: "starter",
      source: "trial",
      sourceReference: `saas-trial:${trial.id}`,
      subscriptionId: null,
      trialId: trial.id,
      effectiveFrom: trial.startedAt,
      effectiveUntil: trial.endsAt,
    });

    return {
      trialId: trial.id,
      startsAt: trial.startedAt,
      endsAt: trial.endsAt,
      entitlementRevision: updatedEntitlement.revision,
      replayed: false,
    };
  });
}

export async function createOwnerSaasCheckout(input: {
  userId: string;
  organizationId: string;
  planCode: SelfServePlanCode;
  billingInterval: SaasBillingInterval;
  idempotencyKey: string;
  at?: Date;
}): Promise<{
  operationId: string;
  checkoutUrl: string;
  expiresAt: Date;
  status: "pending";
  replayed: boolean;
}> {
  const config = getSaasStripeConfig();
  if (!config) throw providerConfigUnavailable();
  // Reject before reserving a DB operation, creating a customer or calling Stripe.
  if (!isSaasCheckoutEnabled(config.environment)) throw providerConfigUnavailable();
  const stripe = createSaasStripeClient(config);
  const checkoutIdentity: ShortPaidCheckoutIdentity = {
    organizationId: input.organizationId,
    planCode: input.planCode,
    billingInterval: input.billingInterval,
    priceReference: priceForPlan(config, input.planCode, input.billingInterval),
    config,
    // Do not initialize or inspect database configuration for normal Checkout.
    appUrl: isShortPaidQaOrganization(input.organizationId) ? getAppUrl() : "",
    databaseUrl: isShortPaidQaOrganization(input.organizationId) ? getDatabaseUrl() : "",
  };
  assertShortPaidQaEnvironment(checkoutIdentity);

  const reservation = await db.transaction(async (tx) => {
    const scope = await resolveSaasOwnerScope({
      userId: input.userId,
      organizationId: input.organizationId,
      tx,
    });
    await lockOrganizationForSaasMutation(tx, scope.organizationId);
    const now = input.at ?? new Date();
    const priceReference = priceForPlan(
      config,
      input.planCode,
      input.billingInterval
    );
    const checkoutIdentityPayload = {
      organizationId: scope.organizationId,
      planCode: input.planCode,
      billingInterval: input.billingInterval,
      environment: config.environment,
      providerAccountReference: config.providerAccountReference,
      priceReference,
    };
    const requestHash = checkoutRequestHash(checkoutIdentityPayload, 3);
    const legacyRequestHash = checkoutRequestHash(checkoutIdentityPayload, 2);

    const [existing] = await tx
      .select()
      .from(organizationSaasCheckoutOperations)
      .where(
        and(
          eq(
            organizationSaasCheckoutOperations.organizationId,
            scope.organizationId
          ),
          eq(
            organizationSaasCheckoutOperations.environment,
            config.environment
          ),
          eq(
            organizationSaasCheckoutOperations.idempotencyKey,
            input.idempotencyKey
          )
        )
      )
      .limit(1);

    if (existing) {
      const qaEnvelope = resolveShortPaidCheckoutEnvelope({
        identity: checkoutIdentity, operation: existing,
      });
      const matchesRequest = qaEnvelope
        ? existing.requestHash === qaEnvelope.requestHash
        : existing.requestHash === requestHash || existing.requestHash === legacyRequestHash;
      if (!matchesRequest) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave ya se usó con otra operación",
          409
        );
      }
      if (
        existing.status === "open" &&
        existing.checkoutSessionReference &&
        existing.sessionExpiresAt &&
        existing.sessionExpiresAt.getTime() > now.getTime()
      ) {
        return {
          operation: existing,
          replayed: true,
          readExisting: true,
          priceReference,
        };
      }
      if (
        existing.status === "open" &&
        existing.sessionExpiresAt &&
        existing.sessionExpiresAt.getTime() <= now.getTime()
      ) {
        await tx
          .update(organizationSaasCheckoutOperations)
          .set({ status: "expired", updatedAt: sql`now()` })
          .where(eq(organizationSaasCheckoutOperations.id, existing.id));
        return { expiredOperationId: existing.id };
      }
      if (existing.status === "completed") {
        throw subscriptionAlreadyExists();
      }
      if (existing.status === "expired") {
        throw checkoutExpired(existing.id);
      }
      if (existing.status === "failed") {
        throw checkoutFailed(existing.id);
      }
      if (existing.status === "open") {
        throw checkoutRecoveryRequired(existing.id);
      }
      // A known QA session can be inspected after the creation cutoff, but a
      // missing/uncertain session must never be recreated late via Stripe's key.
      if (qaEnvelope && existing.status === "recovery_required" &&
        existing.checkoutSessionReference && existing.sessionExpiresAt) {
        return { operation: existing, replayed: true, readExisting: true, priceReference };
      }
      if (
        ["creating_customer", "creating_session"].includes(existing.status) &&
        existing.leaseUntil &&
        existing.leaseUntil.getTime() > now.getTime()
      ) {
        throw checkoutInProgress(existing.id);
      }

      const recoveryAgeMs = now.getTime() - existing.createdAt.getTime();
      if (
        existing.status === "recovery_required" ||
        existing.status === "creating_customer" ||
        existing.status === "creating_session" ||
        existing.status === "requested"
      ) {
        if (recoveryAgeMs < 0 || recoveryAgeMs >= 23 * 60 * 60 * 1000) {
          throw checkoutRecoveryRequired(existing.id);
        }
      } else {
        throw checkoutRecoveryRequired(existing.id);
      }
      assertShortPaidCheckoutCreationAllowed(qaEnvelope);

      const [claimed] = await tx
        .update(organizationSaasCheckoutOperations)
        .set({
          status: "creating_customer",
          leaseToken: randomUUID(),
          leaseUntil: sql`clock_timestamp() + ${LEASE_MS} * interval '1 millisecond'`,
          fencingVersion: sql`${organizationSaasCheckoutOperations.fencingVersion} + 1`,
          attempts: sql`${organizationSaasCheckoutOperations.attempts} + 1`,
          updatedAt: sql`now()`,
          lastErrorCode: null,
        })
        .where(
          and(
            eq(organizationSaasCheckoutOperations.id, existing.id),
            eq(organizationSaasCheckoutOperations.status, existing.status),
            sql`(${organizationSaasCheckoutOperations.leaseUntil} is null or ${organizationSaasCheckoutOperations.leaseUntil} <= clock_timestamp())`
          )
        )
        .returning();
      if (!claimed) throw providerUnavailable();
      return {
        operation: claimed,
        replayed: true,
        readExisting: false,
        priceReference,
      };
    }

    if (isShortPaidQaOrganization(scope.organizationId)) {
      // One technical experiment per fixture. A new browser idempotency key
      // must not restart the 24h window after expiry/failure/uncertain payment.
      const [priorQaOperation] = await tx.select({ id: organizationSaasCheckoutOperations.id })
        .from(organizationSaasCheckoutOperations)
        .where(eq(organizationSaasCheckoutOperations.organizationId, scope.organizationId))
        .limit(1);
      if (priorQaOperation) throw checkoutRecoveryRequired(priorQaOperation.id);
    }

    const effective = await resolveEffectiveOrganizationEntitlement(
      tx,
      scope.organizationId,
      now
    );
    if (effective.planCode !== "free" && effective.source !== "trial") {
      throw subscriptionAlreadyExists();
    }

    const [activeSubscription] = await tx
      .select({ id: organizationSaasSubscriptions.id })
      .from(organizationSaasSubscriptions)
      .where(
        and(
          eq(
            organizationSaasSubscriptions.organizationId,
            scope.organizationId
          ),
          inArray(organizationSaasSubscriptions.providerStatus, [
            "active",
            "past_due",
            "unpaid",
            "incomplete",
            "paused",
            "trialing",
          ])
        )
      )
      .limit(1);
    if (activeSubscription) throw subscriptionAlreadyExists();

    const [pending] = await tx
      .select({ id: organizationSaasCheckoutOperations.id })
      .from(organizationSaasCheckoutOperations)
      .where(
        and(
          eq(
            organizationSaasCheckoutOperations.organizationId,
            scope.organizationId
          ),
          inArray(organizationSaasCheckoutOperations.status, [
            "requested",
            "creating_customer",
            "creating_session",
            "open",
            "recovery_required",
          ])
        )
      )
      .limit(1);
    if (pending) throw checkoutInProgress(pending.id);

    const operationId = randomUUID();
    const leaseToken = randomUUID();
    const qaEnvelope = resolveShortPaidCheckoutEnvelope({
      identity: checkoutIdentity,
      // The QA hash binds this server timestamp; both hash and timestamp are
      // persisted atomically, and every retry derives from the persisted row.
      createdAt: new Date(),
    });
    assertShortPaidCheckoutCreationAllowed(qaEnvelope);
    const [operation] = await tx
      .insert(organizationSaasCheckoutOperations)
      .values({
        id: operationId,
        organizationId: scope.organizationId,
        requestedByMemberId: scope.memberId,
        environment: config.environment,
        providerAccountReference: config.providerAccountReference,
        idempotencyKey: input.idempotencyKey,
        requestHash: qaEnvelope?.requestHash ?? requestHash,
        planCode: input.planCode,
        billingInterval: input.billingInterval,
        status: "creating_customer",
        stripeIdempotencyKey: qaEnvelope
          ? shortPaidStripeIdempotencyKey(operationId, qaEnvelope.requestHash)
          : `zaltyko-saas-checkout-${operationId}`,
        ...(qaEnvelope ? { createdAt: qaEnvelope.createdAt } : {}),
        leaseToken,
        leaseUntil: sql`clock_timestamp() + ${LEASE_MS} * interval '1 millisecond'`,
        fencingVersion: 1,
        attempts: 1,
      })
      .returning();
    if (!operation) throw providerUnavailable();
    return {
      operation,
      replayed: false,
      readExisting: false,
      priceReference,
    };
  });

  if ("expiredOperationId" in reservation) {
    if (!reservation.expiredOperationId) throw providerUnavailable();
    throw checkoutExpired(reservation.expiredOperationId);
  }

  const operation = reservation.operation;
  const getQaEnvelope = () => resolveShortPaidCheckoutEnvelope({
    identity: checkoutIdentity, operation,
  });
  const qaEnvelope = getQaEnvelope();
  // A Stripe idempotency key must always retain its original request body.
  // Only v3 normal operations opt out of dashboard currency localization;
  // persisted v2 recoveries and the frozen short-paid QA envelope stay exact.
  const fixedCurrency = !qaEnvelope && operation.requestHash === checkoutRequestHash({
    organizationId: operation.organizationId,
    planCode: input.planCode,
    billingInterval: input.billingInterval,
    environment: config.environment,
    providerAccountReference: config.providerAccountReference,
    priceReference: reservation.priceReference,
  }, 3);
  const assertQaCreationAllowed = () => assertShortPaidCheckoutCreationAllowed(getQaEnvelope());
  const customerKey = `zaltyko-saas-customer-${operation.organizationId}-${config.environment}-${createHash("sha256").update(config.providerAccountReference).digest("hex").slice(0, 8)}`;
  const customerHash = hashPayload({
    organizationId: operation.organizationId,
    environment: config.environment,
    providerAccountReference: config.providerAccountReference,
  });
  if (reservation.readExisting) {
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(
        operation.checkoutSessionReference!,
        { expand: ["line_items.data.price"] }
      );
    } catch {
      throw providerUnavailable();
    }
    if (!operation.customerId) throw checkoutRecoveryRequired(operation.id);
    const [savedCustomer] = await db
      .select({
        customerReference: organizationSaasCustomers.customerReference,
      })
      .from(organizationSaasCustomers)
      .where(
        and(
          eq(organizationSaasCustomers.id, operation.customerId),
          eq(
            organizationSaasCustomers.organizationId,
            operation.organizationId
          ),
          eq(organizationSaasCustomers.environment, config.environment),
          eq(
            organizationSaasCustomers.providerAccountReference,
            config.providerAccountReference
          ),
          eq(organizationSaasCustomers.status, "ready")
        )
      )
      .limit(1);
    if (!savedCustomer?.customerReference) {
      throw checkoutRecoveryRequired(operation.id);
    }
    const expiresAt = validateCheckoutSession(session, {
      config,
      operation,
      customerReference: savedCustomer.customerReference,
      priceReference: reservation.priceReference,
      requireOpen: false,
      qaEnvelope,
    });
    if (
      session.status === "expired" ||
      (session.status === "open" && expiresAt.getTime() <= Date.now())
    ) {
      await db
        .update(organizationSaasCheckoutOperations)
        .set({ status: "expired", updatedAt: sql`now()` })
        .where(
          and(
            eq(organizationSaasCheckoutOperations.id, operation.id),
            eq(organizationSaasCheckoutOperations.status, "open"),
            eq(
              organizationSaasCheckoutOperations.checkoutSessionReference,
              session.id
            )
          )
        );
      throw checkoutExpired(operation.id);
    }
    if (
      session.status !== "open" ||
      !operation.sessionExpiresAt ||
      operation.sessionExpiresAt.getTime() !== expiresAt.getTime()
    ) {
      throw checkoutRecoveryRequired(operation.id);
    }
    return {
      operationId: operation.id,
      checkoutUrl: validateCheckoutUrl(session.url),
      expiresAt,
      status: "pending",
      replayed: reservation.replayed,
    };
  }

  const leaseToken = operation.leaseToken;
  if (!leaseToken) throw providerUnavailable();
  const fencingVersion = Number(operation.fencingVersion);
  let customerReference: string | null = null;
  let customerId: string | null = null;

  try {
    assertQaCreationAllowed();
    await validateConfiguredPrice(
      stripe,
      config,
      input.planCode,
      input.billingInterval,
      reservation.priceReference
    );

    const [savedCustomer] = await db
      .select()
      .from(organizationSaasCustomers)
      .where(
        and(
          eq(
            organizationSaasCustomers.organizationId,
            operation.organizationId
          ),
          eq(organizationSaasCustomers.environment, config.environment),
          eq(
            organizationSaasCustomers.providerAccountReference,
            config.providerAccountReference
          )
        )
      )
      .limit(1);

    if (
      savedCustomer &&
      (savedCustomer.creationIdempotencyKey !== customerKey ||
        savedCustomer.creationRequestHash !== customerHash)
    ) {
      throw providerUnavailable();
    }

    if (savedCustomer?.status === "ready" && savedCustomer.customerReference) {
      customerReference = savedCustomer.customerReference;
      customerId = savedCustomer.id;
    } else {
      const [customerReservation] = savedCustomer
        ? [savedCustomer]
        : await db
            .insert(organizationSaasCustomers)
            .values({
              organizationId: operation.organizationId,
              environment: config.environment,
              providerAccountReference: config.providerAccountReference,
              status: "creating",
              creationIdempotencyKey: customerKey,
              creationRequestHash: customerHash,
            })
            .onConflictDoNothing()
            .returning();
      if (!customerReservation) {
        const [concurrentCustomer] = await db
          .select()
          .from(organizationSaasCustomers)
          .where(
            and(
              eq(
                organizationSaasCustomers.organizationId,
                operation.organizationId
              ),
              eq(organizationSaasCustomers.environment, config.environment),
              eq(
                organizationSaasCustomers.providerAccountReference,
                config.providerAccountReference
              )
            )
          )
          .limit(1);
        if (
          concurrentCustomer?.status !== "ready" ||
          !concurrentCustomer.customerReference
        ) {
          throw providerUnavailable();
        }
        customerId = concurrentCustomer.id;
        customerReference = concurrentCustomer.customerReference;
      } else if (
        customerReservation.status === "ready" &&
        customerReservation.customerReference
      ) {
        customerId = customerReservation.id;
        customerReference = customerReservation.customerReference;
      } else {
        assertQaCreationAllowed();
        const customer = await stripe.customers.create(
          {
            metadata: {
              zaltyko_saas: "true",
              organization_id: operation.organizationId,
            },
          },
          { idempotencyKey: customerKey }
        );
        const [readyCustomer] = await db
          .update(organizationSaasCustomers)
          .set({
            status: "ready",
            customerReference: customer.id,
            attempts: sql`${organizationSaasCustomers.attempts} + 1`,
            updatedAt: sql`now()`,
            lastErrorCode: null,
          })
          .where(
            and(
              eq(organizationSaasCustomers.id, customerReservation.id),
              eq(organizationSaasCustomers.environment, config.environment),
              eq(
                organizationSaasCustomers.providerAccountReference,
                config.providerAccountReference
              )
            )
          )
          .returning();
        if (!readyCustomer) throw providerUnavailable();
        customerId = readyCustomer.id;
        customerReference = customer.id;
      }
    }

    if (!customerReference || !customerId) throw providerUnavailable();

    const leaseResult = await db.transaction(async (tx) => {
      return tx
        .update(organizationSaasCheckoutOperations)
        .set({
          status: "creating_session",
          customerId,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(organizationSaasCheckoutOperations.id, operation.id),
            eq(organizationSaasCheckoutOperations.status, "creating_customer"),
            eq(organizationSaasCheckoutOperations.leaseToken, leaseToken),
            eq(
              organizationSaasCheckoutOperations.fencingVersion,
              fencingVersion
            ),
            sql`${organizationSaasCheckoutOperations.leaseUntil} > clock_timestamp()`
          )
        )
        .returning({ id: organizationSaasCheckoutOperations.id });
    });
    if (leaseResult.length === 0) throw checkoutInProgress(operation.id);

    await resolveSaasOwnerScope({
      userId: input.userId,
      organizationId: operation.organizationId,
    });
    const metadata = {
      zaltyko_saas: "true",
      organization_saas_checkout_operation_id: operation.id,
      organization_id: operation.organizationId,
      plan_code: input.planCode,
      billing_interval: input.billingInterval,
      provider_account_reference: config.providerAccountReference,
      environment: config.environment,
    };
    const integrationIdentifier = stableIntegrationIdentifier(operation.id);
    const returnUrl = checkoutReturnUrl(operation.organizationId, "confirming");
    const cancelUrl = checkoutReturnUrl(operation.organizationId, "cancelled");
    // Recheck the real clock/config after auth/DB/provider waits, immediately
    // before the external mutation. Normal Checkout retains its exact payload.
    assertQaCreationAllowed();
    const createdSession = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        ...(fixedCurrency ? { adaptive_pricing: { enabled: false } } : {}),
        customer: customerReference,
        line_items: [
          {
            price: reservation.priceReference,
            quantity: 1,
          },
        ],
        success_url: returnUrl,
        cancel_url: cancelUrl,
        integration_identifier: integrationIdentifier,
        metadata,
        subscription_data: qaEnvelope ? {
          metadata,
          billing_cycle_anchor: qaEnvelope.billingCycleAnchor,
          proration_behavior: "create_prorations",
        } : { metadata },
        ...(qaEnvelope ? { expires_at: qaEnvelope.expiresAt } : {}),
      },
      { idempotencyKey: operation.stripeIdempotencyKey }
    );
    const session = await stripe.checkout.sessions.retrieve(createdSession.id, {
      expand: ["line_items.data.price"],
    });
    if (session.id !== createdSession.id) throw providerUnavailable();
    const expiresAt = validateCheckoutSession(session, {
      config,
      operation,
      customerReference,
      priceReference: reservation.priceReference,
      requireOpen: true,
      qaEnvelope,
    });
    const checkoutUrl = validateCheckoutUrl(session.url);

    const [savedOperation] = await db
      .update(organizationSaasCheckoutOperations)
      .set({
        status: "open",
        checkoutSessionReference: session.id,
        sessionExpiresAt: expiresAt,
        leaseToken: null,
        leaseUntil: null,
        updatedAt: sql`now()`,
        lastErrorCode: null,
      })
      .where(
        and(
          eq(organizationSaasCheckoutOperations.id, operation.id),
          eq(organizationSaasCheckoutOperations.status, "creating_session"),
          eq(organizationSaasCheckoutOperations.leaseToken, leaseToken),
          eq(organizationSaasCheckoutOperations.fencingVersion, fencingVersion),
          sql`${organizationSaasCheckoutOperations.leaseUntil} > clock_timestamp()`
        )
      )
      .returning({ id: organizationSaasCheckoutOperations.id });
    if (!savedOperation) throw checkoutInProgress(operation.id);

    return {
      operationId: operation.id,
      checkoutUrl,
      expiresAt,
      status: "pending" as const,
      replayed: reservation.replayed,
    };
  } catch (error) {
    await db
      .update(organizationSaasCheckoutOperations)
      .set({
        status: "recovery_required",
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: "provider_unavailable",
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(organizationSaasCheckoutOperations.id, operation.id),
          inArray(organizationSaasCheckoutOperations.status, [
            "creating_customer",
            "creating_session",
          ]),
          eq(organizationSaasCheckoutOperations.leaseToken, leaseToken),
          eq(organizationSaasCheckoutOperations.fencingVersion, fencingVersion)
        )
      );
    if (error instanceof OperationalError) throw error;
    throw providerUnavailable();
  }
}

export async function createOwnerSaasPortal(input: {
  userId: string;
  organizationId: string;
  idempotencyKey: string;
}): Promise<{ portalUrl: string }> {
  const config = getSaasStripeConfig();
  if (!config) throw providerConfigUnavailable();
  if (!config.portalEnabled) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "La gestión de suscripciones todavía no está habilitada",
      503,
      { code: "BILLING_PORTAL_NOT_CONFIGURED" }
    );
  }
  const scope = await resolveSaasOwnerScope(input);
  const now = new Date();
  const portalTarget = await db.transaction(async (tx) => {
    // Portal access is a commercial recovery action. It does not grant
    // product entitlement and remains available after paid access expires.
    await resolveEffectiveOrganizationEntitlement(
      tx,
      scope.organizationId,
      now
    );
    const [entitlement] = await tx
      .select({
        source: organizationEntitlements.source,
        subscriptionId: organizationEntitlements.subscriptionId,
      })
      .from(organizationEntitlements)
      .where(eq(organizationEntitlements.organizationId, scope.organizationId))
      .limit(1);
    if (!entitlement?.subscriptionId) return null;
    const [subscription] = await tx
      .select()
      .from(organizationSaasSubscriptions)
      .where(
        and(
          eq(organizationSaasSubscriptions.id, entitlement.subscriptionId),
          eq(
            organizationSaasSubscriptions.organizationId,
            scope.organizationId
          ),
          eq(organizationSaasSubscriptions.environment, config.environment),
          eq(
            organizationSaasSubscriptions.providerAccountReference,
            config.providerAccountReference
          )
        )
      )
      .limit(1);
    if (!subscription) return null;
    if (!isPortalManageableSubscriptionStatus(subscription.providerStatus)) {
      return null;
    }
    const [customer] = await tx
      .select({
        customerReference: organizationSaasCustomers.customerReference,
      })
      .from(organizationSaasCustomers)
      .where(
        and(
          eq(
            organizationSaasCustomers.customerReference,
            subscription.customerReference
          ),
          eq(organizationSaasCustomers.organizationId, scope.organizationId),
          eq(organizationSaasCustomers.environment, config.environment),
          eq(
            organizationSaasCustomers.providerAccountReference,
            config.providerAccountReference
          ),
          eq(organizationSaasCustomers.status, "ready")
        )
      )
      .limit(1);
    return customer?.customerReference ?? null;
  });
  if (!portalTarget) {
    throw new OperationalError(
      "INVALID_STATE_TRANSITION",
      "La organización aún no tiene una suscripción SaaS gestionable",
      409
    );
  }

  const key = `zaltyko-saas-portal-${hashPayload({
    organizationId: scope.organizationId,
    environment: config.environment,
    providerAccountReference: config.providerAccountReference,
    idempotencyKey: input.idempotencyKey,
  }).slice(0, 40)}`;
  try {
    const session = await createSaasStripeClient(
      config
    ).billingPortal.sessions.create(
      {
        customer: portalTarget,
        return_url: portalReturnUrl(scope.organizationId),
      },
      { idempotencyKey: key }
    );
    return { portalUrl: validatePortalUrl(session.url) };
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw providerUnavailable();
  }
}

function addUtcCalendarMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

function checkoutRequestHash(input: {
  organizationId: string;
  planCode: SelfServePlanCode;
  billingInterval: SaasBillingInterval;
  environment: "test" | "live";
  providerAccountReference: string;
  priceReference: string;
}, requestVersion: 2 | 3): string {
  return hashPayload({ ...input, requestVersion });
}

function hashPayload(value: Record<string, string | number>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableIntegrationIdentifier(operationId: string): string {
  const digest = createHash("sha256").update(operationId).digest();
  // Stripe recommends an eight-letter suffix. Derive it from the durable
  // operation ID so every retry of the same Checkout keeps the exact payload.
  const suffix = Array.from(digest.subarray(0, 8), (value) =>
    String.fromCharCode(97 + (value % 26))
  ).join("");
  return `zaltyko_saas_${suffix}`;
}

function checkoutReturnUrl(
  organizationId: string,
  checkoutState: "confirming" | "cancelled"
): string {
  const url = new URL("/owner/subscription", getAppUrl());
  url.searchParams.set("organizationId", organizationId);
  url.searchParams.set("checkout", checkoutState);
  return url.toString();
}

function portalReturnUrl(organizationId: string): string {
  const url = new URL("/owner/subscription", getAppUrl());
  url.searchParams.set("organizationId", organizationId);
  return url.toString();
}

async function validateConfiguredPrice(
  stripe: Stripe,
  config: NonNullable<ReturnType<typeof getSaasStripeConfig>>,
  planCode: SelfServePlanCode,
  billingInterval: SaasBillingInterval,
  priceReference: string
): Promise<void> {
  const price = await stripe.prices.retrieve(priceReference);
  validatePriceShape(price as unknown as Record<string, unknown>, {
    config,
    planCode,
    billingInterval,
    priceReference,
  });
}

function validateCheckoutSession(
  session: Stripe.Checkout.Session,
  input: {
    config: NonNullable<ReturnType<typeof getSaasStripeConfig>>;
    operation: typeof organizationSaasCheckoutOperations.$inferSelect;
    customerReference: string | null;
    priceReference: string;
    requireOpen: boolean;
    qaEnvelope?: ShortPaidCheckoutEnvelope | null;
  }
): Date {
  const { config, operation, customerReference, priceReference, requireOpen } =
    input;
  const metadata = (session.metadata ?? {}) as Record<string, string | null>;
  if (
    !customerReference ||
    session.mode !== "subscription" ||
    stringId(session.customer) !== customerReference ||
    session.livemode !== (config.environment === "live") ||
    metadata.zaltyko_saas !== "true" ||
    metadata.organization_saas_checkout_operation_id !== operation.id ||
    metadata.organization_id !== operation.organizationId ||
    metadata.plan_code !== operation.planCode ||
    metadata.billing_interval !== operation.billingInterval ||
    metadata.provider_account_reference !== config.providerAccountReference ||
    metadata.environment !== config.environment ||
    (operation.checkoutSessionReference !== null &&
      session.id !== operation.checkoutSessionReference) ||
    (requireOpen && session.status !== "open")
  ) {
    throw providerUnavailable();
  }

  const expiresAt = new Date((session.expires_at ?? 0) * 1000);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= 0) {
    throw providerUnavailable();
  }
  if (input.qaEnvelope && session.expires_at !== input.qaEnvelope.expiresAt) {
    throw providerUnavailable();
  }

  const lineItems = session.line_items?.data as
    Array<Record<string, unknown>> | undefined;
  if (!lineItems || lineItems.length !== 1 || lineItems[0]?.quantity !== 1) {
    throw providerUnavailable();
  }
  const price = lineItems[0]?.price;
  if (typeof price !== "object" || price === null) {
    throw providerUnavailable();
  }
  validatePriceShape(price as Record<string, unknown>, {
    config,
    planCode: operation.planCode as SelfServePlanCode,
    billingInterval: operation.billingInterval as SaasBillingInterval,
    priceReference,
  });
  return expiresAt;
}

function validatePriceShape(
  price: Record<string, unknown>,
  input: {
    config: NonNullable<ReturnType<typeof getSaasStripeConfig>>;
    planCode: SelfServePlanCode;
    billingInterval: SaasBillingInterval;
    priceReference: string;
  }
): void {
  const recurring = price.recurring as
    { interval?: unknown; interval_count?: unknown } | null | undefined;
  if (
    price.id !== input.priceReference ||
    price.active !== true ||
    price.livemode !== (input.config.environment === "live") ||
    price.currency !== "eur" ||
    price.type !== "recurring" ||
    recurring?.interval !== input.billingInterval ||
    recurring.interval_count !== 1 ||
    price.unit_amount !==
      expectedUnitAmount(input.planCode, input.billingInterval)
  ) {
    throw providerUnavailable();
  }
}

function expectedUnitAmount(
  planCode: SelfServePlanCode,
  billingInterval: SaasBillingInterval
): number {
  if (planCode === "starter") return billingInterval === "month" ? 1900 : 19000;
  return billingInterval === "month" ? 4900 : 49000;
}

function isPortalManageableSubscriptionStatus(status: string): boolean {
  return [
    "active",
    "past_due",
    "unpaid",
    "incomplete",
    "trialing",
    "paused",
    "canceled",
  ].includes(status);
}

function stringId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function validatePortalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "billing.stripe.com"
    ) {
      throw providerUnavailable();
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw providerUnavailable();
  }
}

function validateCheckoutUrl(url: string | null): string {
  if (!url) throw providerUnavailable();
  try {
    const parsed = new URL(url);
    if (
      parsed.origin !== "https://checkout.stripe.com" ||
      parsed.username !== "" || parsed.password !== ""
    ) {
      throw providerUnavailable();
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw providerUnavailable();
  }
}

function checkoutExpired(operationId: string): OperationalError {
  return new OperationalError(
    "INVALID_STATE_TRANSITION",
    "La sesión de Checkout ha caducado; inicia una nueva solicitud",
    409,
    { operationId, code: "CHECKOUT_EXPIRED" }
  );
}

function checkoutInProgress(operationId: string): OperationalError {
  return new OperationalError(
    "INVALID_STATE_TRANSITION",
    "Ya hay una operación de Checkout en curso",
    409,
    { operationId, code: "CHECKOUT_IN_PROGRESS" }
  );
}

function checkoutFailed(operationId: string): OperationalError {
  return new OperationalError(
    "INVALID_STATE_TRANSITION",
    "El intento anterior de Checkout terminó sin completar el pago",
    409,
    { operationId, code: "CHECKOUT_FAILED" }
  );
}

function checkoutRecoveryRequired(operationId: string): OperationalError {
  return new OperationalError(
    "INVALID_STATE_TRANSITION",
    "No se puede reintentar Checkout automáticamente; la operación necesita reconciliación",
    409,
    { operationId, code: "CHECKOUT_RECOVERY_REQUIRED" }
  );
}

function subscriptionAlreadyExists(): OperationalError {
  return new OperationalError(
    "INVALID_STATE_TRANSITION",
    "La organización ya tiene una suscripción o un plan de pago",
    409,
    { code: "SUBSCRIPTION_ALREADY_EXISTS" }
  );
}

function providerConfigUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "La contratación SaaS no está configurada para este entorno",
    503,
    { code: "BILLING_CONFIGURATION_UNAVAILABLE" }
  );
}

function providerUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "El proveedor de facturación no está disponible; la operación quedó protegida para reintento",
    503,
    { code: "BILLING_PROVIDER_UNAVAILABLE" }
  );
}

function schemaUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "El esquema de facturación SaaS aún no está disponible",
    503,
    { code: "BILLING_SCHEMA_UNAVAILABLE" }
  );
}
