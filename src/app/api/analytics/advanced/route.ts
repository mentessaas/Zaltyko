export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { subscriptions, plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiError } from "@/lib/api-response";
import { isFeatureEnabled } from "@/lib/product/features";

export const GET = withTenant(async (req, context) => {
    try {
        if (!isFeatureEnabled("advancedAnalytics")) {
            return apiError(
                "FEATURE_DISABLED",
                "La analítica avanzada todavía no está activada para esta versión.",
                403
            );
        }

        const { userId } = context;

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

        return apiError(
            "FEATURE_NOT_READY",
            "La analítica avanzada requiere activar el módulo antes de exponer datos.",
            501
        );
    } catch (error) {
        logger.error("Error fetching advanced analytics:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
});
