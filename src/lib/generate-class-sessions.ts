import { db } from "@/db";
import { classes, classSessions, classWeekdays, classExceptions } from "@/db/schema";
import { eq, and, gte, lte, isNull, or } from "drizzle-orm";
import { addDays, addWeeks, startOfDay, format, getDay } from "date-fns";
import { logger } from "@/lib/logger";
import { withTransaction } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";

/**
 * Genera sesiones de clase para las próximas N semanas
 * 
 * @param classId - ID de la clase para generar sesiones
 * @param weeksAhead - Número de semanas a generar (default: 4)
 * @returns Número de sesiones generadas
 */
export async function generateClassSessions(
    classId: string,
    weeksAhead: number = 4,
    tenantId?: string
): Promise<{ generated: number; skipped: number; errors: string[] }> {
    try {
        return await withTransaction(async (tx) => {
            const [initialClass] = await tx
                .select({ academyId: classes.academyId, tenantId: classes.tenantId })
                .from(classes)
                .where(and(
                    eq(classes.id, classId),
                    tenantId ? eq(classes.tenantId, tenantId) : undefined,
                    isNull(classes.deletedAt),
                ))
                .limit(1);

            if (!initialClass) throw new Error(`Clase ${classId} no encontrada`);

            await lockAcademyOperationalWrites(tx, initialClass.academyId);

            // Re-read after acquiring the academy lock so deletion or tenant
            // changes that committed while waiting cannot feed the generator.
            const [classData] = await tx
                .select()
                .from(classes)
                .where(and(
                    eq(classes.id, classId),
                    eq(classes.tenantId, initialClass.tenantId),
                    isNull(classes.deletedAt),
                ))
                .limit(1);

            if (!classData) throw new Error(`Clase ${classId} no encontrada`);

            if (!classData.autoGenerateSessions) {
                logger.warn(`Clase ${classId} no tiene auto-generación activada, saltando`);
                return { generated: 0, skipped: 0, errors: ["Auto-generación desactivada"] };
            }

            await assertAcademyOperationalWritable(classData.tenantId, classData.academyId, tx);

            const weekdays = await tx
                .select()
                .from(classWeekdays)
                .where(and(eq(classWeekdays.classId, classId), eq(classWeekdays.tenantId, classData.tenantId)))
                .limit(7);

            if (weekdays.length === 0) {
                throw new Error(`Clase ${classId} no tiene días de la semana configurados`);
            }

            const today = startOfDay(new Date());
            const endDate = addWeeks(today, weeksAhead);
            const exceptions = await tx
                .select()
                .from(classExceptions)
                .where(and(
                    eq(classExceptions.classId, classId),
                    eq(classExceptions.tenantId, classData.tenantId),
                    gte(classExceptions.exceptionDate, format(today, "yyyy-MM-dd")),
                    lte(classExceptions.exceptionDate, format(endDate, "yyyy-MM-dd")),
                ))
                .limit(400);
            const exceptionDates = new Set(
                exceptions.map((exception) => format(new Date(exception.exceptionDate), "yyyy-MM-dd"))
            );

            const existingSessions = await tx
                .select()
                .from(classSessions)
                .where(and(
                    eq(classSessions.classId, classId),
                    eq(classSessions.tenantId, classData.tenantId),
                    gte(classSessions.sessionDate, format(today, "yyyy-MM-dd")),
                    lte(classSessions.sessionDate, format(endDate, "yyyy-MM-dd")),
                ))
                .limit(400);
            const existingDates = new Set(
                existingSessions.map((session) => format(new Date(session.sessionDate), "yyyy-MM-dd"))
            );

            const sessionsToCreate: Array<{
                id: string;
                classId: string;
                sessionDate: string;
                startTime: string | null;
                endTime: string | null;
                status: "scheduled";
                tenantId: string;
                createdAt: Date;
                updatedAt: Date;
            }> = [];
            let skipped = 0;
            let currentDate = today;

            while (currentDate <= endDate) {
                const weekdayConfig = weekdays.find((weekday) => weekday.weekday === getDay(currentDate));
                const dateStr = format(currentDate, "yyyy-MM-dd");

                if (weekdayConfig) {
                    if (exceptionDates.has(dateStr) || existingDates.has(dateStr)) {
                        skipped++;
                    } else {
                        sessionsToCreate.push({
                            id: crypto.randomUUID(),
                            classId,
                            sessionDate: dateStr,
                            startTime: classData.startTime,
                            endTime: classData.endTime,
                            status: "scheduled",
                            tenantId: classData.tenantId,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        });
                    }
                }

                currentDate = addDays(currentDate, 1);
            }

            let generated = 0;
            if (sessionsToCreate.length > 0) {
                const inserted = await tx.insert(classSessions).values(sessionsToCreate).onConflictDoNothing({
                    target: [classSessions.classId, classSessions.sessionDate],
                }).returning({ id: classSessions.id });
                generated = inserted.length;
                logger.info(`Generadas ${generated} sesiones para clase ${classId}`);
            }

            return { generated, skipped, errors: [] };
        });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Error desconocido";
        logger.error(`Error generando sesiones para clase ${classId}:`, error);
        return { generated: 0, skipped: 0, errors: [errorMsg] };
    }
}

