import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/db";
import {
  organizationEntitlements,
  organizationSaasCheckoutOperations,
  organizationSaasCustomers,
  organizationSaasSubscriptions,
  organizationSaasTrials,
  organizationSaasWebhookEvents,
  organizationSaasWebhookPayloadConflicts,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { lockOrganizationForSaasMutation } from "./entitlement-service";
import {
  createSaasStripeClient,
  type SaasBillingInterval,
  type SaasStripeConfig,
  type SelfServePlanCode,
} from "./saas-billing-config";

const WEBHOOK_LEASE_MS = 60_000;

type ProcessingOutcome = "processed" | "ignored" | "quarantined";

type PreparedCanonicalEvent = {
  session?: Record<string, unknown>;
  invoice?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
};

type EventProcessingResult = {
  outcome: ProcessingOutcome;
  organizationId?: string;
  quarantineReason?: "ambiguous_event_order" | "missing_order_evidence";
};

/** Strong routing hint written only by the server into Stripe metadata. */
export function hasSaasBillingWebhookMarker(event: Stripe.Event): boolean {
  const object = event.data.object as unknown as Record<string, unknown>;
  const metadata = metadataFrom(object);
  if (metadata.zaltyko_saas === "true") return true;
  const invoiceParent = object.parent as
    | { subscription_details?: { metadata?: Record<string, string> | null } }
    | undefined;
  return invoiceParent?.subscription_details?.metadata?.zaltyko_saas === "true";
}

/**
 * Persists a verified event identity and hash, then processes it with a lease
 * and fencing token. Raw payload bytes and signature headers are never stored.
 */
export async function processSaasBillingWebhook(input: {
  event: Stripe.Event;
  rawBody: string;
  config: SaasStripeConfig;
}): Promise<{ duplicate: boolean; ignored?: boolean; quarantined?: boolean }> {
  const { event, rawBody, config } = input;
  if (event.account) return { duplicate: false, ignored: true };
  const expectedLivemode = config.environment === "live";
  if (event.livemode !== expectedLivemode) {
    throw new OperationalError(
      "UNVERIFIED_PROVIDER_EVENT",
      "El entorno del evento de facturación no coincide con el endpoint",
      400
    );
  }

  const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
  const object = event.data.object as unknown as Record<string, unknown>;
  const objectReference = typeof object.id === "string" ? object.id : null;
  const existing = await db
    .insert(organizationSaasWebhookEvents)
    .values({
      providerAccountReference: config.providerAccountReference,
      environment: config.environment,
      providerEventId: event.id,
      eventAccountReference: event.account ?? null,
      eventType: event.type,
      eventCreatedAt: new Date(event.created * 1000),
      providerObjectType:
        typeof object.object === "string" ? object.object : null,
      providerObjectReference: objectReference,
      livemode: event.livemode,
      signatureVerified: true,
      payloadSha256,
      // Metadata is only a lookup hint. Bind organization_id after its
      // relationship to a durable operation/customer has been verified.
      organizationId: null,
    })
    .onConflictDoNothing()
    .returning({ id: organizationSaasWebhookEvents.id });

  if (existing.length === 0) {
    const [prior] = await db
      .select()
      .from(organizationSaasWebhookEvents)
      .where(
        and(
          eq(
            organizationSaasWebhookEvents.providerAccountReference,
            config.providerAccountReference
          ),
          eq(organizationSaasWebhookEvents.environment, config.environment),
          eq(organizationSaasWebhookEvents.providerEventId, event.id)
        )
      )
      .limit(1);
    if (!prior) throw schemaUnavailable();
    if (prior.payloadSha256 !== payloadSha256) {
      await db
        .insert(organizationSaasWebhookPayloadConflicts)
        .values({
          webhookEventId: prior.id,
          observedPayloadSha256: payloadSha256,
        })
        .onConflictDoUpdate({
          target: [
            organizationSaasWebhookPayloadConflicts.webhookEventId,
            organizationSaasWebhookPayloadConflicts.observedPayloadSha256,
          ],
          set: {
            occurrences: sql`${organizationSaasWebhookPayloadConflicts.occurrences} + 1`,
            lastSeenAt: new Date(),
          },
        });
      return { duplicate: true, quarantined: true };
    }
    if (
      prior.status === "processed" ||
      prior.status === "ignored" ||
      prior.status === "quarantined"
    ) {
      return {
        duplicate: true,
        ignored: prior.status === "ignored",
        quarantined: prior.status === "quarantined",
      };
    }
    if (prior.reconciliationDecisionId) {
      // Reconciliation owns this durable queue row. A Stripe redelivery must
      // not claim it, clear its backoff, or race its internal consumer.
      return { duplicate: true, quarantined: true };
    }
  }

  const eventRowId = existing[0]?.id;
  const rowId =
    eventRowId ??
    (
      await db
        .select({ id: organizationSaasWebhookEvents.id })
        .from(organizationSaasWebhookEvents)
        .where(
          and(
            eq(
              organizationSaasWebhookEvents.providerAccountReference,
              config.providerAccountReference
            ),
            eq(organizationSaasWebhookEvents.environment, config.environment),
            eq(organizationSaasWebhookEvents.providerEventId, event.id)
          )
        )
        .limit(1)
    )[0]?.id;
  if (!rowId) throw schemaUnavailable();

  const leaseToken = randomUUID();
  const [claim] = await db
    .update(organizationSaasWebhookEvents)
    .set({
      status: "processing",
      leaseToken,
      leaseUntil: sql`clock_timestamp() + ${WEBHOOK_LEASE_MS} * interval '1 millisecond'`,
      fencingVersion: sql`${organizationSaasWebhookEvents.fencingVersion} + 1`,
      attempts: sql`${organizationSaasWebhookEvents.attempts} + 1`,
      lastErrorCode: null,
    })
    .where(
      and(
        eq(organizationSaasWebhookEvents.id, rowId),
        isNull(organizationSaasWebhookEvents.reconciliationDecisionId),
        or(
          inArray(organizationSaasWebhookEvents.status, ["received", "failed"]),
          and(
            eq(organizationSaasWebhookEvents.status, "processing"),
            sql`${organizationSaasWebhookEvents.leaseUntil} <= clock_timestamp()`
          )
        )
      )
    )
    .returning({
      fencingVersion: organizationSaasWebhookEvents.fencingVersion,
    });
  if (!claim) {
    const [current] = await db
      .select({
        status: organizationSaasWebhookEvents.status,
        leaseUntil: organizationSaasWebhookEvents.leaseUntil,
        reconciliationDecisionId:
          organizationSaasWebhookEvents.reconciliationDecisionId,
      })
      .from(organizationSaasWebhookEvents)
      .where(eq(organizationSaasWebhookEvents.id, rowId))
      .limit(1);
    if (current?.reconciliationDecisionId) {
      return { duplicate: true, quarantined: true };
    }
    if (current?.status === "processed" || current?.status === "ignored") {
      return { duplicate: true, ignored: current.status === "ignored" };
    }
    if (current?.status === "quarantined") {
      return { duplicate: true, quarantined: true };
    }
    if (
      current?.status === "processing" &&
      current.leaseUntil &&
      current.leaseUntil.getTime() > Date.now()
    ) {
      throw webhookLeaseBusy();
    }
    throw schemaUnavailable();
  }
  const fencingVersion = Number(claim.fencingVersion);

  try {
    const prepared = await prepareCanonicalEvent(event, config);
    return await db.transaction(async (tx) => {
      const [activeLease] = await tx
        .select({ id: organizationSaasWebhookEvents.id })
        .from(organizationSaasWebhookEvents)
        .where(
          and(
            eq(organizationSaasWebhookEvents.id, rowId),
            eq(organizationSaasWebhookEvents.status, "processing"),
            eq(organizationSaasWebhookEvents.leaseToken, leaseToken),
            eq(organizationSaasWebhookEvents.fencingVersion, fencingVersion),
            sql`${organizationSaasWebhookEvents.leaseUntil} > clock_timestamp()`
          )
        )
        .for("update")
        .limit(1);
      if (!activeLease) throw webhookLeaseBusy();

      const result = await processCanonicalEvent({
        tx,
        event,
        config,
        prepared,
      });
      const [finished] = await tx
        .update(organizationSaasWebhookEvents)
        .set({
          status: result.outcome,
          organizationId: result.organizationId ?? null,
          processedAt: result.outcome === "quarantined" ? null : sql`now()`,
          leaseToken: null,
          leaseUntil: null,
          lastErrorCode:
            result.outcome === "quarantined" ? (result.quarantineReason ?? "unmapped_reference") : null,
        })
        .where(
          and(
            eq(organizationSaasWebhookEvents.id, rowId),
            eq(organizationSaasWebhookEvents.leaseToken, leaseToken),
            eq(organizationSaasWebhookEvents.fencingVersion, fencingVersion),
            // now() is fixed at transaction start and can accept an expired lease.
            sql`${organizationSaasWebhookEvents.leaseUntil} > clock_timestamp()`
          )
        )
        .returning({ id: organizationSaasWebhookEvents.id });
      if (!finished) throw webhookLeaseBusy();
      return {
        duplicate: false,
        ignored: result.outcome === "ignored",
        quarantined: result.outcome === "quarantined",
      };
    });
  } catch (error) {
    await db
      .update(organizationSaasWebhookEvents)
      .set({
        status: "failed",
        leaseToken: null,
        leaseUntil: null,
        processedAt: null,
        lastErrorCode: "processing_failed",
      })
      .where(
        and(
          eq(organizationSaasWebhookEvents.id, rowId),
          eq(organizationSaasWebhookEvents.leaseToken, leaseToken),
          eq(organizationSaasWebhookEvents.fencingVersion, fencingVersion),
          eq(organizationSaasWebhookEvents.status, "processing"),
          sql`${organizationSaasWebhookEvents.leaseUntil} > clock_timestamp()`
        )
      );
    throw error;
  }
}

async function prepareCanonicalEvent(
  event: Stripe.Event,
  config: SaasStripeConfig
): Promise<PreparedCanonicalEvent> {
  const eventObject = event.data.object as unknown as Record<string, unknown>;
  const stripe = createSaasStripeClient(config);

  if (event.type.startsWith("checkout.session.")) {
    const sessionId = stringId(eventObject.id);
    if (!sessionId) return {};
    const session = (await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price"],
    })) as unknown as Record<string, unknown>;
    return { session };
  }

  if (event.type === "invoice.paid") {
    const invoiceId = stringId(eventObject.id);
    if (!invoiceId) return {};
    const invoice = (await stripe.invoices.retrieve(invoiceId, {
      expand: ["lines.data.price"],
    })) as unknown as Record<string, unknown>;
    if (invoice.status !== "paid") return { invoice };
    const subscriptionId = invoiceSubscriptionReference(invoice);
    if (!subscriptionId) return { invoice };
    const subscription = (await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    })) as unknown as Record<string, unknown>;
    return { invoice, subscription };
  }

  if (
    event.type.startsWith("customer.subscription.") ||
    event.type === "invoice.payment_failed"
  ) {
    const subscriptionId = event.type.startsWith("customer.subscription.")
      ? stringId(eventObject.id)
      : invoiceSubscriptionReference(eventObject);
    if (!subscriptionId) return {};
    const subscription = (await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    })) as unknown as Record<string, unknown>;
    return { subscription };
  }

  return {};
}

