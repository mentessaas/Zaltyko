import Stripe from "stripe";

import { db } from "@/db";
import { plans } from "@/db/schema";

import { getStripeClient } from "./client";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";
import type { PlanCode } from "@/types/billing";

export interface PlanSyncResult {
  updatedPlanCodes: string[];
  archivedPlanCodes: string[];
  missingStripePrices: string[];
}

interface StripePlanMetadata {
  plan_code?: string;
}

export function resolvePlanCode(price: Stripe.Price): PlanCode | null {
  const product = price.product;
  const productMetadata = typeof product === "string" || product.deleted ? undefined : (product.metadata as StripePlanMetadata);
  const priceMetadata = price.metadata as StripePlanMetadata;

  const candidate = priceMetadata?.plan_code ?? productMetadata?.plan_code ?? null;

  if (!candidate) {
    return null;
  }

  const normalized = candidate.trim().toLowerCase();
  if (normalized === "starter") return "pro";
  if (normalized === "growth") return "premium";
  return normalized === "pro" || normalized === "premium" ? normalized : null;
}

export async function syncStripePlans(): Promise<PlanSyncResult> {
  const stripe = getStripeClient();

  const pricesResponse = await stripe.prices.list({
    active: true,
    limit: 100,
    expand: ["data.product"],
  });

  const updatedPlanCodes = new Set<string>();
  const missingStripePrices: string[] = [];

  for (const price of pricesResponse.data) {
    if (!price.active || !price.unit_amount) {
      continue;
    }

    const planCode = resolvePlanCode(price);
    if (!planCode) {
      missingStripePrices.push(price.id);
      continue;
    }

    const canonical = PRODUCT_PLAN_BY_CODE[planCode];
    if (
      price.unit_amount !== canonical.priceEurCents ||
      price.currency.toLowerCase() !== "eur" ||
      price.recurring?.interval !== "month"
    ) {
      missingStripePrices.push(price.id);
      continue;
    }

    const athleteLimit = canonical.athleteLimit;
    const priceAmount = canonical.priceEurCents;
    const currency = (price.currency ?? "eur").toLowerCase();
    const billingInterval = price.recurring?.interval ?? null;
    const nickname = canonical.publicName;
    const productId = typeof price.product === "string" ? price.product : price.product.id;

    await db
      .insert(plans)
      .values({
        code: planCode,
        athleteLimit,
        academyLimit: canonical.academyLimit,
        priceEur: priceAmount,
        stripePriceId: price.id,
        stripeProductId: productId,
        currency,
        billingInterval,
        nickname,
        isArchived: false,
      })
      .onConflictDoUpdate({
        target: plans.code,
        set: {
          athleteLimit,
          academyLimit: canonical.academyLimit,
          priceEur: priceAmount,
          stripePriceId: price.id,
          stripeProductId: productId,
          currency,
          billingInterval,
          nickname,
          isArchived: false,
        },
      });

    updatedPlanCodes.add(planCode);
  }

  return {
    updatedPlanCodes: Array.from(updatedPlanCodes),
    archivedPlanCodes: [],
    missingStripePrices,
  };
}
