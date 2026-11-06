import { apiSuccess, apiError } from "@/lib/api-response";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { classEnrollments, classes } from "@/db/schema";
import { TenantContext, withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { authorizeClassResource } from "@/lib/authz/resource-scope";
import { promoteNextWaitingListEntry } from "@/lib/classes/promote-waiting-list";
import { withTransaction } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";

type RouteContext = TenantContext<{ params?: { enrollmentId?: string } }>;

/**
 * DELETE /api/class-enrollments/[enrollmentId]
 * Elimina una inscripción extra de un atleta a una clase
 * 
 * Solo permite eliminar enrollments (inscripciones extra), no atletas que vienen por grupo base.
 */
export const DELETE = withTenant(async (request, context) => {
  try {
    const enrollmentId = (context as RouteContext).params?.enrollmentId;

    if (!enrollmentId || typeof enrollmentId !== "string") {
      return apiError("ENROLLMENT_ID_REQUIRED", "Enrollment ID is required", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Verificar que el enrollment existe y pertenece al tenant
    const [enrollment] = await db
      .select({
        id: classEnrollments.id,
        tenantId: classEnrollments.tenantId,
        classId: classEnrollments.classId,
      })
      .from(classEnrollments)
      .where(eq(classEnrollments.id, enrollmentId))
      .limit(1);

    if (!enrollment) {
      return apiError("ENROLLMENT_NOT_FOUND", "Enrollment not found", 404);
    }

    const scope = await authorizeClassResource({ context, classId: enrollment.classId });
    if (!scope.allowed) {
      return apiError("ENROLLMENT_NOT_FOUND", "Enrollment not found", 404);
    }

    const [classRow] = await db
      .select({ academyId: classes.academyId })
      .from(classes)
      .where(and(eq(classes.id, enrollment.classId), eq(classes.tenantId, context.tenantId)))
      .limit(1);
    if (!classRow) {
      return apiError("ENROLLMENT_NOT_FOUND", "Enrollment not found", 404);
    }

    // La baja y la transición al modo de solo lectura comparten el bloqueo de
    // academia que usan las demás escrituras operativas.
    await withTransaction(async (tx) => {
      await lockAcademyOperationalWrites(tx, classRow.academyId);
      await assertAcademyOperationalWritable(context.tenantId!, classRow.academyId, tx);
      await tx
        .delete(classEnrollments)
        .where(and(eq(classEnrollments.id, enrollmentId), eq(classEnrollments.tenantId, context.tenantId!)));
    });

    const promoted = await promoteNextWaitingListEntry(enrollment.classId, context.tenantId);

    return apiSuccess({ ok: true, promoted: promoted ?? null });
  } catch (error) {
    return handleApiError(error);
  }
});
