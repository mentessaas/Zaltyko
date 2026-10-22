import { eq, or } from "drizzle-orm";

import { db } from "@/db";
import { plans } from "@/db/schema";

/**
 * Obtiene el ID de un plan por su Stripe Price ID o código de plan
 */
export async function getPlanIdByStripePrice(
  priceId?: string | null,
  planCode?: string | null
): Promise<string | null> {
  if (!priceId && !planCode) {
    return null;
  }

  if (priceId) {
    const [planByPrice] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(or(eq(plans.stripePriceId, priceId), eq(plans.stripeAnnualPriceId, priceId)))
      .limit(1);
    
    if (planByPrice) {
      return planByPrice.id;
    }
  }

  if (planCode) {
    const [planByCode] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.code, planCode))
      .limit(1);
    
    if (planByCode) {
      return planByCode.id;
    }
  }

  return null;
}