async function processCanonicalEvent(input: {
  tx: TransactionClient;
  event: Stripe.Event;
  config: SaasStripeConfig;
  prepared: PreparedCanonicalEvent;
}): Promise<EventProcessingResult> {
  const { tx, event, config, prepared } = input;
  if (event.account) return { outcome: "ignored" };
  if (event.type.startsWith("checkout.session.")) {
    const session = prepared.session;
    if (!session) return { outcome: "quarantined" };
    const operationId =
      metadataFrom(session).organization_saas_checkout_operation_id;
    const sessionId = stringId(session.id);
    if (!isUuid(operationId) || !sessionId) {
      return { outcome: "quarantined" };
    }
    const [initialOperation] = await tx
      .select()
      .from(organizationSaasCheckoutOperations)
      .where(eq(organizationSaasCheckoutOperations.id, operationId))
      .limit(1);
    let operation = initialOperation;
    const metadataValid = Boolean(
      operation &&
      operation.environment === config.environment &&
      operation.providerAccountReference === config.providerAccountReference &&
      metadataFrom(session).zaltyko_saas === "true" &&
      metadataFrom(session).organization_id === operation.organizationId &&
      metadataFrom(session).plan_code === operation.planCode &&
      metadataFrom(session).billing_interval === operation.billingInterval &&
      metadataFrom(session).provider_account_reference ===
        config.providerAccountReference &&
      metadataFrom(session).environment === config.environment &&
      session.mode === "subscription" &&
      session.livemode === (config.environment === "live")
    );
    if (!operation || !metadataValid || !operation.customerId) {
      return { outcome: "quarantined" };
    }
    const [customer] = await tx
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
    if (
      !customer?.customerReference ||
      stringId(session.customer) !== customer.customerReference
    ) {
      return { outcome: "quarantined" };
    }
    const lines = (
      session.line_items as
        { data?: Array<Record<string, unknown>> } | undefined
    )?.data;
    const itemPrice = lines?.[0]?.price;
    const expiresAt = new Date(Number(session.expires_at ?? 0) * 1000);
    if (
      !lines ||
      lines.length !== 1 ||
      lines[0]?.quantity !== 1 ||
      typeof itemPrice !== "object" ||
      itemPrice === null ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= 0 ||
      !isCanonicalPrice(
        itemPrice as Record<string, unknown>,
        config,
        operation.planCode as SelfServePlanCode,
        operation.billingInterval as SaasBillingInterval
      )
    ) {
      return { outcome: "quarantined" };
    }
    if (
      operation.checkoutSessionReference &&
      operation.checkoutSessionReference !== sessionId
    ) {
      return { outcome: "quarantined" };
    }
    if (operation.status === "completed") {
      return operation.checkoutSessionReference === sessionId
        ? { outcome: "processed", organizationId: operation.organizationId }
        : { outcome: "quarantined" };
    }
    if (operation.status === "failed" || operation.status === "expired") {
      return { outcome: "quarantined" };
    }

    await lockOrganizationForSaasMutation(tx, operation.organizationId);
    const [lockedOperation] = await tx
      .select()
      .from(organizationSaasCheckoutOperations)
      .where(eq(organizationSaasCheckoutOperations.id, operation.id))
      .for("update")
      .limit(1);
    if (
      !lockedOperation ||
      lockedOperation.organizationId !== operation.organizationId ||
      lockedOperation.customerId !== operation.customerId ||
      (lockedOperation.checkoutSessionReference &&
        lockedOperation.checkoutSessionReference !== sessionId)
    ) {
      return { outcome: "quarantined" };
    }
    operation = lockedOperation;
    if (operation.status === "completed") {
      return operation.checkoutSessionReference === sessionId
        ? { outcome: "processed", organizationId: operation.organizationId }
        : { outcome: "quarantined" };
    }
    if (operation.status === "failed" || operation.status === "expired") {
      return { outcome: "quarantined" };
    }
    if (event.type === "checkout.session.expired") {
      if (session.status !== "expired") {
        return { outcome: "ignored", organizationId: operation.organizationId };
      }
      await tx
        .update(organizationSaasCheckoutOperations)
        .set({
          status: "expired",
          checkoutSessionReference: sessionId,
          sessionExpiresAt: expiresAt,
          leaseToken: null,
          leaseUntil: null,
          completedAt: null,
          updatedAt: sql`now()`,
        })
        .where(eq(organizationSaasCheckoutOperations.id, operation.id));
      return { outcome: "processed", organizationId: operation.organizationId };
    }
    if (event.type === "checkout.session.async_payment_failed") {
      if (session.payment_status === "paid") {
        return { outcome: "ignored", organizationId: operation.organizationId };
      }
      await tx
        .update(organizationSaasCheckoutOperations)
        .set({
          status: "failed",
          checkoutSessionReference: null,
          sessionExpiresAt: null,
          leaseToken: null,
          leaseUntil: null,
          completedAt: null,
          updatedAt: sql`now()`,
        })
        .where(eq(organizationSaasCheckoutOperations.id, operation.id));
      return { outcome: "processed", organizationId: operation.organizationId };
    }
    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      return { outcome: "ignored", organizationId: operation.organizationId };
    }
    if (session.status !== "complete") {
      return { outcome: "ignored", organizationId: operation.organizationId };
    }
    if (
      event.type === "checkout.session.async_payment_succeeded" &&
      session.payment_status !== "paid"
    ) {
      return {
        outcome: "quarantined",
        organizationId: operation.organizationId,
      };
    }
    const paymentSettled =
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required";
    await tx
      .update(organizationSaasCheckoutOperations)
      .set({
        status: paymentSettled ? "completed" : "recovery_required",
        checkoutSessionReference: sessionId,
        sessionExpiresAt: expiresAt,
        leaseToken: null,
        leaseUntil: null,
        completedAt: paymentSettled ? sql`now()` : null,
        lastErrorCode: paymentSettled ? null : "payment_pending",
        updatedAt: sql`now()`,
      })
      .where(eq(organizationSaasCheckoutOperations.id, operation.id));
    // Checkout completion alone never grants the plan; invoice.paid does.
    return { outcome: "processed", organizationId: operation.organizationId };
  }

  if (event.type === "invoice.paid") {
    if (!prepared.invoice) return { outcome: "quarantined" };
    if (prepared.invoice.status !== "paid") return { outcome: "ignored" };
    if (!prepared.subscription) return { outcome: "quarantined" };
    return processPaidInvoice({
      tx,
      event,
      config,
      invoice: prepared.invoice,
      subscription: prepared.subscription,
    });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "invoice.payment_failed"
  ) {
    if (!prepared.subscription) return { outcome: "ignored" };
    return syncSubscriptionStatus({
      tx,
      event,
      config,
      subscription: prepared.subscription,
    });
  }

  return { outcome: "ignored" };
}

