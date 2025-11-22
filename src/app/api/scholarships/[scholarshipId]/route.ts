import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/authz";

import { db } from "@/db";
import { scholarships } from "@/db/schema";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  discountType: z.enum(["percentage", "fixed"]).optional(),
  discountValue: z.number().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const PUT = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const scholarshipId = (context.params as { scholarshipId?: string } | undefined)
    ?.scholarshipId;

  if (!scholarshipId) {
    return NextResponse.json({ error: "SCHOLARSHIP_ID_REQUIRED" }, { status: 400 });
  }

  const body = updateSchema.parse(await request.json());

  const updateData: any = {
    updatedAt: new Date(),
  };

  if (body.name) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description || null;
  if (body.discountType) updateData.discountType = body.discountType;
  if (body.discountValue) updateData.discountValue = body.discountValue.toString();
  if (body.startDate) updateData.startDate = body.startDate;
  if (body.endDate !== undefined) updateData.endDate = body.endDate || null;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  await db
    .update(scholarships)
    .set(updateData)
    .where(
      and(eq(scholarships.id, scholarshipId), eq(scholarships.tenantId, context.tenantId))
    );

  return NextResponse.json({ ok: true });
});

export const DELETE = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const scholarshipId = (context.params as { scholarshipId?: string } | undefined)
    ?.scholarshipId;

  if (!scholarshipId) {
    return NextResponse.json({ error: "SCHOLARSHIP_ID_REQUIRED" }, { status: 400 });
  }

  await db
    .delete(scholarships)
    .where(
      and(eq(scholarships.id, scholarshipId), eq(scholarships.tenantId, context.tenantId))
    );

  return NextResponse.json({ ok: true });
});

