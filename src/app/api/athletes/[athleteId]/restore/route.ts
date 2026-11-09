import { createHash } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { athletes, auditLogs } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { createAuditLog } from "@/lib/authz/audit-service";
import { handleApiError } from "@/lib/api-error-handler";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { withTransaction } from "@/lib/db-transactions";
import { assertWithinPlanLimits, lockAcademyOperationalWrites } from "@/lib/limits";

const BodySchema = z.object({
  academyId: z.guid(),
});

class RestoreConflictError extends Error {
  constructor() {
    super("La gimnasta cambió mientras se restauraba. Vuelve a intentarlo.");
    this.name = "RestoreConflictError";
  }
}

class RestoreNotFoundError extends Error {
  constructor() {
    super("La gimnasta archivada no existe en esta academia.");
    this.name = "RestoreNotFoundError";
  }
}

class RestoreIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("La clave de idempotencia ya se usó con otra gimnasta.");
    this.name = "RestoreIdempotencyConflictError";
  }
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,150}$/u;

const restoreAthleteHandler = withTenant(async (request, context) => {
  try {
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "La academia no es válida", 400, parsed.error.flatten());
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return apiError("IDEMPOTENCY_KEY_REQUIRED", "Se requiere una clave de idempotencia válida", 400);
    }

    const athleteId = (context.params as { athleteId?: string })?.athleteId;
    if (!athleteId) {
      return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
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

    const requestHash = createHash("sha256")
      .update(JSON.stringify({ academyId: parsed.data.academyId, athleteId }))
      .digest("hex");
    const commandScope = "legacy-athlete-restore:v1";
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
          prior.resourceId !== athleteId ||
          meta.academyId !== parsed.data.academyId ||
          meta.requestHash !== requestHash ||
          meta.restored !== true
        ) {
          throw new RestoreIdempotencyConflictError();
        }
        return { restored: true, replayed: true };
      }

      await assertWithinPlanLimits(context.tenantId!, parsed.data.academyId, "athletes", tx);

      const [existing] = await tx
        .select({ id: athletes.id })
        .from(athletes)
        .where(
          and(
            eq(athletes.id, athleteId),
            eq(athletes.tenantId, context.tenantId!),
            eq(athletes.academyId, parsed.data.academyId),
            eq(athletes.status, "archived"),
            isNotNull(athletes.deletedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new RestoreNotFoundError();

      const rows = await tx
        .update(athletes)
        .set({ status: "active", deletedAt: null })
        .where(
          and(
            eq(athletes.id, athleteId),
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
      await createAuditLog({
        tenantId: context.tenantId!,
        userId: context.userId,
        action: "athletes.status_change",
        module: "athletes",
        resourceType: "athlete",
        resourceId: athleteId,
        description: "Restauró una gimnasta archivada",
        meta: {
          academyId: parsed.data.academyId,
          restored: true,
          commandScope,
          idempotencyKey,
          requestHash,
        },
      }, tx);
      return { restored: true, replayed: false };
    });

    return apiSuccess(result);
  } catch (error) {
    if (error instanceof RestoreNotFoundError) {
      return apiError("ATHLETE_NOT_FOUND", error.message, 404);
    }
    if (error instanceof RestoreConflictError) {
      return apiError("ATHLETE_CHANGED", error.message, 409);
    }
    if (error instanceof RestoreIdempotencyConflictError) {
      return apiError("IDEMPOTENCY_CONFLICT", error.message, 409);
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
