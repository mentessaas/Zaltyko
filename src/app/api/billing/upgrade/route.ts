import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { subscriptions, plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { calculateProration } from "@/lib/billing/proration";

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
            .select({
                id: subscriptions.id,
                planId: subscriptions.planId,
                currentPeriodEnd: subscriptions.currentPeriodEnd,
                planCode: plans.code,
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
            return new NextResponse("Target plan not found", { status: 404 });
        }

        // Calcular prorrateo (simulado)
        const now = new Date();
        const cycleEndDate = currentSubscription?.currentPeriodEnd || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const proration = calculateProration(
            currentSubscription?.planCode || "free",
            targetPlan,
            now, // Simplificado: asumimos inicio de ciclo hoy para el cálculo si no hay datos
            cycleEndDate
        );

        // TODO: Integrar con Stripe para realizar el cobro del monto prorrateado
        // const stripeCharge = await stripe.charges.create({...});

        // Actualizar suscripción en DB
        if (currentSubscription) {
            await db
                .update(subscriptions)
                .set({
                    planId: newPlanDetails.id,
                    status: "active",
                    updatedAt: new Date(),
                    // En un caso real, Stripe actualizaría el currentPeriodEnd
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

        return NextResponse.json({
            success: true,
            message: `Plan upgraded to ${targetPlan}`,
            proration,
        });
    } catch (error) {
        console.error("Error upgrading plan:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
});
