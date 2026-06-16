import { db } from "@/db";
import { classes, classSessions, classWeekdays, classExceptions } from "@/db/schema";
import { eq, and, gte, lte, isNull, or } from "drizzle-orm";
import { addDays, addWeeks, startOfDay, format, isSameDay, getDay } from "date-fns";
import { logger } from "@/lib/logger";

/**
 * Genera sesiones de clase para las próximas N semanas
 * 
 * @param classId - ID de la clase para generar sesiones
 * @param weeksAhead - Número de semanas a generar (default: 4)
 * @returns Número de sesiones generadas
 */
export async function generateClassSessions(
    classId: string,
    weeksAhead: number = 4
): Promise<{ generated: number; skipped: number; errors: string[] }> {
    const errors: string[] = [];
    let generated = 0;
    let skipped = 0;

    try {
        // 1. Obtener información de la clase
        const classInfo = await db
            .select()
            .from(classes)
            .where(eq(classes.id, classId))
            .limit(1);

        if (!classInfo || classInfo.length === 0) {
            throw new Error(`Clase ${classId} no encontrada`);
        }

        const classData = classInfo[0];

        // Usar autoGenerateSessions como flag de activo para generación
        if (!classData.autoGenerateSessions) {
            logger.warn(`Clase ${classId} no tiene auto-generación activada, saltando`);
            return { generated: 0, skipped: 0, errors: ["Auto-generación desactivada"] };
        }

        // 2. Obtener días de la semana configurados
        const weekdays = await db
            .select()
            .from(classWeekdays)
            .where(eq(classWeekdays.classId, classId));

        if (weekdays.length === 0) {
            throw new Error(`Clase ${classId} no tiene días de la semana configurados`);
        }

        // 3. Obtener excepciones (días festivos, cancelaciones, etc.)
        const today = startOfDay(new Date());
        const endDate = addWeeks(today, weeksAhead);

        const exceptions = await db
            .select()
            .from(classExceptions)
            .where(
                and(
                    eq(classExceptions.classId, classId),
                    gte(classExceptions.exceptionDate, format(today, "yyyy-MM-dd")),
                    lte(classExceptions.exceptionDate, format(endDate, "yyyy-MM-dd"))
                )
            );

        const exceptionDates = new Set(
            exceptions.map((e) => format(new Date(e.exceptionDate), "yyyy-MM-dd"))
        );

        // 4. Obtener sesiones ya existentes para evitar duplicados
        const existingSessions = await db
            .select()
            .from(classSessions)
            .where(
                and(
                    eq(classSessions.classId, classId),
                    gte(classSessions.sessionDate, format(today, "yyyy-MM-dd")),
                    lte(classSessions.sessionDate, format(endDate, "yyyy-MM-dd"))
                )
            );

        const existingDates = new Set(
            existingSessions.map((s) => format(new Date(s.sessionDate), "yyyy-MM-dd"))
        );

        // 5. Generar sesiones
        const sessionsToCreate: any[] = [];
        let currentDate = today;

        while (currentDate <= endDate) {
            const dayOfWeek = getDay(currentDate); // 0 = Domingo, 1 = Lunes, etc.
            const dateStr = format(currentDate, "yyyy-MM-dd");

            // Verificar si hay clase este día de la semana
            const weekdayConfig = weekdays.find((w) => w.weekday === dayOfWeek);

            if (weekdayConfig) {
                // Verificar si no es excepción
                if (exceptionDates.has(dateStr)) {
                    logger.info(`Saltando ${dateStr} - día de excepción`);
                    skipped++;
                }
                // Verificar si no existe ya
                else if (existingDates.has(dateStr)) {
                    logger.info(`Saltando ${dateStr} - sesión ya existe`);
                    skipped++;
                }
                // Crear sesión
                else {
                    sessionsToCreate.push({
                        id: crypto.randomUUID(),
                        classId: classId,
                        sessionDate: dateStr,
                        startTime: classData.startTime, // Usar horario de la clase
                        endTime: classData.endTime,     // Usar horario de la clase
                        status: "scheduled",
                        tenantId: classData.tenantId,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                }
            }

            currentDate = addDays(currentDate, 1);
        }

        // 6. Insertar sesiones en batch
        if (sessionsToCreate.length > 0) {
            await db.insert(classSessions).values(sessionsToCreate);
            generated = sessionsToCreate.length;
            logger.info(`Generadas ${generated} sesiones para clase ${classId}`);
        }

        return { generated, skipped, errors };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Error desconocido";
        logger.error(`Error generando sesiones para clase ${classId}:`, error);
        errors.push(errorMsg);
        return { generated, skipped, errors };
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
            );

        let totalGenerated = 0;
        let totalSkipped = 0;
        const allErrors: Record<string, string[]> = {};

        // Generar sesiones para cada clase
        for (const classData of activeClasses) {
            const result = await generateClassSessions(classData.id, weeksAhead);
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
    errors: Record<string, Record<string, string[]>>;
}> {
    try {
        // Obtener todos los tenants únicos con clases auto-generables
        const tenantsWithClasses = await db
            .selectDistinct({ tenantId: classes.tenantId })
            .from(classes)
            .where(eq(classes.autoGenerateSessions, true));

        let totalClasses = 0;
        let totalGenerated = 0;
        let totalSkipped = 0;
        const allErrors: Record<string, Record<string, string[]>> = {};

        for (const { tenantId } of tenantsWithClasses) {
            if (!tenantId) continue;

            const result = await generateSessionsForTenant(tenantId, weeksAhead);
            totalClasses += result.total_classes;
            totalGenerated += result.total_generated;
            totalSkipped += result.total_skipped;

            if (Object.keys(result.errors).length > 0) {
                allErrors[tenantId] = result.errors;
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
