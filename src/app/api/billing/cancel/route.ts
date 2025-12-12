import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { subscriptions, academies } from "@/db/schema";
import { eq } from "drizzle-orm";

export const POST = withTenant(async (req, context) => {
    try {
        const { userId, tenantId } = context;

        const body = await req.json();
        const { reason } = body;

        // Get current subscription
        const [currentSubscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        if (!currentSubscription) {
            return new NextResponse("No active subscription found", { status: 404 });
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

        return NextResponse.json({
            success: true,
            status: "canceled",
            message: "Subscription canceled successfully",
        });
    } catch (error) {
        console.error("Error canceling subscription:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
});
