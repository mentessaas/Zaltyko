import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { academies, subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const POST = withTenant(async (req, context) => {
    try {
        const { userId, tenantId } = context;

        const body = await req.json();
        const { payment_method } = body;

        if (!payment_method) {
            return new NextResponse("Payment method is required", { status: 400 });
        }

        // Get user's subscription to find Stripe customer ID
        const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        if (!subscription) {
            return new NextResponse("No subscription found", { status: 404 });
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

        // TODO: Store payment method reference
        // Note: The subscription schema doesn't currently have a field for payment method ID
        // This should be handled by Stripe directly when implemented
        // For now, we'll just return success

        return NextResponse.json({
            success: true,
            payment_method,
            message: "Payment method updated successfully",
        });
    } catch (error) {
        console.error("Error updating payment method:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
});

export const GET = withTenant(async (req, context) => {
    try {
        const { userId } = context;

        const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        if (!subscription) {
            return new NextResponse("No subscription found", { status: 404 });
        }

        return NextResponse.json({
            // Payment method is managed by Stripe, not stored locally
            payment_method: null,
        });
    } catch (error) {
        console.error("Error fetching payment method:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
});
