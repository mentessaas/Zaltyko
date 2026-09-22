export const dynamic = 'force-dynamic';

import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { classSessions, classes, charges, athletes, groupAthletes } from "@/db/schema";
import { eq, and, count, lte, isNull } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * GET /api/quick-actions/pending-today
 * Devuelve los items pendientes para acciones rápidas
 */
export const GET = withTenant(async (req, context) => {
    try {
        const { tenantId } = context;
        const today = new Date().toISOString().split("T")[0];
        const now = new Date();

        // 1. Clases de hoy que necesitan asistencia
        const todaysSessions = await db
            .select({
                id: classSessions.id,
                sessionDate: classSessions.sessionDate,
                startTime: classSessions.startTime,
                className: classes.name,
                classId: classes.id,
            })
            .from(classSessions)
            .innerJoin(classes, eq(classSessions.classId, classes.id))
            .where(
                and(
                    eq(classes.tenantId, tenantId),
                    eq(classSessions.sessionDate, today)
                )
            )
            .limit(10);

        // 2. Pagos vencidos
        const overduePayments = await db
            .select({
                id: charges.id,
                athleteId: charges.athleteId,
                amountCents: charges.amountCents,
                dueDate: charges.dueDate,
            })
            .from(charges)
            .where(
                and(
                    eq(charges.tenantId, tenantId),
                    eq(charges.status, "pending"),
                    lte(charges.dueDate, today)
                )
            )
            .limit(10);

        // 3. Atletas sin grupo asignado
        const [unassignedRow] = await db
            .select({ total: count(athletes.id) })
            .from(athletes)
            .leftJoin(
                groupAthletes,
                and(
                    eq(groupAthletes.athleteId, athletes.id),
                    eq(groupAthletes.tenantId, tenantId)
                )
            )
            .where(
                and(
                    eq(athletes.tenantId, tenantId),
                    isNull(groupAthletes.athleteId)
                )
            );
        const unassignedCount = Number(unassignedRow?.total ?? 0);

        return apiSuccess({
            pendingClasses: todaysSessions.length,
            overduePayments: overduePayments.length,
            unassignedAthletes: unassignedCount,
            todaysSessions: todaysSessions.map((s) => ({
                id: s.id,
                className: s.className,
                time: s.startTime,
                classId: s.classId,
            })),
            overduePaymentsTotal: overduePayments.reduce(
                (sum, p) => sum + Number(p.amountCents),
                0
            ),
        });
    } catch (error) {
        logger.error("Error fetching quick actions data:", error);
        return apiError("INTERNAL_ERROR", "Error al obtener datos", 500);
    }
});
