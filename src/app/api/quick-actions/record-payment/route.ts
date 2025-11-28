import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { charges } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/quick-actions/record-payment
 * Registra un pago rápidamente
 */
export const POST = withTenant(async (req, context) => {
    try {
        const { tenantId } = context;
        const body = await req.json();

        const { chargeId, amountCents, paymentMethod = "cash" } = body;

        if (!chargeId) {
            return NextResponse.json(
                { error: "chargeId is required" },
                { status: 400 }
            );
        }

        // Verificar que el cargo existe
        const [charge] = await db
            .select()
            .from(charges)
            .where(eq(charges.id, chargeId))
            .limit(1);

        if (!charge || charge.tenantId !== tenantId) {
            return NextResponse.json(
                { error: "Charge not found" },
                { status: 404 }
            );
        }

        // Actualizar el cargo como pagado
        const [updatedCharge] = await db
            .update(charges)
            .set({
                status: "paid",
                paidAt: new Date(),
                paymentMethod,
            })
            .where(eq(charges.id, chargeId))
            .returning();

        return NextResponse.json({
            success: true,
            data: updatedCharge,
        });
    } catch (error) {
        console.error("Error recording payment:", error);
        return NextResponse.json(
            { error: "Failed to record payment" },
            { status: 500 }
        );
    }
});
