import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { subscriptions, plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/stripe/client";
import { PLAN_PRICES } from "@/lib/billing/proration";

const PRICE_MAP: Record<string, string | undefined> = {
    pro: process.env.STRIPE_PRICE_PRO,
    premium: process.env.STRIPE_PRICE_PREMIUM,
};

const PLAN_DETAILS = {
    pro: { price: 19, name: "Zaltyko Pro" },
    premium: { price: 49, name: "Zaltyko Premium" },
};

const handler = withTenant(async (req, context) => {
    try {
        const { userId } = context;

        const body = await req.json();
        const { plan } = body;

        if (!plan || !PLAN_DETAILS[plan as keyof typeof PLAN_DETAILS]) {
            return apiError("INVALID_PLAN", "Invalid target plan", 400);
        }

        const stripe = getStripeClient();
        const planDetails = PLAN_DETAILS[plan as keyof typeof PLAN_DETAILS];

        // Get or create Stripe customer
        const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        let customerId: string;

        if (subscription?.stripeCustomerId) {
            customerId = subscription.stripeCustomerId;
        } else {
            return apiError("NO_CUSTOMER", "No Stripe customer found. Please contact support.", 400);
        }

        // Get price ID from env
        const priceId = PRICE_MAP[plan];
        if (!priceId) {
            logger.error("Missing STRIPE_PRICE_PRO or STRIPE_PRICE_PREMIUM env vars");
            return apiError("CONFIG_ERROR", "Payment configuration error", 500);
        }

        // Calculate proration
        const now = new Date();
        const periodEnd = subscription?.currentPeriodEnd || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const daysInPeriod = 30;
        const daysRemaining = Math.max(1, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        const currentPrice = subscription ? PLAN_PRICES["pro"] : 0; // simplified - check actual plan
        const creditPerDay = currentPrice / daysInPeriod;
        const credit = creditPerDay * daysRemaining;
        const costPerDay = planDetails.price / daysInPeriod;
        const cost = costPerDay * daysRemaining;
        const prorationAmount = Math.max(0, Math.round((cost - credit) * 100));

        // Create PaymentIntent for the proration amount (if positive)
        if (prorationAmount <= 0) {
            return apiSuccess({ clientSecret: null, message: "No payment required for upgrade" });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: prorationAmount, // already in cents
            currency: "eur",
            customer: customerId,
            metadata: {
                userId,
                plan,
                type: "upgrade_proration",
            },
        });

        return apiSuccess({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        logger.error("Error creating payment intent:", error);
        return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
});

export const POST = withRateLimit(
    async (request) => {
        return (await handler(request, {} as any)) as NextResponse;
    },
    { identifier: getUserIdentifier, limit: 10, window: 60 }
);
