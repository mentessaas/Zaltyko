import { apiSuccess, apiError } from "@/lib/api-response";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { classes } from "@/db/schema";
import { TenantContext, withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
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
      .where(and(eq(classes.id, classId), eq(classes.tenantId, context.tenantId), isNull(classes.deletedAt)))
      .limit(1);

    if (!classRow) {
      return apiError("CLASS_NOT_FOUND", "Class not found", 404);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: classRow.tenantId,
      academyId: classRow.academyId,
      permission: "classes:read",
    });

    if (!scope.allowed) {
      return apiError("CLASS_NOT_FOUND", "Class not found", 404);
    }

    // Obtener atletas usando la función helper
    const athletes = await getClassAthletes(classId, classRow.academyId);

    return apiSuccess({ items: athletes });
  } catch (error) {
    return handleApiError(error);
  }
});
