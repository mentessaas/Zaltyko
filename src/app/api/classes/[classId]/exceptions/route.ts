import { apiSuccess, apiError } from "@/lib/api-response";
import { db } from "@/db";
import { classExceptions } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { withTenant, TenantContext } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { authorizeClassResource } from "@/lib/authz/resource-scope";

const ExceptionBodySchema = z.object({
    exceptionDate: z.string().min(1),
    reason: z.string().max(500).nullable().optional(),
    exceptionType: z.enum(["holiday", "cancelled", "rescheduled"]).default("holiday"),
});

/**
 * GET /api/classes/[classId]/exceptions
 * Obtiene todas las excepciones de una clase
 */
/**
 * @swagger
 * /api/classes/{classId}/exceptions:
 *   get:
 *     summary: Obtiene las excepciones de una clase
 *     description: Retorna todas las fechas de excepción configuradas para una clase (festivos, vacaciones, etc.)
 *     tags:
 *       - Classes
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la clase
 *     responses:
 *       200:
 *         description: Lista de excepciones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exceptions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       exceptionDate:
 *                         type: string
 *                         format: date
 *                       reason:
 *                         type: string
 *                       exceptionType:
 *                         type: string
 */
async function getExceptions(
    request: Request,
    context: TenantContext<{ params: { classId: string } }>
) {
    const { params } = context;
    try {
        const classId = params.classId;
        const scope = await authorizeClassResource({ context, classId });
        if (!scope.allowed) return apiError("CLASS_NOT_FOUND", "Class not found", 404);

        const exceptions = await db
            .select()
            .from(classExceptions)
            .where(and(
                eq(classExceptions.classId, classId),
                eq(classExceptions.tenantId, scope.resource!.tenantId)
            ))
            .orderBy(asc(classExceptions.exceptionDate));

        return apiSuccess({ exceptions });
    } catch (error) {
        logger.error("Error fetching class exceptions:", error);
        return apiError("FETCH_EXCEPTIONS_FAILED", "Error fetching exceptions", 500);
    }
}

/**
 * POST /api/classes/[classId]/exceptions
 * Crea una nueva excepción
 */
async function createException(
    request: Request,
    context: TenantContext<{ params: { classId: string } }>
) {
    const { params } = context;
    try {
        const classId = params.classId;
        const parsed = ExceptionBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid exception", 400, parsed.error.flatten());
        const scope = await authorizeClassResource({ context, classId });
        if (!scope.allowed) return apiError("CLASS_NOT_FOUND", "Class not found", 404);
        const { exceptionDate, reason, exceptionType } = parsed.data;

        const newException = await db
            .insert(classExceptions)
            .values({
                classId,
                exceptionDate,
                reason,
                exceptionType,
                tenantId: scope.resource!.tenantId,
            })
            .returning();

        return apiSuccess({ exception: newException[0] });
    } catch (error) {
        logger.error("Error creating class exception:", error);
        return apiError("CREATE_EXCEPTION_FAILED", "Error creating exception", 500);
    }
}

export const GET = withTenant(getExceptions);
export const POST = withTenant(createException);
