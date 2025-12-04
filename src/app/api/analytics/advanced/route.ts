import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { subscriptions, plans } from "@/db/schema";
import { eq } from "drizzle-orm";

export const GET = withTenant(async (req, context) => {
    try {
        const { userId, tenantId, profile } = context;

        // Check plan eligibility for advanced analytics
        const [subscription] = await db
            .select({
                planCode: plans.code,
            })
            .from(subscriptions)
            .leftJoin(plans, eq(subscriptions.planId, plans.id))
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        const currentPlan = subscription?.planCode || "free";

        // Advanced analytics is only available for Pro and Premium plans
        if (currentPlan === "free") {
            return NextResponse.json(
                {
                    error: "Advanced analytics is a premium feature",
                    required_plan: "pro",
                    current_plan: currentPlan,
                },
                { status: 403 }
            );
        }

        // TODO: Implement actual advanced analytics logic
        // For now, return mock data structure
        const analytics = {
            revenue: {
                total: 0,
                monthly: 0,
                growth: 0,
            },
            attendance: {
                average: 0,
                trends: [],
            },
            retention: {
                rate: 0,
                churnRate: 0,
            },
            performance: {
                topClasses: [],
                topCoaches: [],
            },
        };

        return NextResponse.json(analytics);
    } catch (error) {
        console.error("Error fetching advanced analytics:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
});