async function processPaidInvoice(input: {
  tx: TransactionClient;
  event: Stripe.Event;
  config: SaasStripeConfig;
  invoice: Record<string, unknown>;
  subscription: Record<string, unknown>;
}): Promise<EventProcessingResult> {
  const { tx, event, config, invoice, subscription } = input;
  const invoiceId = stringId(invoice.id);
  const customerReference = stringId(invoice.customer);
  const subscriptionReference = invoiceSubscriptionReference(invoice);
  if (
    !invoiceId ||
    invoice.status !== "paid" ||
    invoice.currency !== "eur" ||
    invoice.livemode !== (config.environment === "live") ||
    !customerReference ||
    !subscriptionReference ||
    stringId(subscription.id) !== subscriptionReference ||
    stringId(subscription.customer) !== customerReference ||
    subscription.livemode !== (config.environment === "live")
  ) {
    return {
      outcome: invoice.status === "paid" ? "quarantined" : "ignored",
    };
  }
  const subscriptionMetadata = metadataFrom(subscription);
  const invoiceMetadata = metadataFrom(invoice);
  const invoiceSubscriptionMetadata = subscriptionMetadataFromInvoice(invoice);
  const operationId =
    subscriptionMetadata.organization_saas_checkout_operation_id;
  if (
    subscriptionMetadata.zaltyko_saas !== "true" ||
    subscriptionMetadata.environment !== config.environment ||
    subscriptionMetadata.provider_account_reference !==
      config.providerAccountReference ||
    !isUuid(subscriptionMetadata.organization_id) ||
    !isUuid(operationId) ||
    (invoiceMetadata.zaltyko_saas === "true" &&
      !metadataMatchesSaasInvoice(
        invoiceMetadata,
        config,
        operationId,
        subscriptionMetadata.organization_id
      )) ||
    (invoiceSubscriptionMetadata.zaltyko_saas === "true" &&
      !metadataMatchesSaasInvoice(
        invoiceSubscriptionMetadata,
        config,
        operationId,
        subscriptionMetadata.organization_id
      ))
  ) {
    return { outcome: "quarantined" };
  }

  const providerStatus =
    typeof subscription.status === "string" ? subscription.status : null;
  if (
    !providerStatus ||
    !["active", "past_due", "canceled"].includes(providerStatus)
  ) {
    return { outcome: "quarantined" };
  }
  const subscriptionItems = subscription.items as
    { data?: Array<Record<string, unknown>> } | undefined;
  if (
    !subscriptionItems?.data ||
    subscriptionItems.data.length !== 1 ||
    subscriptionItems.data[0]?.quantity !== 1
  ) {
    return { outcome: "quarantined" };
  }
  const priceObject = subscriptionItems.data[0]?.price;
  if (typeof priceObject !== "object" || priceObject === null) {
    return { outcome: "quarantined" };
  }
  const priceRecord = priceObject as Record<string, unknown>;
  const priceId =
    typeof priceRecord.id === "string" ? priceRecord.id : undefined;
  const mappedPrice = resolvePlanFromPrice(config, priceId);
  if (
    !mappedPrice ||
    !isCanonicalPrice(
      priceRecord,
      config,
      mappedPrice.planCode,
      mappedPrice.billingInterval
    )
  ) {
    return { outcome: "quarantined" };
  }

  const invoiceLines = invoice.lines as
    { data?: Array<Record<string, unknown>> } | undefined;
  const paidLine = invoiceLines?.data?.find(
    (line) => getPriceId(line) === priceId
  );
  const period = paidLine?.period as
    { start?: unknown; end?: unknown } | undefined;
  if (
    !paidLine ||
    !period ||
    typeof period.start !== "number" ||
    typeof period.end !== "number" ||
    period.end <= period.start
  ) {
    return { outcome: "quarantined" };
  }
  const periodStartedAt = new Date(period.start * 1000);
  const periodEndsAt = new Date(period.end * 1000);
  if (
    !Number.isFinite(periodStartedAt.getTime()) ||
    !Number.isFinite(periodEndsAt.getTime())
  ) {
    return { outcome: "quarantined" };
  }
  if (periodEndsAt.getTime() <= Date.now()) {
    return { outcome: "ignored" };
  }

  const [customer] = await tx
    .select()
    .from(organizationSaasCustomers)
    .where(
      and(
        eq(organizationSaasCustomers.environment, config.environment),
        eq(
          organizationSaasCustomers.providerAccountReference,
          config.providerAccountReference
        ),
        eq(organizationSaasCustomers.customerReference, customerReference),
        eq(organizationSaasCustomers.status, "ready")
      )
    )
    .limit(1);
  if (
    !customer ||
    customer.organizationId !== subscriptionMetadata.organization_id
  ) {
    return { outcome: "quarantined" };
  }

  const [existingSubscription] = await tx
    .select()
    .from(organizationSaasSubscriptions)
    .where(
      and(
        eq(organizationSaasSubscriptions.environment, config.environment),
        eq(
          organizationSaasSubscriptions.providerAccountReference,
          config.providerAccountReference
        ),
        eq(
          organizationSaasSubscriptions.subscriptionReference,
          subscriptionReference
        )
      )
    )
    .limit(1);

  let operation:
    typeof organizationSaasCheckoutOperations.$inferSelect | undefined;
  [operation] = await tx
    .select()
    .from(organizationSaasCheckoutOperations)
    .where(
      and(
        eq(organizationSaasCheckoutOperations.id, operationId),
        eq(organizationSaasCheckoutOperations.environment, config.environment),
        eq(
          organizationSaasCheckoutOperations.providerAccountReference,
          config.providerAccountReference
        )
      )
    )
    .limit(1);
  if (!operation) {
    return { outcome: "quarantined" };
  }
  const organizationId =
    existingSubscription?.organizationId ?? operation?.organizationId;
  if (
    !organizationId ||
    customer.organizationId !== organizationId ||
    operation.organizationId !== organizationId ||
    operation.organizationId !== subscriptionMetadata.organization_id ||
    operation.customerId !== customer.id ||
    ["failed", "expired"].includes(operation.status)
  ) {
    return { outcome: "quarantined" };
  }

  await lockOrganizationForSaasMutation(tx, organizationId);
  const [lockedOperation] = await tx
    .select()
    .from(organizationSaasCheckoutOperations)
    .where(
      and(
        eq(organizationSaasCheckoutOperations.id, operation.id),
        eq(organizationSaasCheckoutOperations.environment, config.environment),
        eq(
          organizationSaasCheckoutOperations.providerAccountReference,
          config.providerAccountReference
        )
      )
    )
    .for("update")
    .limit(1);
  if (
    !lockedOperation ||
    lockedOperation.organizationId !== organizationId ||
    lockedOperation.customerId !== customer.id ||
    ["failed", "expired"].includes(lockedOperation.status)
  ) {
    return { outcome: "quarantined" };
  }
  operation = lockedOperation;
  const [current] = await tx
    .select()
    .from(organizationSaasSubscriptions)
    .where(eq(organizationSaasSubscriptions.organizationId, organizationId))
    .for("update")
    .limit(1);
  if (
    current &&
    (current.environment !== config.environment ||
      current.providerAccountReference !== config.providerAccountReference)
  ) {
    return { outcome: "quarantined" };
  }
  // Portal changes retain the original Checkout operation. Only an already
  // bound subscription, re-read under the organization lock, may change its
  // plan/interval; a first purchase must still match its Checkout request.
  const boundSubscription = Boolean(
    current &&
    current.organizationId === organizationId &&
    current.subscriptionReference === subscriptionReference &&
    current.customerReference === customerReference
  );
  if (
    !boundSubscription &&
    (operation.planCode !== mappedPrice.planCode ||
      operation.billingInterval !== mappedPrice.billingInterval)
  ) {
    return { outcome: "quarantined" };
  }
  if (
    current &&
    current.subscriptionReference !== subscriptionReference &&
    current.currentPeriodEndsAt.getTime() > periodStartedAt.getTime()
  ) {
    return { outcome: "quarantined" };
  }
  if (
    current &&
    current.subscriptionReference === subscriptionReference &&
    current.currentPeriodEndsAt.getTime() > periodEndsAt.getTime()
  ) {
    return { outcome: "ignored", organizationId };
  }

  const billingInterval = mappedPrice.billingInterval;
  if (
    boundSubscription && current &&
    current.currentPeriodEndsAt.getTime() === periodEndsAt.getTime() &&
    (current.planCode !== mappedPrice.planCode || current.billingInterval !== billingInterval)
  ) {
    // Compare against the event that granted the current paid entitlement,
    // not lastProviderEventReference (status-only events also update that).
    // Read under the organization lock: provider snapshots were fetched before it.
    const [entitlement] = await tx.select({ sourceReference: organizationEntitlements.sourceReference })
      .from(organizationEntitlements)
      .where(eq(organizationEntitlements.organizationId, organizationId)).limit(1);
    const invoiceReference = entitlement?.sourceReference.startsWith("stripe-invoice:")
      ? entitlement.sourceReference.slice("stripe-invoice:".length) : null;
    if (!invoiceReference) return { outcome: "quarantined", organizationId, quarantineReason: "missing_order_evidence" };
    const [grantEvent] = await tx.select({ createdAt: organizationSaasWebhookEvents.eventCreatedAt })
      .from(organizationSaasWebhookEvents)
      .where(and(
        eq(organizationSaasWebhookEvents.organizationId, organizationId),
        eq(organizationSaasWebhookEvents.environment, config.environment),
        eq(organizationSaasWebhookEvents.providerAccountReference, config.providerAccountReference),
        eq(organizationSaasWebhookEvents.providerObjectReference, invoiceReference),
        eq(organizationSaasWebhookEvents.eventType, "invoice.paid"),
        eq(organizationSaasWebhookEvents.status, "processed"),
      )).orderBy(desc(organizationSaasWebhookEvents.eventCreatedAt)).limit(1);
    if (!grantEvent?.createdAt) return { outcome: "quarantined", organizationId, quarantineReason: "missing_order_evidence" };
    const delta = event.created * 1000 - grantEvent.createdAt.getTime();
    if (delta < 0) return { outcome: "ignored", organizationId };
    // Stripe timestamps have second precision: a tie is not a total order.
    // Preserve the current entitlement and flag reconciliation, never order IDs.
    if (delta === 0) return { outcome: "quarantined", organizationId, quarantineReason: "ambiguous_event_order" };
  }
  // A paid invoice may grant access while its subscription snapshot predates
  // a status event. Keep those independent clocks; never resurrect canceled.
  let preserveStatus = false;
  if (current?.subscriptionReference === subscriptionReference) {
    if (!current.lastProviderEventReference) return { outcome: "quarantined", organizationId, quarantineReason: "missing_order_evidence" };
    const [previous] = await tx.select({ createdAt: organizationSaasWebhookEvents.eventCreatedAt })
      .from(organizationSaasWebhookEvents).where(and(
        eq(organizationSaasWebhookEvents.providerEventId, current.lastProviderEventReference),
        eq(organizationSaasWebhookEvents.environment, config.environment),
        eq(organizationSaasWebhookEvents.providerAccountReference, config.providerAccountReference),
        eq(organizationSaasWebhookEvents.organizationId, organizationId),
        eq(organizationSaasWebhookEvents.status, "processed"),
      )).limit(1);
    if (!previous?.createdAt) return { outcome: "quarantined", organizationId, quarantineReason: "missing_order_evidence" };
    const delta = event.created * 1000 - previous.createdAt.getTime();
    const canceledAt = typeof subscription.canceled_at === "number" ? subscription.canceled_at * 1000 : null;
    if (delta === 0 && (current.providerStatus !== providerStatus ||
        current.cancelAtPeriodEnd !== (subscription.cancel_at_period_end === true) ||
        (current.canceledAt?.getTime() ?? null) !== canceledAt)) {
      return { outcome: "quarantined", organizationId, quarantineReason: "ambiguous_event_order" };
    }
    preserveStatus = delta < 0;
  }
  const subscriptionValues = {
    organizationId,
    provider: "stripe",
    environment: config.environment,
    providerAccountReference: config.providerAccountReference,
    customerReference,
    subscriptionReference,
    priceReference: priceId!,
    planCode: mappedPrice.planCode,
    providerStatus: preserveStatus ? current!.providerStatus : providerStatus,
    billingInterval,
    currentPeriodStartedAt: periodStartedAt,
    currentPeriodEndsAt: periodEndsAt,
    cancelAtPeriodEnd: preserveStatus ? current!.cancelAtPeriodEnd : subscription.cancel_at_period_end === true,
    canceledAt:
      preserveStatus ? current!.canceledAt : typeof subscription.canceled_at === "number"
        ? new Date(subscription.canceled_at * 1000)
        : null,
    lastProviderEventReference: preserveStatus ? current!.lastProviderEventReference : event.id,
    lastSyncedAt: sql`now()`,
    updatedAt: sql`now()`,
  } as const;
  let subscriptionRowId: string;
  if (current) {
    const [updated] = await tx
      .update(organizationSaasSubscriptions)
      .set(subscriptionValues)
      .where(eq(organizationSaasSubscriptions.id, current.id))
      .returning({ id: organizationSaasSubscriptions.id });
    if (!updated) throw schemaUnavailable();
    subscriptionRowId = updated.id;
  } else {
    const [inserted] = await tx
      .insert(organizationSaasSubscriptions)
      .values(subscriptionValues)
      .returning({ id: organizationSaasSubscriptions.id });
    if (!inserted) throw schemaUnavailable();
    subscriptionRowId = inserted.id;
  }

  const [trialEntitlement] = await tx
    .select({ trialId: organizationEntitlements.trialId })
    .from(organizationEntitlements)
    .where(eq(organizationEntitlements.organizationId, organizationId))
    .limit(1);
  if (!trialEntitlement) throw schemaUnavailable();
  if (trialEntitlement.trialId) {
    await tx
      .update(organizationSaasTrials)
      .set({
        status: "converted",
        endedAt: sql`now()`,
        convertedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(organizationSaasTrials.id, trialEntitlement.trialId),
          eq(organizationSaasTrials.organizationId, organizationId),
          // Terminal trials are immutable. A later purchase grants the paid
          // entitlement without rewriting an expired/cancelled trial history.
          eq(organizationSaasTrials.status, "active")
        )
      );
  }
  const [updatedEntitlement] = await tx
    .update(organizationEntitlements)
    .set({
      planCode: mappedPrice.planCode,
      source: "stripe_subscription",
      sourceReference: `stripe-invoice:${invoiceId}`,
      subscriptionId: subscriptionRowId,
      trialId: null,
      effectiveFrom: periodStartedAt,
      effectiveUntil: periodEndsAt,
      updatedAt: sql`now()`,
    })
    .where(eq(organizationEntitlements.organizationId, organizationId))
    .returning({ revision: organizationEntitlements.revision });
  if (!updatedEntitlement) throw schemaUnavailable();

  if (
    operation &&
    !["completed", "failed", "expired"].includes(operation.status)
  ) {
    const [currentOperation] = await tx
      .select()
      .from(organizationSaasCheckoutOperations)
      .where(eq(organizationSaasCheckoutOperations.id, operation.id))
      .for("update")
      .limit(1);
    if (currentOperation && currentOperation.status !== "completed") {
      const sessionSaved = Boolean(
        currentOperation.checkoutSessionReference &&
        currentOperation.sessionExpiresAt
      );
      await tx
        .update(organizationSaasCheckoutOperations)
        .set({
          status: sessionSaved ? "completed" : "recovery_required",
          completedAt: sessionSaved ? sql`now()` : null,
          leaseToken: null,
          leaseUntil: null,
          lastErrorCode: sessionSaved ? null : "session_reference_pending",
          updatedAt: sql`now()`,
        })
        .where(eq(organizationSaasCheckoutOperations.id, currentOperation.id));
    }
  }
  return { outcome: "processed", organizationId };
}

