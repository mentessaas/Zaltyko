import { apiSuccess, apiError } from "@/lib/api-response";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, classes } from "@/db/schema";
import { TenantContext, withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";

type RouteContext = TenantContext<{ params?: { classId?: string } }>;

/**
 * GET /api/classes/[classId]/athletes
 * Obtiene la lista completa de atletas de una clase
 * 
 * Retorna atletas del grupo base + atletas extra, con indicador de origen.
 */
export const GET = withTenant(async (request, context) => {
  try {
    const classId = (context as RouteContext).params?.classId;

    if (!classId || typeof classId !== "string") {
      return apiError("CLASS_ID_REQUIRED", "Class ID is required", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Obtener información de la clase para validar acceso
    const [classRow] = await db
      .select({
        id: classes.id,
        academyId: classes.academyId,
        tenantId: classes.tenantId,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!classRow) {
      return apiError("CLASS_NOT_FOUND", "Class not found", 404);
    }

    // Verificar acceso al tenant
    if (classRow.tenantId !== context.tenantId && context.profile.role !== "super_admin") {
      return apiError("FORBIDDEN", "Access denied", 403);
    }

    // Obtener atletas usando la función helper
    const athletes = await getClassAthletes(classId, classRow.academyId);

    return apiSuccess({ items: athletes });
  } catch (error) {
    return handleApiError(error);
  }
});

