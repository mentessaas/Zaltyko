import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { subscriptions, plans } from "@/db/schema";
import { eq } from "drizzle-orm";

export const POST = withTenant(async (req, context) => {
    try {
        const { userId, profile } = context;

        const body = await req.json();
        const { targetPlan } = body;

        if (!targetPlan) {
            return new NextResponse("Missing target plan", { status: 400 });
        }

        // Obtener suscripción actual
        const [currentSubscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

        if (!currentSubscription) {
            return new NextResponse("No active subscription found", { status: 404 });
        }

        // Obtener detalles del nuevo plan
        const [newPlanDetails] = await db
            .select()
            .from(plans)
            .where(eq(plans.code, targetPlan))
            .limit(1);

        if (!newPlanDetails) {
            return new NextResponse("Target plan not found", { status: 404 });
        }

        // TODO: Integrar con Stripe para manejar el downgrade (generalmente al final del periodo)
        // await stripe.subscriptions.update(currentSubscription.stripeSubscriptionId, {
        //   cancel_at_period_end: true, // O programar cambio
        // });

        // Para este MVP, actualizamos directamente o marcamos para cancelación si es a free
        if (targetPlan === "free") {
            await db
                .update(subscriptions)
                .set({
                    cancelAtPeriodEnd: true,
                    updatedAt: new Date(),
                })
                .where(eq(subscriptions.id, currentSubscription.id));
        } else {
            // Downgrade a otro plan de pago (ej. Premium -> Pro)
            // Idealmente esto se programa, aquí lo hacemos inmediato para simplificar
            await db
                .update(subscriptions)
                .set({
                    planId: newPlanDetails.id,
                    updatedAt: new Date(),
                })
                .where(eq(subscriptions.id, currentSubscription.id));
        }

        return NextResponse.json({
            success: true,
            message: `Plan downgrade to ${targetPlan} processed`,
        });
    } catch (error) {
        console.error("Error downgrading plan:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
});
