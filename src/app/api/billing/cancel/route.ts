import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Handler for POST - separated to apply rate limiting
const cancelHandler = withTenant(async (req, context) => {
    try {
        const { userId } = context;

        const body = await req.json();
        const { reason: _reason } = body;

        // Get current subscription
        const [currentSubscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        if (!currentSubscription) {
            return apiError("NOT_FOUND", "No active subscription found", 404);
        }

        // TODO: Integrate with Stripe to cancel subscription
        // await stripe.subscriptions.cancel(currentSubscription.stripeSubscriptionId);

        // Mark subscription for cancellation at period end
        await db
            .update(subscriptions)
            .set({
                status: "canceling",
                cancelAtPeriodEnd: true,
                updatedAt: new Date(),
            })
            .where(eq(subscriptions.id, currentSubscription.id));

        // Note: In this application, plan information is managed through subscriptions
        // Academy-level data doesn't store plan information directly

        return apiSuccess({ status: "canceled", message: "Subscription canceled successfully" });
    } catch (error) {
        logger.error("Error canceling subscription:", error);
        return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
});

// Rate-limited POST handler: 10 requests per minute
export const POST = withRateLimit(
    async (request) => {
        return (await cancelHandler(request, {} as any)) as NextResponse;
    },
    { identifier: getUserIdentifier, limit: 10, window: 60 }
);
