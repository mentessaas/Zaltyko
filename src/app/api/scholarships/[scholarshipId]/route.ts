import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { scholarships } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";

const updateSchema = z.object({
  athleteId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  discountType: z.enum(["percentage", "fixed"]).optional(),
  discountValue: z.number().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  autoRenew: z.boolean().optional(),
  requiredDocuments: z.array(z.string()).optional(),
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

  await db
    .delete(scholarships)
    .where(
      and(eq(scholarships.id, scholarshipId), eq(scholarships.tenantId, context.tenantId))
    );

  return apiSuccess({ ok: true });
});
