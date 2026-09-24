import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, leadTrialOutcomes, leadTrials } from "@/db/schema";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { recordGrowthEvent } from "@/lib/growth/events";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  outcome: z.enum(["attended", "no_show", "won", "lost", "follow_up"]),
  notes: z.string().trim().max(2_000).nullable().optional(),
  nextActionAt: z.string().datetime({ offset: true }).nullable().optional(),
  idempotencyKey: z.string().uuid(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  const trialId = extractTrialId(request.url);
  if (!trialId) return apiError("TRIAL_NOT_FOUND", "Trial no encontrado", 404);
  const trial = await getTrialScope(trialId, context.tenantId);
  if (!trial) return apiError("TRIAL_NOT_FOUND", "Trial no encontrado", 404);
  const scope = await authorizeAcademyCapability({ context, resourceTenantId: context.tenantId, academyId: trial.academyId, permission: "billing:read" });
  if (!scope.allowed) return apiError("TRIAL_OUTCOME_FORBIDDEN", "Sin permiso para consultar el trial", 403);
  try {
    const items = await db.select().from(leadTrialOutcomes).where(and(eq(leadTrialOutcomes.tenantId, context.tenantId), eq(leadTrialOutcomes.leadTrialId, trialId))).orderBy(asc(leadTrialOutcomes.createdAt)).limit(500);
    return apiSuccess({ items });
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    return apiError("TRIALS_NOT_INITIALIZED", "La gestión de pruebas requiere activar la migración de trials en este entorno", 503);
  }
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  const trialId = extractTrialId(request.url);
  if (!trialId) return apiError("TRIAL_NOT_FOUND", "Trial no encontrado", 404);
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Resultado de trial inválido", 400);
  const trial = await getTrialScope(trialId, context.tenantId);
  if (!trial || trial.academyId !== parsed.data.academyId) return apiError("TRIAL_NOT_FOUND", "Trial no encontrado", 404);
  const scope = await authorizeAcademyCapability({ context, resourceTenantId: context.tenantId, academyId: trial.academyId, permission: "billing:update" });
  if (!scope.allowed) return apiError("TRIAL_OUTCOME_FORBIDDEN", "Sin permiso para registrar el resultado", 403);
  let created: { id: string | null; idempotent: boolean };
  try {
    created = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(leadTrialOutcomes).values({
      tenantId: context.tenantId,
      academyId: trial.academyId,
      leadTrialId: trialId,
      outcome: parsed.data.outcome,
      notes: parsed.data.notes ?? null,
      nextActionAt: parsed.data.nextActionAt ? new Date(parsed.data.nextActionAt) : null,
      recordedBy: context.profile.id,
      idempotencyKey: parsed.data.idempotencyKey,
      metadata: parsed.data.metadata ?? null,
    }).onConflictDoNothing({ target: [leadTrialOutcomes.tenantId, leadTrialOutcomes.idempotencyKey] }).returning({ id: leadTrialOutcomes.id });
    if (!inserted) return { id: (await tx.select({ id: leadTrialOutcomes.id }).from(leadTrialOutcomes).where(and(eq(leadTrialOutcomes.tenantId, context.tenantId), eq(leadTrialOutcomes.idempotencyKey, parsed.data.idempotencyKey))).limit(1))[0]?.id ?? null, idempotent: true };
    if (parsed.data.outcome === "attended" || parsed.data.outcome === "no_show") {
      await tx.update(leadTrials).set({ status: parsed.data.outcome, attendedAt: parsed.data.outcome === "attended" ? new Date() : null, updatedAt: new Date() }).where(and(eq(leadTrials.id, trialId), eq(leadTrials.tenantId, context.tenantId)));
    }
    return { id: inserted.id, idempotent: false };
    });
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    return apiError("TRIALS_NOT_INITIALIZED", "La gestión de pruebas requiere activar la migración de trials en este entorno", 503);
  }
  if (created.idempotent) return apiSuccess(created);
  await recordGrowthEvent({ eventName: "lead_trial_outcome_recorded", academyId: trial.academyId, tenantId: context.tenantId, userId: context.userId, source: "lead_trial_outcome_api", properties: { outcome: parsed.data.outcome, lead_trial_id: trialId }, idempotencyKey: `lead_trial_outcome:${context.tenantId}:${parsed.data.idempotencyKey}` });
  return apiCreated(created);
});

async function getTrialScope(trialId: string, tenantId: string) {
  const [row] = await db.select({ id: leadTrials.id, academyId: leadTrials.academyId }).from(leadTrials).innerJoin(academies, eq(academies.id, leadTrials.academyId)).where(and(eq(leadTrials.id, trialId), eq(leadTrials.tenantId, tenantId), eq(academies.tenantId, tenantId))).limit(1);
  return row ?? null;
}

function extractTrialId(url: string) {
  return new URL(url).pathname.match(/\/api\/lead-trials\/([^/]+)\/outcome$/)?.[1] ?? null;
}

function isMissingSchemaError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "42P01" || code === "42703" || /relation .* does not exist|column .* does not exist/i.test(message);
}
