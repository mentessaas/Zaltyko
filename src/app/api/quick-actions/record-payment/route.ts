import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { charges } from "@/db/schema";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";

const RecordPaymentSchema = z.object({
    chargeId: z.string().uuid(),
    academyId: z.string().uuid(),
    amountCents: z.number().int().positive(),
    paymentMethod: z.enum(["cash", "transfer", "bizum", "card_manual", "other"]),
    idempotencyKey: z.string().min(1).max(200).optional(),
}).strict();

/**
 * POST /api/quick-actions/record-payment
 * Registra un pago rápidamente
 */
export const POST = withTenant(async (req, context) => {
    try {
        const { tenantId } = context;
        const parsed = RecordPaymentSchema.safeParse(await req.json());
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Payload de pago no válido", 400, parsed.error.flatten());
        }
        const { chargeId, academyId, amountCents, paymentMethod } = parsed.data;
        const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() || parsed.data.idempotencyKey;
        void idempotencyKey;

        const access = await authorizeAcademyCapability({
            context,
            resourceTenantId: tenantId,
            academyId,
            permission: "billing:update",
        });
        if (!access.allowed) {
            return apiError(access.reason ?? "FORBIDDEN", "No autorizado para registrar pagos", 403);
        }

        // Mismo advisory lock que collectCharge: serializa contra una captura
        // automática de tarjeta en vuelo (evita doble pago efectivo+tarjeta).
        await db.execute(sql`select pg_advisory_xact_lock(hashtext(${chargeId}))`);

        // Verificar que el cargo existe
        const [charge] = await db
            .select({ id: charges.id, tenantId: charges.tenantId, academyId: charges.academyId, amountCents: charges.amountCents, status: charges.status })
            .from(charges)
            .where(and(eq(charges.id, chargeId), eq(charges.tenantId, tenantId), eq(charges.academyId, academyId)))
            .limit(1);

        if (!charge) {
            return apiError("NOT_FOUND", "Cargo no encontrado", 404);
        }

        if (charge.amountCents !== amountCents) {
            return apiError("AMOUNT_MISMATCH", "El importe debe coincidir con el cargo", 400);
        }

        if (["paid", "refunded", "cancelled"].includes(charge.status)) {
            return apiError("PAYMENT_ALREADY_RECORDED", "El cargo ya no admite otro pago", 409);
        }

        // Actualizar el cargo como pagado
        const [updatedCharge] = await db
            .update(charges)
            .set({
                status: "paid",
                paidAt: new Date(),
                paymentMethod,
            })
            .where(and(
                eq(charges.id, chargeId),
                eq(charges.tenantId, tenantId),
                eq(charges.academyId, academyId),
                isNull(charges.paidAt),
                ne(charges.status, "paid"),
                ne(charges.status, "refunded"),
                ne(charges.status, "cancelled"),
            ))
            .returning();

        if (!updatedCharge) {
            return apiError("PAYMENT_ALREADY_RECORDED", "El cargo fue actualizado por otra solicitud", 409);
        }

        return apiSuccess({ charge: updatedCharge });
    } catch (error) {
        logger.error("Error recording payment:", error);
        return apiError("INTERNAL_ERROR", "Error al registrar el pago", 500);
    }
});