async function syncSubscriptionStatus(input: {
  tx: TransactionClient;
  event: Stripe.Event;
  config: SaasStripeConfig;
  subscription: Record<string, unknown>;
}): Promise<EventProcessingResult> {
  const { tx, event, config, subscription } = input;
  const subscriptionId = stringId(subscription.id);
  const customerReference = stringId(subscription.customer);
  if (!subscriptionId) return { outcome: "ignored" };
  const providerStatus =
    typeof subscription.status === "string" ? subscription.status : null;
  if (
    !customerReference ||
    subscription.livemode !== (config.environment === "live") ||
    !providerStatus ||
    ![
      "incomplete",
      "incomplete_expired",
      "trialing",
      "active",
      "past_due",
      "canceled",
      "unpaid",
      "paused",
    ].includes(providerStatus)
  ) {
    return { outcome: "quarantined" };
  }
  const [current] = await tx
    .select()
    .from(organizationSaasSubscriptions)
    .where(
      and(
        eq(organizationSaasSubscriptions.environment, config.environment),
        eq(
          organizationSaasSubscriptions.providerAccountReference,
          config.providerAccountReference
        ),
        eq(organizationSaasSubscriptions.subscriptionReference, subscriptionId)
      )
    )
    .limit(1);
  if (!current || current.customerReference !== customerReference) {
    return { outcome: "quarantined" };
  }
  await lockOrganizationForSaasMutation(tx, current.organizationId);
  const [locked] = await tx.select().from(organizationSaasSubscriptions)
    .where(eq(organizationSaasSubscriptions.id, current.id)).for("update").limit(1);
  if (!locked || locked.subscriptionReference !== subscriptionId ||
      locked.customerReference !== customerReference || locked.environment !== config.environment ||
      locked.providerAccountReference !== config.providerAccountReference) {
    return { outcome: "quarantined", organizationId: current.organizationId };
  }
  if (!locked.lastProviderEventReference) {
    return { outcome: "quarantined", organizationId: locked.organizationId, quarantineReason: "missing_order_evidence" };
  }
  if (locked.lastProviderEventReference) {
    const [previous] = await tx.select({ createdAt: organizationSaasWebhookEvents.eventCreatedAt })
      .from(organizationSaasWebhookEvents).where(and(
        eq(organizationSaasWebhookEvents.providerEventId, locked.lastProviderEventReference),
        eq(organizationSaasWebhookEvents.environment, config.environment),
        eq(organizationSaasWebhookEvents.providerAccountReference, config.providerAccountReference),
        eq(organizationSaasWebhookEvents.organizationId, locked.organizationId),
        eq(organizationSaasWebhookEvents.status, "processed"),
      )).limit(1);
    if (!previous?.createdAt) return { outcome: "quarantined", organizationId: locked.organizationId, quarantineReason: "missing_order_evidence" };
    const delta = event.created * 1000 - previous.createdAt.getTime();
    if (delta < 0) return { outcome: "ignored", organizationId: locked.organizationId };
    const canceledAt = typeof subscription.canceled_at === "number" ? subscription.canceled_at * 1000 : null;
    if (delta === 0 && (locked.providerStatus !== providerStatus ||
        locked.cancelAtPeriodEnd !== (subscription.cancel_at_period_end === true) ||
        (locked.canceledAt?.getTime() ?? null) !== canceledAt)) {
      return { outcome: "quarantined", organizationId: locked.organizationId, quarantineReason: "ambiguous_event_order" };
    }
  }
  await tx
    .update(organizationSaasSubscriptions)
    .set({
      providerStatus,
      cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
      canceledAt:
        typeof subscription.canceled_at === "number"
          ? new Date(subscription.canceled_at * 1000)
          : null,
      lastProviderEventReference: event.id,
      lastSyncedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(organizationSaasSubscriptions.id, current.id));
  // Status events never extend paid access; invoice.paid is the sole grant.
  return { outcome: "processed", organizationId: current.organizationId };
}

function resolvePlanFromPrice(
  config: SaasStripeConfig,
  priceId: string | undefined
): {
  planCode: "starter" | "growth";
  billingInterval: "month" | "year";
} | null {
  if (!priceId) return null;
  for (const planCode of ["starter", "growth"] as const) {
    for (const billingInterval of ["month", "year"] as const) {
      if (config.prices[planCode][billingInterval] === priceId) {
        return { planCode, billingInterval };
      }
    }
  }
  return null;
}

function invoiceSubscriptionReference(
  invoice: Record<string, unknown>
): string | null {
  const direct = stringId(invoice.subscription);
  if (direct) return direct;
  const parent = invoice.parent as
    { subscription_details?: { subscription?: unknown } } | undefined;
  return stringId(parent?.subscription_details?.subscription);
}

function isCanonicalPrice(
  price: Record<string, unknown>,
  config: SaasStripeConfig,
  planCode: SelfServePlanCode,
  billingInterval: SaasBillingInterval
): boolean {
  const recurring = price.recurring as
    { interval?: unknown; interval_count?: unknown } | null | undefined;
  const expectedPriceId = config.prices[planCode][billingInterval];
  const expectedAmount =
    planCode === "starter"
      ? billingInterval === "month"
        ? 1900
        : 19000
      : billingInterval === "month"
        ? 4900
        : 49000;
  return (
    price.id === expectedPriceId &&
    price.active === true &&
    price.livemode === (config.environment === "live") &&
    price.currency === "eur" &&
    price.type === "recurring" &&
    recurring?.interval === billingInterval &&
    recurring.interval_count === 1 &&
    price.unit_amount === expectedAmount
  );
}

function getPriceId(line: Record<string, unknown>): string | null {
  const legacyPrice = line.price as { id?: string } | string | undefined;
  if (typeof legacyPrice === "string") return legacyPrice;
  if (legacyPrice?.id) return legacyPrice.id;
  const pricing = line.pricing as
    { price_details?: { price?: string | { id?: string } } } | undefined;
  const currentPrice = pricing?.price_details?.price;
  return typeof currentPrice === "string"
    ? currentPrice
    : (currentPrice?.id ?? null);
}

function metadataFrom(object: Record<string, unknown>): Record<string, string> {
  if (typeof object.metadata !== "object" || object.metadata === null)
    return {};
  return Object.fromEntries(
    Object.entries(object.metadata).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function subscriptionMetadataFromInvoice(
  invoice: Record<string, unknown>
): Record<string, string> {
  const parent = invoice.parent as
    { subscription_details?: { metadata?: unknown } } | undefined;
  const metadata = parent?.subscription_details?.metadata;
  if (typeof metadata !== "object" || metadata === null) return {};
  return Object.fromEntries(
    Object.entries(metadata).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function metadataMatchesSaasInvoice(
  metadata: Record<string, string>,
  config: SaasStripeConfig,
  operationId: string,
  organizationId: string
): boolean {
  return (
    metadata.zaltyko_saas === "true" &&
    metadata.environment === config.environment &&
    metadata.provider_account_reference === config.providerAccountReference &&
    metadata.organization_saas_checkout_operation_id === operationId &&
    metadata.organization_id === organizationId
  );
}

function stringId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value
    )
  );
}

function schemaUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "El inbox de facturación SaaS no está disponible",
    503,
    { code: "BILLING_SCHEMA_UNAVAILABLE" }
  );
}

function webhookLeaseBusy(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "El evento de facturación SaaS sigue en procesamiento",
    503,
    { code: "BILLING_PROVIDER_UNAVAILABLE" }
  );
}
