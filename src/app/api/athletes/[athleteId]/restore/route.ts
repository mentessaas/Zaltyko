import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { createAuditLog } from "@/lib/authz/audit-service";
import { handleApiError } from "@/lib/api-error-handler";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { withTransaction } from "@/lib/db-transactions";

const BodySchema = z.object({
  academyId: z.string().uuid(),
});

class RestoreConflictError extends Error {
  constructor() {
    super("La gimnasta cambió mientras se restauraba. Vuelve a intentarlo.");
    this.name = "RestoreConflictError";
  }
}

const restoreAthleteHandler = withTenant(async (request, context) => {
  try {
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "La academia no es válida", 400, parsed.error.flatten());
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const athleteId = (context.params as { athleteId?: string })?.athleteId;
    if (!athleteId) {
      return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
    }

    const [existing] = await db
      .select({
        id: athletes.id,
        tenantId: athletes.tenantId,
        academyId: athletes.academyId,
        status: athletes.status,
        deletedAt: athletes.deletedAt,
      })
      .from(athletes)
      .where(
        and(
          eq(athletes.id, athleteId),
          eq(athletes.tenantId, context.tenantId),
          eq(athletes.academyId, parsed.data.academyId),
          eq(athletes.status, "archived"),
          isNotNull(athletes.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return apiError("ATHLETE_NOT_FOUND", "La gimnasta archivada no existe en esta academia", 404);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: context.tenantId,
      academyId: parsed.data.academyId,
      permission: "athletes:update",
    });
    if (!scope.allowed) {
      return apiError("FORBIDDEN", "Access denied", 403);
    }

    const restored = await withTransaction(async (tx) => {
      const rows = await tx
        .update(athletes)
        .set({ status: "active", deletedAt: null })
        .where(
          and(
            eq(athletes.id, existing.id),
            eq(athletes.tenantId, context.tenantId!),
            eq(athletes.academyId, parsed.data.academyId),
            eq(athletes.status, "archived"),
            isNotNull(athletes.deletedAt),
          ),
        )
        .returning({ id: athletes.id });

      if (rows.length !== 1) {
        throw new RestoreConflictError();
      }
      return rows[0];
    });

    await createAuditLog({
      tenantId: context.tenantId,
      userId: context.userId,
      action: "athletes.status_change",
      module: "athletes",
      resourceType: "athlete",
      resourceId: restored.id,
      description: "Restauró una gimnasta archivada",
      meta: { academyId: parsed.data.academyId, restored: true },
    });

    return apiSuccess({ restored: true });
  } catch (error) {
    if (error instanceof RestoreConflictError) {
      return apiError("ATHLETE_CHANGED", error.message, 409);
    }
    return handleApiError(error, {
      endpoint: "/api/athletes/[athleteId]/restore",
      method: "POST",
    });
  }
});

export const POST = withRateLimit(
  async (request, context) => (await restoreAthleteHandler(request, context)) as Response,
  { identifier: getUserIdentifier, limit: 10, window: 60 },
);
