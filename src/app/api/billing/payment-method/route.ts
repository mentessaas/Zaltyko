import { apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/product/features";

// Handler for POST - separated to apply rate limiting
const updatePaymentMethodHandler = withTenant(async (req, context) => {
    try {
        if (!isFeatureEnabled("paymentMethods")) {
            return apiError("FEATURE_DISABLED", "Métodos de pago no disponibles en esta versión", 404);
        }

        const { userId } = context;

        const body = await req.json();
        const { payment_method } = body;

        if (!payment_method) {
            return apiError("MISSING_PAYMENT_METHOD", "Payment method is required", 400);
        }

        // Get user's subscription to find Stripe customer ID
        const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        if (!subscription) {
            return apiError("NOT_FOUND", "No subscription found", 404);
        }

        // TODO: Integrate with Stripe to update payment method
        // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
        // await stripe.paymentMethods.attach(payment_method, {
        //     customer: subscription.stripeCustomerId,
        // });
        // await stripe.customers.update(subscription.stripeCustomerId, {
        //     invoice_settings: {
        //         default_payment_method: payment_method,
        //     },
        // });

        return apiError("FEATURE_DISABLED", "Métodos de pago no disponibles en esta versión", 404);
    } catch (error) {
        logger.error("Error updating payment method:", error);
        return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
});

// Rate-limited POST handler: 10 requests per minute
export const POST = withRateLimit(
    async (request) => {
        return (await updatePaymentMethodHandler(request, {} as any)) as NextResponse;
    },
    { identifier: getUserIdentifier, limit: 10, window: 60 }
);

// Handler for GET - separated to apply rate limiting
const getPaymentMethodHandler = withTenant(async (req, context) => {
    try {
        if (!isFeatureEnabled("paymentMethods")) {
            return apiError("FEATURE_DISABLED", "Métodos de pago no disponibles en esta versión", 404);
        }

        const { userId } = context;

        const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        if (!subscription) {
            return apiError("NOT_FOUND", "No subscription found", 404);
        }

        return apiError("FEATURE_DISABLED", "Métodos de pago no disponibles en esta versión", 404);
    } catch (error) {
        logger.error("Error fetching payment method:", error);
        return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
});

// Rate-limited GET handler: 100 requests per minute
export const GET = withRateLimit(
    async (request) => {
        return (await getPaymentMethodHandler(request, {} as any)) as NextResponse;
    },
    { identifier: getUserIdentifier, limit: 100, window: 60 }
);
