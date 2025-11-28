import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classExceptions, classes } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { withTenant, TenantContext } from "@/lib/authz";
import { logger } from "@/lib/logger";

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

        const exceptions = await db
            .select()
            .from(classExceptions)
            .where(eq(classExceptions.classId, classId))
            .orderBy(asc(classExceptions.exceptionDate));

        return NextResponse.json({ exceptions });
    } catch (error) {
        logger.error("Error fetching class exceptions:", error);
        return NextResponse.json(
            { error: "Error fetching exceptions" },
            { status: 500 }
        );
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
        const body = await request.json();
        const { exceptionDate, reason, exceptionType = "holiday" } = body;

        if (!exceptionDate) {
            return NextResponse.json(
                { error: "Date is required" },
                { status: 400 }
            );
        }

        // Obtener tenantId de la clase (o del contexto si estuviera disponible, pero mejor consultar DB para seguridad)
        // Aquí asumimos que el middleware withTenant ya validó acceso al tenant, pero necesitamos el ID para insertar.
        // Una opción es consultar la clase.
        const [classInfo] = await db
            .select({ tenantId: classes.tenantId })
            .from(classes)
            .where(eq(classes.id, classId))
            .limit(1);

        if (!classInfo) {
            return NextResponse.json({ error: "Class not found" }, { status: 404 });
        }

        const newException = await db
            .insert(classExceptions)
            .values({
                classId,
                exceptionDate,
                reason,
                exceptionType,
                tenantId: classInfo.tenantId,
            })
            .returning();

        return NextResponse.json({ exception: newException[0] });
    } catch (error) {
        logger.error("Error creating class exception:", error);
        return NextResponse.json(
            { error: "Error creating exception" },
            { status: 500 }
        );
    }
}

export const GET = withTenant(getExceptions);
export const POST = withTenant(createException);
