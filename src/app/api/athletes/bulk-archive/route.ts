export const dynamic = "force-dynamic";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { createAuditLog } from "@/lib/authz/audit-service";
import { handleApiError } from "@/lib/api-error-handler";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { withTransaction } from "@/lib/db-transactions";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  athleteIds: z
    .array(z.string().uuid())
    .min(1, "Selecciona al menos una gimnasta")
    .max(100, "Puedes archivar como máximo 100 gimnastas por operación")
    .refine((ids) => new Set(ids).size === ids.length, "La selección contiene duplicados"),
});

class BulkArchiveConflictError extends Error {
  readonly code = "ATHLETES_CHANGED";

  constructor() {
    super("La selección cambió mientras se procesaba. Vuelve a intentarlo.");
    this.name = "BulkArchiveConflictError";
  }
}

/**
 * Archiva una selección de atletas de forma atómica y no destructiva.
 *
 * El listado no ofrece borrado irreversible: el historial de asistencia,
 * evaluaciones y cobros debe conservarse para una academia. La operación
 * exige que todas las filas pertenezcan al mismo tenant/academia para evitar
 * resultados parciales o cruces de contexto.
 */
const bulkArchiveHandler = withTenant(async (request, context) => {
  try {
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "La selección de gimnastas no es válida", 400, parsed.error.flatten());
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: context.tenantId,
      academyId: parsed.data.academyId,
      permission: "athletes:delete",
    });
    if (!scope.allowed) {
      return apiError("FORBIDDEN", "Access denied", 403);
    }

    const selected = await db
      .select({ id: athletes.id })
      .from(athletes)
      .where(
        and(
          inArray(athletes.id, parsed.data.athleteIds),
          eq(athletes.academyId, parsed.data.academyId),
          eq(athletes.tenantId, context.tenantId),
          isNull(athletes.deletedAt),
        ),
      )
      .limit(parsed.data.athleteIds.length);

    if (selected.length !== parsed.data.athleteIds.length) {
      return apiError("ATHLETES_NOT_FOUND", "Una o más gimnastas ya no pertenecen a esta academia", 404);
    }

    const archivedAt = new Date();
    const archived = await withTransaction(async (tx) => {
      const rows = await tx
        .update(athletes)
        .set({ status: "archived", deletedAt: archivedAt })
        .where(
          and(
            inArray(athletes.id, parsed.data.athleteIds),
            eq(athletes.academyId, parsed.data.academyId),
            eq(athletes.tenantId, context.tenantId!),
            isNull(athletes.deletedAt),
          ),
        )
        .returning({ id: athletes.id });

      // Lanzar dentro de la transacción garantiza rollback ante una carrera
      // en la que alguna fila deje de estar activa mientras se procesa.
      if (rows.length !== parsed.data.athleteIds.length) {
        throw new BulkArchiveConflictError();
      }
      return rows;
    });

    await createAuditLog({
      tenantId: context.tenantId,
      userId: context.userId,
      action: "athletes.status_change",
      module: "athletes",
      resourceType: "athlete",
      resourceId: parsed.data.academyId,
      description: `Archivó ${archived.length} gimnastas en una operación por lote`,
      meta: {
        academyId: parsed.data.academyId,
        athleteIds: parsed.data.athleteIds,
        archivedCount: archived.length,
      },
    });

    return apiSuccess({ archivedCount: archived.length });
  } catch (error) {
    if (error instanceof BulkArchiveConflictError) {
      return apiError("ATHLETES_CHANGED", error.message, 409);
    }
    return handleApiError(error, {
      endpoint: "/api/athletes/bulk-archive",
      method: "POST",
    });
  }
});

export const POST = withRateLimit(
  async (request, context) => (await bulkArchiveHandler(request, context)) as Response,
  { identifier: getUserIdentifier, limit: 5, window: 60 },
);
