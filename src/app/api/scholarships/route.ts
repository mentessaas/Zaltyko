import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant, getCurrentProfile } from "@/lib/authz";

import { db } from "@/db";
import { scholarships, athletes } from "@/db/schema";

const createSchema = z.object({
  academyId: z.string().uuid(),
  athleteId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  discountType: z.enum(["percentage", "fixed"]).default("percentage"),
  discountValue: z.number().positive(),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const items = await db
    .select({
      id: scholarships.id,
      athleteId: scholarships.athleteId,
      athleteName: athletes.name,
      name: scholarships.name,
      description: scholarships.description,
      discountType: scholarships.discountType,
      discountValue: scholarships.discountValue,
      startDate: scholarships.startDate,
      endDate: scholarships.endDate,
      isActive: scholarships.isActive,
    })
    .from(scholarships)
    .innerJoin(athletes, eq(scholarships.athleteId, athletes.id))
    .where(
      and(eq(scholarships.academyId, academyId), eq(scholarships.tenantId, context.tenantId))
    );

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      discountValue: Number(item.discountValue),
    })),
  });
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = await getCurrentProfile(request);
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = createSchema.parse(await request.json());

  // Validar que el atleta existe
  const [athlete] = await db
    .select({ id: athletes.id })
    .from(athletes)
    .where(
      and(eq(athletes.id, body.athleteId), eq(athletes.tenantId, context.tenantId))
    )
    .limit(1);

  if (!athlete) {
    return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
  }

  const [newScholarship] = await db
    .insert(scholarships)
    .values({
      tenantId: context.tenantId,
      academyId: body.academyId,
      athleteId: body.athleteId,
      name: body.name,
      description: body.description || null,
      discountType: body.discountType,
      discountValue: body.discountValue.toString(),
      startDate: body.startDate,
      endDate: body.endDate || null,
      isActive: body.isActive,
      createdBy: profile.id,
    })
    .returning({ id: scholarships.id });

  return NextResponse.json({ ok: true, id: newScholarship.id });
});

