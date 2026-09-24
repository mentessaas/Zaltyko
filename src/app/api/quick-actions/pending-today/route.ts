export const dynamic = 'force-dynamic';

import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { db } from "@/db";
import { classSessions, classes, charges, athletes, groupAthletes, groups } from "@/db/schema";
import { eq, and, lte, inArray, isNull } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { academies } from "@/db/schema";
import { getNowInCountryTimezone } from "@/lib/date-utils";
import { format } from "date-fns";

/**
 * GET /api/quick-actions/pending-today
 * Devuelve los items pendientes para acciones rápidas
 */
export const GET = withTenant(async (req, context) => {
    try {
        const { tenantId } = context;
        const requestedAcademyId = new URL(req.url).searchParams.get("academyId") ?? context.profile.activeAcademyId;
        const academyId = z.string().uuid().safeParse(requestedAcademyId).success ? requestedAcademyId : null;
        if (!academyId) return apiError("ACADEMY_REQUIRED", "Academia requerida", 400);
        const academyScope = await authorizeAcademyCapability({
            context,
            resourceTenantId: tenantId,
            academyId,
            permission: "classes:read",
        });
        if (!academyScope.allowed) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
        const [academy] = await db
            .select({ country: academies.country, countryCode: academies.countryCode })
            .from(academies)
            .where(and(eq(academies.id, academyId), eq(academies.tenantId, tenantId)))
            .limit(1);
        if (!academy) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
        const today = format(getNowInCountryTimezone(academy.countryCode ?? academy.country), "yyyy-MM-dd");

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
                    eq(classes.academyId, academyId),
                    eq(classSessions.sessionDate, today),
                    isNull(classes.deletedAt)
                )
            )
            .limit(10);

        // 2. Pagos vencidos
        const overduePayments = await db
            .select({
                id: charges.id,
                athleteId: charges.athleteId,
                amountCents: charges.amountCents,
                currency: charges.currency,
                dueDate: charges.dueDate,
            })
            .from(charges)
            .where(
                and(
                    eq(charges.tenantId, tenantId),
                    eq(charges.academyId, academyId),
                    inArray(charges.status, ["pending", "overdue"]),
                    lte(charges.dueDate, today)
                )
            )
            .limit(10);

        // 3. Atletas sin grupo asignado
        const allAthletes = await db
            .select({ id: athletes.id })
            .from(athletes)
            .where(and(eq(athletes.tenantId, tenantId), eq(athletes.academyId, academyId), isNull(athletes.deletedAt)))
            .limit(10000);

        const athletesWithGroups = await db
            .select({ athleteId: groupAthletes.athleteId })
            .from(groupAthletes)
            .innerJoin(groups, and(eq(groupAthletes.groupId, groups.id), eq(groups.tenantId, tenantId), eq(groups.academyId, academyId), isNull(groups.deletedAt)))
            .innerJoin(athletes, and(eq(groupAthletes.athleteId, athletes.id), eq(athletes.tenantId, tenantId), eq(athletes.academyId, academyId), isNull(athletes.deletedAt)))
            .where(eq(groupAthletes.tenantId, tenantId))
            .limit(10000);

        const assignedIds = new Set(athletesWithGroups.map((a) => a.athleteId));
        const unassignedCount = allAthletes.filter((a) => !assignedIds.has(a.id)).length;

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
            overduePaymentsCurrency:
                new Set(overduePayments.map((payment) => payment.currency?.toUpperCase() ?? "EUR")).size === 1
                    ? overduePayments[0]?.currency?.toUpperCase() ?? "EUR"
                    : null,
        });
    } catch (error) {
        logger.error("Error fetching quick actions data:", error);
        return apiError("INTERNAL_ERROR", "Error al obtener datos", 500);
    }
});
