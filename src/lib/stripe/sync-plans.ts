import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import Stripe from "stripe";

import { db } from "@/db";
import { plans } from "@/db/schema";

import { getStripeClient } from "./client";

export interface PlanSyncResult {
  updatedPlanCodes: string[];
  archivedPlanCodes: string[];
  missingStripePrices: string[];
}

interface StripePlanMetadata {
  plan_code?: string;
  athlete_limit?: string;
}

function resolvePlanCode(price: Stripe.Price): string | null {
  const product = price.product;
  const productMetadata = typeof product === "string" || product.deleted ? undefined : (product.metadata as StripePlanMetadata);
  const priceMetadata = price.metadata as StripePlanMetadata;

  const candidate =
    priceMetadata?.plan_code ??
    productMetadata?.plan_code ??
    (price.nickname ? price.nickname.toLowerCase().replace(/\s+/g, "_") : null);

  if (!candidate) {
    return null;
  }

  return candidate.trim();
}

function parseAthleteLimit(price: Stripe.Price, fallback: number | null): number | null {
  const metadata = price.metadata as StripePlanMetadata;
  const value = metadata?.athlete_limit;

  if (!value) {
    return fallback ?? null;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback ?? null;
  }

  return parsed;
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

    const [existing] = await db
      .select({
        id: plans.id,
        athleteLimit: plans.athleteLimit,
        priceEur: plans.priceEur,
      })
      .from(plans)
      .where(eq(plans.code, planCode))
      .limit(1);

    const athleteLimit = parseAthleteLimit(price, existing?.athleteLimit ?? null);
    const priceAmount = price.unit_amount ?? existing?.priceEur ?? 0;
    const currency = (price.currency ?? "eur").toLowerCase();
    const billingInterval = price.recurring?.interval ?? null;
    const nickname =
      price.nickname ??
      (typeof price.product !== "string" && !price.product.deleted ? price.product.name : null) ??
      planCode.toUpperCase();
    const productId = typeof price.product === "string" ? price.product : price.product.id;

    await db
      .insert(plans)
      .values({
        code: planCode,
        athleteLimit,
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

  let archivedPlanCodes: string[] = [];

  if (updatedPlanCodes.size > 0) {
    const plansToArchive = await db
      .select({ code: plans.code })
      .from(plans)
      .where(
        and(
          isNotNull(plans.stripePriceId),
          notInArray(plans.code, Array.from(updatedPlanCodes))
        )
      );

    if (plansToArchive.length > 0) {
      archivedPlanCodes = plansToArchive.map((row) => row.code);

      await db
        .update(plans)
        .set({ isArchived: true })
        .where(inArray(plans.code, archivedPlanCodes));
    }
  }

  return {
    updatedPlanCodes: Array.from(updatedPlanCodes),
    archivedPlanCodes,
    missingStripePrices,
  };
}


