import "server-only";

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { createSaasStripeClient, getSaasStripeConfig, priceForLocation } from "./saas-billing-config";

/** Synchronizes Stripe quantity to max(active locations - one included, 0). */
export async function syncOrganizationLocationAddon(input: {
  organizationId: string;
  idempotencyKey: string;
}): Promise<void> {
  const [subscriptionResult, locationsResult] = await Promise.all([
    db.execute(sql`select subscription_reference,billing_interval::text as billing_interval,
        environment::text as environment,provider_account_reference,provider_status
      from zaltyko.organization_saas_subscriptions
      where organization_id=${input.organizationId}::uuid
        and provider_status in ('active','past_due','unpaid','paused','trialing')`),
    db.execute(sql`select count(*)::int as count from zaltyko.locations
      where organization_id=${input.organizationId}::uuid and is_active`),
  ]);
  const subscription = subscriptionResult.rows[0] as {
    subscription_reference: string;
    billing_interval: "month" | "year";
    environment: "test" | "live";
    provider_account_reference: string;
  } | undefined;
  if (!subscription) return;

  const config = getSaasStripeConfig();
  if (!config || config.environment !== subscription.environment ||
      config.providerAccountReference !== subscription.provider_account_reference) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se ha podido actualizar el importe de las sedes. Vuelve a intentarlo.", 503);
  }
  const activeLocations = Number(locationsResult.rows[0]?.count ?? 0);
  if (!Number.isSafeInteger(activeLocations) || activeLocations < 1) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se ha podido comprobar el número de sedes activas.", 503);
  }
  const quantity = Math.max(activeLocations - 1, 0);
  const stripe = createSaasStripeClient(config);
  const taxRate = config.taxRates?.esVatGeneral;
  if (config.environment === "live" && !taxRate) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se ha podido actualizar el IVA de las sedes.", 503);
  }
  const subscriptionObject = await stripe.subscriptions.retrieve(subscription.subscription_reference);
  const price = priceForLocation(config, subscription.billing_interval);
  const item = subscriptionObject.items.data.find((candidate) =>
    (typeof candidate.price === "string" ? candidate.price : candidate.price.id) === price
  );
  const key = createHash("sha256").update(
    `${input.organizationId}:${input.idempotencyKey}:${quantity}:${price}`
  ).digest("hex");
  const taxRates = taxRate ? [taxRate] : undefined;
  if (quantity === 0) {
    if (item) await stripe.subscriptionItems.del(item.id, { proration_behavior: "create_prorations" }, { idempotencyKey: key });
    return;
  }
  if (item) {
    await stripe.subscriptionItems.update(item.id, {
      quantity,
      proration_behavior: "create_prorations",
      ...(taxRates ? { tax_rates: taxRates } : {}),
    }, { idempotencyKey: key });
  } else {
    await stripe.subscriptionItems.create({
      subscription: subscription.subscription_reference,
      price,
      quantity,
      proration_behavior: "create_prorations",
      ...(taxRates ? { tax_rates: taxRates } : {}),
    }, { idempotencyKey: key });
  }
}
