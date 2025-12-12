import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allPlans = await db
      .select({
        id: plans.id,
        code: plans.code,
        nickname: plans.nickname,
        priceEur: plans.priceEur,
        athleteLimit: plans.athleteLimit,
        currency: plans.currency,
        billingInterval: plans.billingInterval,
      })
      .from(plans)
      .where(eq(plans.isArchived, false))
      .orderBy(asc(plans.priceEur));

    return NextResponse.json({ plans: allPlans });
  } catch (error) {
    console.error("Error fetching plans:", error);
    return NextResponse.json({ error: "Failed to fetch plans", plans: [] }, { status: 500 });
  }
}

