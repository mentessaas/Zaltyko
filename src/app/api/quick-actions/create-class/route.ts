export const dynamic = 'force-dynamic';

import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { db } from "@/db";
import { classSessions, classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { z } from "zod";

/**
 * POST /api/quick-actions/create-class
 * Crea una sesión de clase rápidamente con valores pre-rellenados
 */
export const POST = withTenant(async (req, context) => {
    try {
        const { tenantId } = context;
        const body = await req.json();

        const { classId, academyId, date, startTime, endTime } = body;

        if (!z.string().uuid().safeParse(classId).success || !z.string().uuid().safeParse(academyId).success) {
            return apiError("VALIDATION_ERROR", "classId y academyId válidos son requeridos", 400);
        }
        const academyScope = await authorizeAcademyCapability({
            context,
            resourceTenantId: tenantId,
            academyId,
            permission: "classes:schedule",
        });
        if (!academyScope.allowed) {
            return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
        }

        // Verificar que la clase existe y pertenece al tenant
        const [classData] = await db
            .select()
            .from(classes)
            .where(eq(classes.id, classId))
            .limit(1);

        if (!classData || classData.tenantId !== tenantId || classData.academyId !== academyId || classData.deletedAt) {
            return apiError("NOT_FOUND", "Clase no encontrada", 404);
        }

        // Usar fecha de hoy si no se especifica
        const sessionDate = date || new Date().toISOString().split("T")[0];

        // Usar horarios de la clase si no se especifican
        const finalStartTime = startTime || classData.startTime || "10:00";
        const finalEndTime = endTime || classData.endTime || "11:00";

        // Crear la sesión
        const [newSession] = await db
            .insert(classSessions)
            .values({
                tenantId,
                classId,
                sessionDate,
                startTime: finalStartTime,
                endTime: finalEndTime,
                status: "scheduled",
            })
            .returning();

        return apiSuccess({ success: true, data: newSession });
    } catch (error) {
        logger.error("Error creating quick class:", error);
        return apiError("INTERNAL_ERROR", "Error al crear la sesión", 500);
    }
});
