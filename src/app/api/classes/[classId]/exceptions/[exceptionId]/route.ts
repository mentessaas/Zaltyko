import { apiSuccess, apiError } from "@/lib/api-response";
import { db } from "@/db";
import { classExceptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { authorizeClassResource } from "@/lib/authz/resource-scope";

/**
 * DELETE /api/classes/[classId]/exceptions/[exceptionId]
 * Elimina una excepción
 */
import { TenantContext } from "@/lib/authz";

async function deleteException(
    request: Request,
    context: TenantContext<{ params: { classId: string; exceptionId: string } }>
) {
    const { params } = context;
    try {
        const { classId, exceptionId } = params;
        const scope = await authorizeClassResource({ context, classId });
        if (!scope.allowed) {
            return apiError("EXCEPTION_NOT_FOUND", "Exception not found", 404);
        }

        const deleted = await db
            .delete(classExceptions)
            .where(
                and(
                    eq(classExceptions.id, exceptionId),
                    eq(classExceptions.classId, classId),
                    eq(classExceptions.tenantId, scope.resource!.tenantId)
                )
            )
            .returning();

        if (deleted.length === 0) {
            return apiError("EXCEPTION_NOT_FOUND", "Exception not found", 404);
        }

        return apiSuccess({ success: true });
    } catch (error) {
        logger.error("Error deleting class exception:", error);
        return apiError("DELETE_EXCEPTION_FAILED", "Error deleting exception", 500);
    }
}

export const DELETE = withTenant(deleteException);
