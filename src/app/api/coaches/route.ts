import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  classCoachAssignments,
  classes,
  coaches,
  memberships,
  profiles,
} from "@/db/schema";
import { withTenant } from "@/lib/authz";

const bodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  profileId: z.string().uuid().optional(),
});

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  includeAssignments: z
    .string()
    .transform((value) => value === "true" || value === "1")
    .optional(),
});

export const GET = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const params = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  if (!params.success) {
    return NextResponse.json({ error: "INVALID_FILTERS" }, { status: 400 });
  }

  const { academyId, includeAssignments } = params.data;

  if (!includeAssignments) {
    // Query optimizado sin assignments
    const coachRows = await db
      .select({
        id: coaches.id,
        name: coaches.name,
        email: coaches.email,
        phone: coaches.phone,
        academyId: coaches.academyId,
        academyName: academies.name,
        createdAt: coaches.createdAt,
      })
      .from(coaches)
      .innerJoin(academies, eq(coaches.academyId, academies.id))
      .where(academyId ? eq(coaches.academyId, academyId) : eq(coaches.tenantId, context.tenantId))
      .orderBy(asc(coaches.name));

    return NextResponse.json({ items: coachRows });
  }

  // Query optimizado con assignments usando LEFT JOIN
  const coachRowsWithAssignments = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
      phone: coaches.phone,
      academyId: coaches.academyId,
      academyName: academies.name,
      createdAt: coaches.createdAt,
      classId: classes.id,
      className: classes.name,
      classAcademyId: classes.academyId,
    })
    .from(coaches)
    .innerJoin(academies, eq(coaches.academyId, academies.id))
    .leftJoin(classCoachAssignments, eq(coaches.id, classCoachAssignments.coachId))
    .leftJoin(classes, eq(classCoachAssignments.classId, classes.id))
    .where(academyId ? eq(coaches.academyId, academyId) : eq(coaches.tenantId, context.tenantId))
    .orderBy(asc(coaches.name), asc(classes.name));

  // Agrupar clases por entrenador
  const grouped = coachRowsWithAssignments.reduce((acc, row) => {
    const existing = acc.find((item) => item.id === row.id);
    
    if (!existing) {
      acc.push({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        academyId: row.academyId,
        academyName: row.academyName,
        createdAt: row.createdAt,
        classes: row.classId
          ? [
              {
                id: row.classId,
                name: row.className ?? null,
                academyId: row.classAcademyId ?? null,
              },
            ]
          : [],
      });
    } else if (row.classId && !existing.classes.find((c) => c.id === row.classId)) {
      existing.classes.push({
        id: row.classId,
        name: row.className ?? null,
        academyId: row.classAcademyId ?? null,
      });
    }
    
    return acc;
  }, [] as Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    academyId: string;
    academyName: string | null;
    createdAt: Date | null;
    classes: Array<{ id: string; name: string | null; academyId: string | null }>;
  }>);

  return NextResponse.json({ items: grouped });
});

export const POST = withTenant(async (request, context) => {
  const body = bodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const coachId = crypto.randomUUID();

  await db.insert(coaches).values({
    id: coachId,
    tenantId: context.tenantId,
    academyId: body.academyId,
    name: body.name,
    email: body.email,
    phone: body.phone,
  });

  if (body.profileId) {
    const [linkedProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, body.profileId))
      .limit(1);

    if (!linkedProfile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    await db
      .insert(memberships)
      .values({
        id: crypto.randomUUID(),
        academyId: body.academyId,
        userId: linkedProfile.userId,
        role: "coach",
      })
      .onConflictDoNothing();
  }

  return NextResponse.json({ id: coachId });
});
