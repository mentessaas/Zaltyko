import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { charges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

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
            return apiError("VALIDATION_ERROR", "chargeId es requerido", 400);
        }

        // Verificar que el cargo existe
        const [charge] = await db
            .select()
            .from(charges)
            .where(eq(charges.id, chargeId))
            .limit(1);

        if (!charge || charge.tenantId !== tenantId) {
            return apiError("NOT_FOUND", "Cargo no encontrado", 404);
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

        return apiSuccess({ success: true, data: updatedCharge });
    } catch (error) {
        logger.error("Error recording payment:", error);
        return apiError("INTERNAL_ERROR", "Error al registrar el pago", 500);
    }
});
