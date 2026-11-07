export const dynamic = 'force-dynamic';

import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { classSessions, classes } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { withTransaction } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";
import { handleApiError } from "@/lib/api-error-handler";

/**
 * POST /api/quick-actions/create-class
 * Crea una sesión de clase rápidamente con valores pre-rellenados
 */
export const POST = withTenant(async (req, context) => {
    try {
        const { tenantId } = context;
        const body = await req.json();

        const { classId, academyId, date, startTime, endTime } = body;

        if (!z.guid().safeParse(classId).success || !z.guid().safeParse(academyId).success) {
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

        const newSession = await withTransaction(async (tx) => {
            await lockAcademyOperationalWrites(tx, academyId);
            await assertAcademyOperationalWritable(tenantId!, academyId, tx);

            // Releer bajo el mismo bloqueo para no escribir en una clase cambiada o archivada.
            const [classData] = await tx
                .select({ id: classes.id, startTime: classes.startTime, endTime: classes.endTime })
                .from(classes)
                .where(and(
                    eq(classes.id, classId),
                    eq(classes.tenantId, tenantId!),
                    eq(classes.academyId, academyId),
                    isNull(classes.deletedAt),
                ))
                .limit(1);

            if (!classData) return null;

            const sessionDate = date || new Date().toISOString().split("T")[0];
            const finalStartTime = startTime || classData.startTime || "10:00";
            const finalEndTime = endTime || classData.endTime || "11:00";

            const [createdSession] = await tx
                .insert(classSessions)
                .values({
                    tenantId: tenantId!,
                    classId,
                    sessionDate,
                    startTime: finalStartTime,
                    endTime: finalEndTime,
                    status: "scheduled",
                })
                .returning();

            return createdSession ?? null;
        });

        if (!newSession) return apiError("NOT_FOUND", "Clase no encontrada", 404);

        return apiSuccess({ success: true, data: newSession });
    } catch (error) {
        logger.error("Error creating quick class:", error);
        return handleApiError(error, { endpoint: "/api/quick-actions/create-class", method: "POST" });
    }
});
