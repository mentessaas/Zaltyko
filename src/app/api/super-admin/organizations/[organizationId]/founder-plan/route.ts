import { z } from "zod";

import { db } from "@/db";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";
import {
  grantOrganizationEntitlement,
  lockOrganizationForSaasMutation,
} from "@/modules/saas-billing/application/entitlement-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry } from "@/modules/shared/infrastructure/transactional-records";

const FOUNDER_PLAN_MAX_DAYS = 366;

const paramsSchema = z.object({ organizationId: z.guid() });

const bodySchema = z
  .object({
    planCode: z.enum(["starter", "growth"]),
    effectiveUntil: z.string().date(),
    reference: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{5,79}$/, "Referencia en minúsculas, números y guiones"),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

/**
 * Founder / pilot plan: grants Starter or Growth without Stripe through the
 * canonical "contract" entitlement source, bounded in time. When it ends the
 * academy falls back to Free (read-only if over capacity, data kept).
 */
export const POST = withSuperAdmin(async (request, context) => {
  const params = paramsSchema.safeParse(context.params);
  if (!params.success) return apiError("INVALID_ORGANIZATION", "Organización no válida", 400);

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return apiError("VALIDATION_ERROR", "Datos del plan fundador no válidos", 400, {
      issues: body.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const now = new Date();
  const effectiveUntil = new Date(`${body.data.effectiveUntil}T23:59:59.999Z`);
  const maxUntil = new Date(now.getTime() + FOUNDER_PLAN_MAX_DAYS * 86_400_000);
  if (effectiveUntil.getTime() <= now.getTime() || effectiveUntil.getTime() > maxUntil.getTime()) {
    return apiError(
      "INVALID_EFFECTIVE_UNTIL",
      `La fecha de fin debe ser futura y como máximo dentro de ${FOUNDER_PLAN_MAX_DAYS} días`,
      400
    );
  }

  const organizationId = params.data.organizationId;
  const sourceReference = `founder:${body.data.reference}`;
  try {
    const result = await db.transaction(async (tx) => {
      await lockOrganizationForSaasMutation(tx, organizationId);
      const grant = await grantOrganizationEntitlement(tx, {
        organizationId,
        planCode: body.data.planCode,
        source: "contract",
        sourceReference,
        subscriptionId: null,
        trialId: null,
        effectiveFrom: now,
        effectiveUntil,
      });
      if (!grant.replayed) {
        await appendAuditEntry(tx, {
          organizationId,
          locationId: null,
          actorUserId: context.userId,
          action: "saas.founder_plan_granted",
          targetType: "organization",
          targetId: organizationId,
          idempotencyKey: sourceReference,
          after: {
            planCode: body.data.planCode,
            effectiveUntil: effectiveUntil.toISOString(),
          },
          metadata: { note: body.data.note ?? null },
        });
      }
      return grant;
    });

    return apiSuccess({
      organizationId,
      planCode: body.data.planCode,
      effectiveUntil: effectiveUntil.toISOString(),
      revision: result.revision,
      replayed: result.replayed,
    });
  } catch (error) {
    if (error instanceof OperationalError) {
      return apiError(error.code, error.message, error.status);
    }
    logger.error("Founder plan grant failed", error);
    return apiError("FOUNDER_PLAN_FAILED", "No se pudo conceder el plan fundador", 500);
  }
});
