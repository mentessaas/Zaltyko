/**
 * Provider evidence: reads the invoice and subscription from Stripe,
 * checks them against the signed event and the canonical baseline, maps the
 * canonical price and hashes the snapshot.
 */
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { sameInstant } from "../reconciliation-time";
import type { SaasBillingInterval, SaasStripeConfig } from "../saas-billing-config";
import { dateIso, record, stringId, canonicalJson, sha256 } from "./canonical";
import { fail } from "./errors";
import type { ResolutionKind, PlanCode, ProviderStatus, StripeReconciliationProvider, EventRecord, BaselineRecord, SubscriptionEvidence, InvoiceEvidence, SnapshotEvidence } from "./model";
import { readBaseline } from "./reads";

export function resolvePrice(
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

export function canonicalPrice(
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

export function providerStatus(value: unknown): ProviderStatus {
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

export function epochFrom(value: unknown): string {
  const timestamp = dateIso(value);
  if (!timestamp) {
    throw fail("UNVERIFIED_PROVIDER_EVENT", "Periodo de suscripción no verificable", 409);
  }
  return timestamp;
}

export function linePriceReference(line: Record<string, unknown>): string | null {
  const legacy = line.price;
  const legacyId = stringId(legacy);
  if (legacyId) return legacyId;
  const pricing = record(line.pricing);
  const details = record(pricing?.price_details);
  return stringId(details?.price);
}

export function toSubscriptionEvidence(
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

export function resolutionFor(eventType: string): ResolutionKind {
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

export async function retrieveFromProvider<T>(operation: () => Promise<T>): Promise<T> {
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

export function subscriptionReferenceFromInvoice(invoice: Record<string, unknown>): string | null {
  const direct = stringId(invoice.subscription);
  if (direct) return direct;
  const parent = record(invoice.parent);
  const details = record(parent?.subscription_details);
  return stringId(details?.subscription);
}

export async function retrieveProviderEvidence(input: {
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

export function hashEvidence(evidence: SnapshotEvidence): string {
  return sha256(canonicalJson(evidence));
}
