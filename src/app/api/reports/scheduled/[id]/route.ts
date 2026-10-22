import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { isFeatureEnabled } from "@/lib/product/features";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { academies, scheduledReports } from "@/db/schema";

export const dynamic = 'force-dynamic';

const patchSchema = z.object({ active: z.boolean().optional(), name: z.string().trim().min(1).max(200).optional() }).refine((v) => v.active !== undefined || v.name !== undefined);

async function getOwned(id: string, tenantId: string) {
  const [row] = await db.select({ report: scheduledReports, academy: academies }).from(scheduledReports)
    .innerJoin(academies, and(eq(scheduledReports.academyId, academies.id), eq(academies.tenantId, tenantId)))
    .where(eq(scheduledReports.id, id)).limit(1);
  return row;
}

export const GET = withTenant(async (_req, ctx) => {
  if (!isFeatureEnabled("scheduledReports")) {
    return apiError("FEATURE_DISABLED", "Reportes programados no disponibles en esta versión", 404);
  }

  const id = String((ctx as any).params?.id ?? "");
  const owned = await getOwned(id, ctx.tenantId);
  if (!owned) return apiError("NOT_FOUND", "Reporte no encontrado", 404);
  return apiSuccess({ item: owned.report });
});

export const PATCH = withTenant(async (req, ctx) => {
  if (!isFeatureEnabled("scheduledReports")) {
    return apiError("FEATURE_DISABLED", "Reportes programados no disponibles en esta versión", 404);
  }

  const id = String((ctx as any).params?.id ?? "");
  const owned = await getOwned(id, ctx.tenantId);
  if (!owned) return apiError("NOT_FOUND", "Reporte no encontrado", 404);
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("INVALID_PAYLOAD", "Payload inválido", 400);
  const [updated] = await db.update(scheduledReports).set({
    ...(body.data.name !== undefined ? { name: body.data.name } : {}),
    ...(body.data.active !== undefined ? { isActive: body.data.active ? "true" : "false" } : {}),
  }).where(eq(scheduledReports.id, id)).returning();
  return apiSuccess({ item: updated });
});

export const DELETE = withTenant(async (_req, ctx) => {
  if (!isFeatureEnabled("scheduledReports")) {
    return apiError("FEATURE_DISABLED", "Reportes programados no disponibles en esta versión", 404);
  }

  const id = String((ctx as any).params?.id ?? "");
  const owned = await getOwned(id, ctx.tenantId);
  if (!owned) return apiError("NOT_FOUND", "Reporte no encontrado", 404);
  await db.delete(scheduledReports).where(eq(scheduledReports.id, id));
  return apiSuccess({ deleted: true });
});
