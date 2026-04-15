import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { subscriptions, plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/stripe/client";

// Handler for POST - separated to apply rate limiting
const downgradeHandler = withTenant(async (req, context) => {
    try {
        const { userId } = context;

        const body = await req.json();
        const { targetPlan } = body;

        if (!targetPlan) {
            return apiError("MISSING_TARGET_PLAN", "Missing target plan", 400);
        }

        // Obtener suscripción actual
        const [currentSubscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        if (!currentSubscription) {
            return apiError("NOT_FOUND", "No active subscription found", 404);
        }

        // Obtener detalles del nuevo plan
        const [newPlanDetails] = await db
            .select()
            .from(plans)
            .where(eq(plans.code, targetPlan))
            .limit(1);

        if (!newPlanDetails) {
            return apiError("NOT_FOUND", "Target plan not found", 404);
        }

        // Integrar con Stripe
        if (!currentSubscription.stripeSubscriptionId) {
            return apiError("STRIPE_NOT_CONFIGURED", "Stripe subscription not configured", 400);
        }

        const stripe = getStripeClient();

        if (targetPlan === "free") {
            // Schedule cancellation at period end
            await stripe.subscriptions.update(currentSubscription.stripeSubscriptionId, {
                cancel_at_period_end: true,
            });

            await db
                .update(subscriptions)
                .set({
                    cancelAtPeriodEnd: true,
                    updatedAt: new Date(),
                })
                .where(eq(subscriptions.id, currentSubscription.id));
        } else {
            // Downgrade a otro plan de pago - programar cambio al final del periodo
            await stripe.subscriptions.update(currentSubscription.stripeSubscriptionId, {
                items: [{
                    id: currentSubscription.stripeSubscriptionId,
                    price: newPlanDetails.stripePriceId || "",
                }],
                cancel_at_period_end: false,
                proration_behavior: "create_prorations",
                billing_cycle_anchor: "unchanged",
            });

            await db
                .update(subscriptions)
                .set({
                    planId: newPlanDetails.id,
                    updatedAt: new Date(),
                })
                .where(eq(subscriptions.id, currentSubscription.id));
        }

        return apiSuccess({ message: `Plan downgrade to ${targetPlan} processed` });
    } catch (error) {
        logger.error("Error downgrading plan:", error);
        return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
});

// Rate-limited POST handler: 10 requests per minute
export const POST = withRateLimit(
    async (request) => {
        return (await downgradeHandler(request, {} as any)) as NextResponse;
    },
    { identifier: getUserIdentifier, limit: 10, window: 60 }
);

// Handler for DELETE - cancel scheduled downgrade
const cancelDowngradeHandler = withTenant(async (req, context) => {
    try {
        const { userId } = context;

        // Get current subscription
        const [currentSubscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        if (!currentSubscription) {
            return apiError("NOT_FOUND", "No active subscription found", 404);
        }

        if (!currentSubscription.cancelAtPeriodEnd) {
            return apiError("NO_SCHEDULED_DOWNGRADE", "No scheduled downgrade found", 400);
        }

        // Cancel scheduled downgrade in Stripe
        if (currentSubscription.stripeSubscriptionId) {
            const stripe = getStripeClient();
            await stripe.subscriptions.update(currentSubscription.stripeSubscriptionId, {
                cancel_at_period_end: false,
            });
        }

        // Remove the scheduled downgrade
        await db
            .update(subscriptions)
            .set({
                cancelAtPeriodEnd: false,
                updatedAt: new Date(),
            })
            .where(eq(subscriptions.id, currentSubscription.id));

        return apiSuccess({ cancelled: true, message: "Scheduled downgrade has been cancelled" });
    } catch (error) {
        logger.error("Error cancelling downgrade:", error);
        return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
});

// Rate-limited DELETE handler: 5 requests per minute
export const DELETE = withRateLimit(
    async (request) => {
        return (await cancelDowngradeHandler(request, {} as any)) as NextResponse;
    },
    { identifier: getUserIdentifier, limit: 5, window: 60 }
);
