import { apiSuccess, apiError } from "@/lib/api-response";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { classEnrollments } from "@/db/schema";
import { TenantContext, withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";

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
      })
      .from(classEnrollments)
      .where(eq(classEnrollments.id, enrollmentId))
      .limit(1);

    if (!enrollment) {
      return apiError("ENROLLMENT_NOT_FOUND", "Enrollment not found", 404);
    }

    if (enrollment.tenantId !== context.tenantId && context.profile.role !== "super_admin") {
      return apiError("FORBIDDEN", "Access denied", 403);
    }

    // Eliminar el enrollment
    await db
      .delete(classEnrollments)
      .where(eq(classEnrollments.id, enrollmentId));

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});

