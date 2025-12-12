import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies, billingItems } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";

const CreateBillingItemSchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  amountCents: z.number().int().positive(),
  currency: z.string().default("EUR"),
  periodicity: z.enum(["one_time", "monthly", "yearly"]),
  isActive: z.boolean().default(true),
});

const UpdateBillingItemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  amountCents: z.number().int().positive().optional(),
  currency: z.string().optional(),
  periodicity: z.enum(["one_time", "monthly", "yearly"]).optional(),
  isActive: z.boolean().optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const academyId = url.searchParams.get("academyId");
    const isActive = url.searchParams.get("isActive");

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    if (!academyId) {
      return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
    }

    // Verify academy access
    const [academy] = await db
      .select({ id: academies.id, tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy || academy.tenantId !== context.tenantId) {
      return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
    }

    const conditions = [
      eq(billingItems.academyId, academyId),
      eq(billingItems.tenantId, context.tenantId),
    ];

    if (isActive !== null) {
      conditions.push(eq(billingItems.isActive, isActive === "true"));
    }

    const items = await db
      .select()
      .from(billingItems)
      .where(and(...conditions))
      .orderBy(asc(billingItems.name));

    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/billing-items", method: "GET" });
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = CreateBillingItemSchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify academy access
    const [academy] = await db
      .select({ id: academies.id, tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, body.academyId))
      .limit(1);

    if (!academy || academy.tenantId !== context.tenantId) {
      return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
    }

    const [item] = await db
      .insert(billingItems)
      .values({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        academyId: body.academyId,
        name: body.name,
        description: body.description ?? null,
        amountCents: body.amountCents,
        currency: body.currency,
        periodicity: body.periodicity,
        isActive: body.isActive,
      })
      .returning();

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/billing-items", method: "POST" });
  }
});

