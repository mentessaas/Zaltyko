import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { subscriptions, plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/stripe/client";
import { calculateProration } from "@/lib/billing/proration";

// Handler for POST - separated to apply rate limiting
const upgradeHandler = withTenant(async (req, context) => {
    try {
        const { userId } = context;

        const body = await req.json();
        const { targetPlan } = body;

        if (!targetPlan) {
            return apiError("MISSING_TARGET_PLAN", "Missing target plan", 400);
        }

        // Obtener suscripción actual (incluyendo campos de Stripe)
        const [currentSubscription] = await db
            .select({
                id: subscriptions.id,
                planId: subscriptions.planId,
                currentPeriodEnd: subscriptions.currentPeriodEnd,
                planCode: plans.code,
                stripeCustomerId: subscriptions.stripeCustomerId,
                stripeSubscriptionId: subscriptions.stripeSubscriptionId,
            })
            .from(subscriptions)
            .leftJoin(plans, eq(subscriptions.planId, plans.id))
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        // Obtener detalles del nuevo plan
        const [newPlanDetails] = await db
            .select()
            .from(plans)
            .where(eq(plans.code, targetPlan))
            .limit(1);

        if (!newPlanDetails) {
            return apiError("NOT_FOUND", "Target plan not found", 404);
        }

        // Calcular prorrateo
        const now = new Date();
        const cycleEndDate = currentSubscription?.currentPeriodEnd || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const proration = calculateProration(
            currentSubscription?.planCode || "free",
            targetPlan,
            now,
            cycleEndDate
        );

        // Integrar con Stripe para realizar el upgrade
        if (!currentSubscription?.stripeSubscriptionId || !newPlanDetails.stripePriceId) {
            return apiError("STRIPE_NOT_CONFIGURED", "Stripe subscription not configured for this user", 400);
        }

        const stripe = getStripeClient();

        try {
            // Get current subscription item ID from Stripe
            const stripeSub = await stripe.subscriptions.retrieve(currentSubscription.stripeSubscriptionId);
            const subscriptionItemId = stripeSub.items.data[0]?.id;
            if (!subscriptionItemId) {
                return apiError("STRIPE_ERROR", "Could not find subscription item in Stripe", 500);
            }

            // Update subscription with proration - Stripe will automatically calculate and charge the proration
            await stripe.subscriptions.update(currentSubscription.stripeSubscriptionId, {
                items: [{ id: subscriptionItemId, price: newPlanDetails.stripePriceId }],
                proration_behavior: "create_prorations",
                billing_cycle_anchor: "now",
            });
        } catch (stripeError) {
            logger.error("Stripe error during upgrade:", stripeError);
            return apiError("STRIPE_ERROR", "Failed to process upgrade in Stripe", 500);
        }

        // Actualizar suscripción en DB
        if (currentSubscription) {
            await db
                .update(subscriptions)
                .set({
                    planId: newPlanDetails.id,
                    status: "active",
                    updatedAt: new Date(),
                })
                .where(eq(subscriptions.id, currentSubscription.id));
        } else {
            // Crear nueva suscripción si no existe
            await db.insert(subscriptions).values({
                userId: userId,
                planId: newPlanDetails.id,
                status: "active",
                currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            });
        }

        return apiSuccess({ message: `Plan upgraded to ${targetPlan}`, proration });
    } catch (error) {
        logger.error("Error upgrading plan:", error);
        return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
});

// Rate-limited POST handler: 10 requests per minute
export const POST = withRateLimit(
    async (request) => {
        return (await upgradeHandler(request, {} as any)) as NextResponse;
    },
    { identifier: getUserIdentifier, limit: 10, window: 60 }
);
