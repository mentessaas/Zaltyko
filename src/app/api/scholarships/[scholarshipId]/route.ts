import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { scholarships } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";

// PR 10 (Operate P2): `.nullable().optional()` en campos de texto/uuid/number
// que el form de edición de beca puede limpiar (clear field). Antes, `null`
// → 400. Booleans (`autoRenew`/`isActive`) y `endDate` ya estaban correctos.
const updateSchema = z.object({
  athleteId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).nullable().optional(),
  description: z.string().nullable().optional(),
  discountType: z.enum(["percentage", "fixed"]).nullable().optional(),
  discountValue: z.number().positive().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  autoRenew: z.boolean().optional(),
  requiredDocuments: z.array(z.string()).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const PUT = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const scholarshipId = (context.params as { scholarshipId?: string } | undefined)
    ?.scholarshipId;

  if (!scholarshipId) {
    return apiError("SCHOLARSHIP_ID_REQUIRED", "ID de beca requerido", 400);
  }

  const body = updateSchema.parse(await request.json());
  const [resource] = await db
    .select({ tenantId: scholarships.tenantId, academyId: scholarships.academyId })
    .from(scholarships)
    .where(eq(scholarships.id, scholarshipId))
    .limit(1);
  if (!resource) return apiError("SCHOLARSHIP_NOT_FOUND", "Beca no encontrada", 404);
  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: resource.tenantId,
    academyId: resource.academyId,
    permission: "billing:update",
  });
  if (!scope.allowed) return apiError("SCHOLARSHIP_NOT_FOUND", "Beca no encontrada", 404);

  const updateData: any = {
    updatedAt: new Date(),
  };

  if (body.athleteId) updateData.athleteId = body.athleteId;
  if (body.name) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description || null;
  if (body.discountType) updateData.discountType = body.discountType;
  if (body.discountValue) updateData.discountValue = body.discountValue.toString();
  if (body.startDate) updateData.startDate = body.startDate;
  if (body.endDate !== undefined) updateData.endDate = body.endDate || null;
  if (body.autoRenew !== undefined) updateData.autoRenew = body.autoRenew;
  if (body.requiredDocuments !== undefined) updateData.requiredDocuments = body.requiredDocuments;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  await db
    .update(scholarships)
    .set(updateData)
    .where(
      and(eq(scholarships.id, scholarshipId), eq(scholarships.tenantId, context.tenantId))
    );

  return apiSuccess({ ok: true });
});

export const DELETE = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const scholarshipId = (context.params as { scholarshipId?: string } | undefined)
    ?.scholarshipId;

  if (!scholarshipId) {
    return apiError("SCHOLARSHIP_ID_REQUIRED", "ID de beca requerido", 400);
  }
  const [resource] = await db
    .select({ tenantId: scholarships.tenantId, academyId: scholarships.academyId })
    .from(scholarships)
    .where(eq(scholarships.id, scholarshipId))
    .limit(1);
  if (!resource) return apiError("SCHOLARSHIP_NOT_FOUND", "Beca no encontrada", 404);
  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: resource.tenantId,
    academyId: resource.academyId,
    permission: "billing:update",
  });
  if (!scope.allowed) return apiError("SCHOLARSHIP_NOT_FOUND", "Beca no encontrada", 404);

  await db
    .delete(scholarships)
    .where(
      and(eq(scholarships.id, scholarshipId), eq(scholarships.tenantId, context.tenantId))
    );

  return apiSuccess({ ok: true });
});
