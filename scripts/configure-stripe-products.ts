/* eslint-disable no-console */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";
import { getStripeClient } from "@/lib/stripe/client";
import type { PlanCode } from "@/types/billing";

config({ path: ".env.local" });
config({ path: ".env" });

const shouldApply = process.argv.includes("--apply");
const PAID_CODES: PlanCode[] = ["pro", "premium"];

async function main() {
  const stripe = getStripeClient();
  console.log(`Stripe product configuration (${shouldApply ? "APPLY" : "DRY-RUN"})`);
  console.log("================================================");

  for (const code of PAID_CODES) {
    const canonical = PRODUCT_PLAN_BY_CODE[code];
    const [plan] = await db
      .select({
        stripePriceId: plans.stripePriceId,
        stripeAnnualPriceId: plans.stripeAnnualPriceId,
      })
      .from(plans)
      .where(eq(plans.code, code))
      .limit(1);
    if (!plan?.stripePriceId) throw new Error(`${code}: Stripe Price ID missing`);

    const price = await stripe.prices.retrieve(plan.stripePriceId, { expand: ["product"] });
    if (
      !price.active ||
      price.unit_amount !== canonical.priceEurCents ||
      price.currency !== "eur" ||
      price.recurring?.interval !== "month"
    ) {
      throw new Error(`${code}: Stripe price does not match the canonical monthly EUR contract`);
    }

    const product = typeof price.product === "string" ? await stripe.products.retrieve(price.product) : price.product;
    if (product.deleted) throw new Error(`${code}: Stripe product is deleted`);
    const desiredName = `Zaltyko ${canonical.publicName}`;
    console.log(
      `${code}: ${product.name} -> ${desiredName}; metadata plan_code=${
        price.metadata.plan_code ?? product.metadata.plan_code ?? "missing"
      }`
    );

    let annualPrice: Stripe.Price | null = null;
    if (plan.stripeAnnualPriceId) {
      annualPrice = await stripe.prices.retrieve(plan.stripeAnnualPriceId, { expand: ["product"] });
      if (
        !annualPrice.active ||
        annualPrice.unit_amount !== canonical.annualPriceEurCents ||
        annualPrice.currency !== "eur" ||
        annualPrice.recurring?.interval !== "year"
      ) {
        throw new Error(`${code}: Stripe price does not match the canonical annual EUR contract`);
      }
      console.log(`${code}: annual price ${annualPrice.id} -> ${canonical.annualPriceEurCents} cents/year`);
    } else {
      console.warn(`${code}: annual Stripe Price missing; annual checkout remains disabled`);
    }

    if (!shouldApply) continue;
    await stripe.products.update(product.id, {
      name: desiredName,
      metadata: { ...product.metadata, plan_code: code, public_name: canonical.publicName },
    });
    await stripe.prices.update(price.id, {
      nickname: canonical.publicName,
      metadata: { ...price.metadata, plan_code: code, public_name: canonical.publicName },
    });
    if (annualPrice) {
      await stripe.prices.update(annualPrice.id, {
        nickname: `${canonical.publicName} anual`,
        metadata: {
          ...annualPrice.metadata,
          plan_code: code,
          public_name: canonical.publicName,
          billing_interval: "year",
        },
      });
    }
  }

  console.log(shouldApply ? "Stripe products configured." : "Dry-run complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
