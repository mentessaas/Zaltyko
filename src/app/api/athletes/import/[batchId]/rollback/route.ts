export const dynamic = "force-dynamic";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athleteImportBatches,
  athleteSportConfigs,
  athletes,
  groupAthletes,
} from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { createAuditLog } from "@/lib/authz/audit-service";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";

const ParamsSchema = z.object({ batchId: z.string().uuid() });

/**
 * Deshace exclusivamente las gimnastas creadas por un lote terminado.
 *
 * La operación es idempotente: un lote ya deshecho no vuelve a tocar datos.
 * Se conservan los registros de atletas como soft-delete para no romper la
 * trazabilidad ni reutilizar accidentalmente sus identificadores.
 */
export const POST = withTenant(async (request, context) => {
  try {
    const parsedParams = ParamsSchema.safeParse(context.params);
    if (!parsedParams.success) {
      return apiError("BATCH_ID_INVALID", "El lote de importación no es válido", 400);
    }

    if (!context.tenantId && context.profile.role !== "super_admin") {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }

    const tenantCondition =
      context.profile.role === "super_admin"
        ? eq(athleteImportBatches.id, parsedParams.data.batchId)
        : and(
            eq(athleteImportBatches.id, parsedParams.data.batchId),
            eq(athleteImportBatches.tenantId, context.tenantId),
          );

    const [batch] = await db
      .select()
      .from(athleteImportBatches)
      .where(tenantCondition)
      .limit(1);

    if (!batch) {
      return apiError("IMPORT_BATCH_NOT_FOUND", "No se encontró la importación", 404);
    }

    if (batch.status === "rolled_back") {
      return apiSuccess({ batchId: batch.id, status: batch.status, rolledBackCount: 0 });
    }

    if (batch.status !== "completed") {
      return apiError(
        "IMPORT_BATCH_NOT_READY",
        "La importación todavía no está lista para deshacerse. Espera a que termine.",
        409,
      );
    }

    const batchAthletes = await db
      .select({ id: athletes.id, academyId: athletes.academyId })
      .from(athletes)
      .where(eq(athletes.importBatchId, batch.id))
      // `createdCount` se cierra en el mismo flujo que el lote; usarlo como
      // límite evita convertir un rollback en una lectura sin cota.
      .limit(Math.max(batch.createdCount, 1));

    const academyIds = Array.from(new Set(batchAthletes.map((athlete) => athlete.academyId)));
    for (const academyId of academyIds) {
      const scope = await authorizeAcademyCapability({
        context,
        resourceTenantId: batch.tenantId,
        academyId,
        permission: "athletes:delete",
      });
      if (!scope.allowed) {
        // No revelar si el lote existe en otra academia a un miembro sin
        // permiso sobre todas las academias afectadas.
        return apiError("IMPORT_BATCH_NOT_FOUND", "No se encontró la importación", 404);
      }
    }

    const athleteIds = batchAthletes.map((athlete) => athlete.id);
    const rolledBackAt = new Date();

    await withTransaction(async (tx) => {
      if (athleteIds.length > 0) {
        await tx
          .delete(groupAthletes)
          .where(inArray(groupAthletes.athleteId, athleteIds));
        await tx
          .delete(athleteSportConfigs)
          .where(inArray(athleteSportConfigs.athleteId, athleteIds));
        await tx
          .update(athletes)
          .set({ status: "archived", deletedAt: rolledBackAt })
          .where(
            and(
              inArray(athletes.id, athleteIds),
              eq(athletes.importBatchId, batch.id),
              isNull(athletes.deletedAt),
            ),
          );
      }

      await tx
        .update(athleteImportBatches)
        .set({ status: "rolled_back", rolledBackAt })
        .where(and(eq(athleteImportBatches.id, batch.id), eq(athleteImportBatches.status, "completed")));
    });

    await createAuditLog({
      tenantId: batch.tenantId,
      userId: context.userId,
      action: "athletes.import_rollback",
      module: "athletes",
      resourceType: "athlete_import_batch",
      resourceId: batch.id,
      resourceName: batch.fileHash,
      description: `Deshizo la importación de ${athleteIds.length} gimnastas`,
      meta: {
        batchId: batch.id,
        rolledBackCount: athleteIds.length,
        academyIds,
      },
    });

    return apiSuccess({
      batchId: batch.id,
      status: "rolled_back" as const,
      rolledBackCount: athleteIds.length,
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/athletes/import/[batchId]/rollback",
      method: "POST",
    });
  }
});