/**
 * Genera sesiones para todas las clases activas de un tenant
 */
export async function generateSessionsForTenant(
    tenantId: string,
    weeksAhead: number = 4
): Promise<{
    total_classes: number;
    total_generated: number;
    total_skipped: number;
    errors: Record<string, string[]>;
}> {
    try {
        // Obtener todas las clases con auto-generación activada del tenant
        const activeClasses = await db
            .select()
            .from(classes)
            .where(
                and(
                    eq(classes.tenantId, tenantId),
                    eq(classes.autoGenerateSessions, true)
                )
            )
            .limit(1000);

        let totalGenerated = 0;
        let totalSkipped = 0;
        const allErrors: Record<string, string[]> = {};

        // Generar sesiones para cada clase
        for (const classData of activeClasses) {
            const result = await generateClassSessions(classData.id, weeksAhead, tenantId);
            totalGenerated += result.generated;
            totalSkipped += result.skipped;

            if (result.errors.length > 0) {
                allErrors[classData.id] = result.errors;
            }
        }

        logger.info(
            `Generación completada para tenant ${tenantId}: ${totalGenerated} sesiones generadas, ${totalSkipped} saltadas`
        );

        return {
            total_classes: activeClasses.length,
            total_generated: totalGenerated,
            total_skipped: totalSkipped,
            errors: allErrors,
        };
    } catch (error) {
        logger.error(`Error generando sesiones para tenant ${tenantId}:`, error);
        throw error;
    }
}

/**
 * Genera sesiones para todos los tenants (usado por cron job)
 */
export async function generateSessionsForAllTenants(
    weeksAhead: number = 4
): Promise<{
    total_tenants: number;
    total_classes: number;
    total_generated: number;
    total_skipped: number;
    tenants_succeeded: number;
    tenants_failed: number;
    errors: Record<string, Record<string, string[]>>;
}> {
    try {
        // Obtener todos los tenants únicos con clases auto-generables
        const tenantsWithClasses = await db
            .selectDistinct({ tenantId: classes.tenantId })
            .from(classes)
            .where(eq(classes.autoGenerateSessions, true))
            .limit(1000);

        let totalClasses = 0;
        let totalGenerated = 0;
        let totalSkipped = 0;
        let tenantsSucceeded = 0;
        let tenantsFailed = 0;
        const allErrors: Record<string, Record<string, string[]>> = {};

        for (const { tenantId } of tenantsWithClasses) {
            if (!tenantId) continue;

            try {
                const result = await generateSessionsForTenant(tenantId, weeksAhead);
                totalClasses += result.total_classes;
                totalGenerated += result.total_generated;
                totalSkipped += result.total_skipped;

                if (Object.keys(result.errors).length > 0) {
                    allErrors[tenantId] = result.errors;
                }
                tenantsSucceeded++;
            } catch (error) {
                tenantsFailed++;
                const message = error instanceof Error ? error.message : "Error desconocido";
                allErrors[tenantId] = { _tenant: [message] };
                logger.error(`Error aislado generando sesiones para tenant ${tenantId}:`, error, {
                    tenantId,
                });
            }
        }

        logger.info(
            `Generación global completada: ${totalGenerated} sesiones generadas para ${totalClasses} clases en ${tenantsWithClasses.length} tenants`
        );

        return {
            total_tenants: tenantsWithClasses.length,
            total_classes: totalClasses,
            total_generated: totalGenerated,
            total_skipped: totalSkipped,
            tenants_succeeded: tenantsSucceeded,
            tenants_failed: tenantsFailed,
            errors: allErrors,
        };
    } catch (error) {
        logger.error("Error en generación global de sesiones:", error);
        throw error;
    }
}

/**
 * Elimina sesiones futuras de una clase (útil para regenerar)
 */
export async function deleteFutureSessions(classId: string): Promise<number> {
    const today = startOfDay(new Date());
    const todayStr = format(today, "yyyy-MM-dd");

    const result = await db
        .delete(classSessions)
        .where(
            and(
                eq(classSessions.classId, classId),
                gte(classSessions.sessionDate, todayStr),
                or(
                    eq(classSessions.status, "scheduled"),
                    isNull(classSessions.status)
                )
            )
        );

    return result.rowCount || 0;
}
