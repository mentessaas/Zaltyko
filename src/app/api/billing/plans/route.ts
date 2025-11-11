import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { withTenant } from "@/lib/authz";

export const GET = withTenant(async () => {
  const items = await db
    .select({
      code: plans.code,
      nickname: plans.nickname,
      priceEur: plans.priceEur,
      currency: plans.currency,
      billingInterval: plans.billingInterval,
      athleteLimit: plans.athleteLimit,
      stripePriceId: plans.stripePriceId,
      isArchived: plans.isArchived,
    })
    .from(plans)
    .where(eq(plans.isArchived, false))
    .orderBy(asc(plans.priceEur));

  return NextResponse.json(items);
});


