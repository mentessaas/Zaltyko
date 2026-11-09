export const dynamic = "force-dynamic";

import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { athletes, auditLogs } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { createAuditLog } from "@/lib/authz/audit-service";
import { handleApiError } from "@/lib/api-error-handler";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { withTransaction } from "@/lib/db-transactions";
import { lockAcademyOperationalWrites } from "@/lib/limits";

const BodySchema = z.object({
  academyId: z.guid(),
  athleteIds: z
    .array(z.guid())
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

class BulkArchiveIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("La clave de idempotencia ya se usó con otra selección.");
    this.name = "BulkArchiveIdempotencyConflictError";
  }
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,150}$/u;

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

    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return apiError("IDEMPOTENCY_KEY_REQUIRED", "Se requiere una clave de idempotencia válida", 400);
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

    const athleteIds = [...parsed.data.athleteIds].sort();
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ academyId: parsed.data.academyId, athleteIds }))
      .digest("hex");
    const commandScope = "legacy-athlete-bulk-archive:v1";
    const commandLock = `${commandScope}:${context.tenantId}:${context.userId}:${idempotencyKey}`;
    const result = await withTransaction(async (tx) => {
      await lockAcademyOperationalWrites(tx, parsed.data.academyId);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${commandLock}, 0))`);
      const [prior] = await tx
        .select({ meta: auditLogs.meta, resourceId: auditLogs.resourceId })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, context.tenantId!),
            eq(auditLogs.userId, context.userId),
            eq(auditLogs.action, "athletes.status_change"),
            eq(auditLogs.module, "athletes"),
            sql`(${auditLogs.meta}->>'commandScope') = ${commandScope}`,
            sql`(${auditLogs.meta}->>'idempotencyKey') = ${idempotencyKey}`,
          ),
        )
        .limit(1);
      if (prior) {
        const meta = prior.meta && typeof prior.meta === "object" && !Array.isArray(prior.meta)
          ? prior.meta as Record<string, unknown>
          : {};
        if (
          prior.resourceId !== parsed.data.academyId ||
          meta.requestHash !== requestHash ||
          !Number.isInteger(meta.archivedCount) ||
          (meta.archivedCount as number) < 1 ||
          (meta.archivedCount as number) > athleteIds.length
        ) {
          throw new BulkArchiveIdempotencyConflictError();
        }
        return { archivedCount: meta.archivedCount, replayed: true };
      }

      const selected = await tx
        .select({ id: athletes.id })
        .from(athletes)
        .where(
          and(
            inArray(athletes.id, athleteIds),
            eq(athletes.academyId, parsed.data.academyId),
            eq(athletes.tenantId, context.tenantId!),
            isNull(athletes.deletedAt),
          ),
        )
        .limit(athleteIds.length);

      if (selected.length !== athleteIds.length) {
        throw new BulkArchiveConflictError();
      }

      const archivedAt = new Date();
      const rows = await tx
        .update(athletes)
        .set({ status: "archived", deletedAt: archivedAt })
        .where(
          and(
            inArray(athletes.id, athleteIds),
            eq(athletes.academyId, parsed.data.academyId),
            eq(athletes.tenantId, context.tenantId!),
            isNull(athletes.deletedAt),
          ),
        )
        .returning({ id: athletes.id });

      // Lanzar dentro de la transacción garantiza rollback ante una carrera
      // en la que alguna fila deje de estar activa mientras se procesa.
      if (rows.length !== athleteIds.length) {
        throw new BulkArchiveConflictError();
      }
      await createAuditLog({
        tenantId: context.tenantId!,
        userId: context.userId,
        action: "athletes.status_change",
        module: "athletes",
        resourceType: "athlete",
        resourceId: parsed.data.academyId,
        description: `Archivó ${rows.length} gimnastas en una operación por lote`,
        meta: {
          academyId: parsed.data.academyId,
          athleteIds,
          archivedCount: rows.length,
          commandScope,
          idempotencyKey,
          requestHash,
        },
      }, tx);
      return { archivedCount: rows.length, replayed: false };
    });

    return apiSuccess(result);
  } catch (error) {
    if (error instanceof BulkArchiveConflictError) {
      return apiError("ATHLETES_CHANGED", error.message, 409);
    }
    if (error instanceof BulkArchiveIdempotencyConflictError) {
      return apiError("IDEMPOTENCY_CONFLICT", error.message, 409);
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
