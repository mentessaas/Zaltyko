import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, leadTrials, leads } from "@/db/schema";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { recordGrowthEvent } from "@/lib/growth/events";

const CreateSchema = z.object({
  academyId: z.string().uuid(),
  leadId: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  idempotencyKey: z.string().uuid(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");
  if (!academyId || !z.string().uuid().safeParse(academyId).success) {
    return apiError("ACADEMY_REQUIRED", "Academia no válida", 400);
  }
  const scope = await authorizeAcademyCapability({ context, resourceTenantId: context.tenantId, academyId, permission: "billing:read" });
  if (!scope.allowed) return apiError("LEAD_TRIAL_FORBIDDEN", "Sin permiso para consultar trials", 403);
  try {
    const items = await db.select().from(leadTrials).where(and(eq(leadTrials.tenantId, context.tenantId), eq(leadTrials.academyId, academyId))).orderBy(desc(leadTrials.createdAt)).limit(500);
    return apiSuccess({ items });
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    return apiError("TRIALS_NOT_INITIALIZED", "La gestión de pruebas requiere activar la migración de trials en este entorno", 503);
  }
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Trial de prospecto inválido", 400);
  const input = parsed.data;
  const academy = await getAcademy(input.academyId, context.tenantId);
  if (!academy) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
  const scope = await authorizeAcademyCapability({ context, resourceTenantId: context.tenantId, academyId: input.academyId, permission: "billing:create" });
  if (!scope.allowed) return apiError("LEAD_TRIAL_FORBIDDEN", "Sin permiso para crear trials", 403);
  if (input.leadId) {
    const lead = await findLeadForTrial(input.leadId, context.tenantId, input.academyId);
    if (!lead) return apiError("LEAD_NOT_FOUND", "Lead no encontrado", 404);
    if (lead.academyId && lead.academyId !== input.academyId) return apiError("LEAD_NOT_FOUND", "Lead no encontrado", 404);
    if (lead.ownershipSupported && (!lead.tenantId || !lead.academyId)) {
      const [claimed] = await db.update(leads).set({ tenantId: context.tenantId, academyId: input.academyId }).where(and(eq(leads.id, input.leadId), isNull(leads.tenantId), isNull(leads.academyId))).returning({ id: leads.id });
      if (!claimed) {
        const current = await findLeadForTrial(input.leadId, context.tenantId, input.academyId);
        if (!current || current.academyId !== input.academyId || current.tenantId !== context.tenantId) return apiError("LEAD_NOT_FOUND", "Lead no encontrado", 404);
      }
    }
  }
  let created: { id: string } | undefined;
  try {
    [created] = await db.insert(leadTrials).values({
      tenantId: context.tenantId,
      academyId: input.academyId,
      leadId: input.leadId ?? null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      createdBy: context.profile.id,
      idempotencyKey: input.idempotencyKey,
    }).onConflictDoNothing({ target: [leadTrials.tenantId, leadTrials.idempotencyKey] }).returning({ id: leadTrials.id });
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    return apiError("TRIALS_NOT_INITIALIZED", "La gestión de pruebas requiere activar la migración de trials en este entorno", 503);
  }
  if (!created) {
    const [existing] = await db.select({ id: leadTrials.id }).from(leadTrials).where(and(eq(leadTrials.tenantId, context.tenantId), eq(leadTrials.idempotencyKey, input.idempotencyKey))).limit(1);
    return apiSuccess({ id: existing?.id ?? null, idempotent: true });
  }
  await recordGrowthEvent({ eventName: "lead_trial_created", academyId: input.academyId, tenantId: context.tenantId, userId: context.userId, source: "lead_trial_api", properties: { lead_trial_id: created.id, lead_id: input.leadId ?? null }, idempotencyKey: `lead_trial:${context.tenantId}:${input.idempotencyKey}` });
  return apiCreated({ id: created.id, idempotent: false });
});

async function getAcademy(academyId: string, tenantId: string) {
  const [academy] = await db.select({ id: academies.id }).from(academies).where(and(eq(academies.id, academyId), eq(academies.tenantId, tenantId))).limit(1);
  return academy ?? null;
}

async function findLeadForTrial(leadId: string, tenantId: string, academyId: string) {
  try {
    const [lead] = await db.select({ id: leads.id, tenantId: leads.tenantId, academyId: leads.academyId }).from(leads).where(and(eq(leads.id, leadId), or(isNull(leads.tenantId), eq(leads.tenantId, tenantId)))).limit(1);
    return lead ? { ...lead, ownershipSupported: true } : null;
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    // Compatibility while 20260915150000_lead_ownership.sql is pending remotely.
    const [legacyLead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).limit(1);
    return legacyLead ? { id: legacyLead.id, tenantId: null, academyId: null, ownershipSupported: false } : null;
  }
}

function isMissingSchemaError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "42P01" || code === "42703" || /relation .* does not exist|column .* does not exist/i.test(message);
}
