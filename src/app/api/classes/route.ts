import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, classCoachAssignments, classes, coaches } from "@/db/schema";
import { assertWithinPlanLimits } from "@/lib/limits";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess } from "@/lib/permissions";

const bodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  weekday: z.number().int().min(0).max(6).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  capacity: z.number().int().positive().optional(),
});

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  includeAssignments: z
    .string()
    .transform((value) => value === "true" || value === "1")
    .optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const params = querySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    if (!params.success) {
      return handleApiError(params.error);
    }

  const { academyId, includeAssignments } = params.data;

  if (!includeAssignments) {
    // Query optimizado sin assignments
    const classRows = await db
      .select({
        id: classes.id,
        name: classes.name,
        academyId: classes.academyId,
        academyName: academies.name,
        weekday: classes.weekday,
        startTime: classes.startTime,
        endTime: classes.endTime,
        capacity: classes.capacity,
        createdAt: classes.createdAt,
      })
      .from(classes)
      .innerJoin(academies, eq(classes.academyId, academies.id))
      .where(academyId ? eq(classes.academyId, academyId) : eq(classes.tenantId, context.tenantId))
      .orderBy(asc(classes.name));

    return NextResponse.json({ items: classRows });
  }

  // Query optimizado con assignments usando LEFT JOIN y agregación
  const classRowsWithAssignments = await db
    .select({
      id: classes.id,
      name: classes.name,
      academyId: classes.academyId,
      academyName: academies.name,
      weekday: classes.weekday,
      startTime: classes.startTime,
      endTime: classes.endTime,
      capacity: classes.capacity,
      createdAt: classes.createdAt,
      coachId: coaches.id,
      coachName: coaches.name,
      coachEmail: coaches.email,
    })
    .from(classes)
    .innerJoin(academies, eq(classes.academyId, academies.id))
    .leftJoin(classCoachAssignments, eq(classes.id, classCoachAssignments.classId))
    .leftJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
    .where(academyId ? eq(classes.academyId, academyId) : eq(classes.tenantId, context.tenantId))
    .orderBy(asc(classes.name), asc(coaches.name));

  // Agrupar coaches por clase
  const grouped = classRowsWithAssignments.reduce((acc, row) => {
    const existing = acc.find((item) => item.id === row.id);
    
    if (!existing) {
      acc.push({
        id: row.id,
        name: row.name,
        academyId: row.academyId,
        academyName: row.academyName,
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
        capacity: row.capacity,
        createdAt: row.createdAt,
        coaches: row.coachId
          ? [
              {
                id: row.coachId,
                name: row.coachName ?? null,
                email: row.coachEmail ?? null,
              },
            ]
          : [],
      });
    } else if (row.coachId && !existing.coaches.find((c) => c.id === row.coachId)) {
      existing.coaches.push({
        id: row.coachId,
        name: row.coachName ?? null,
        email: row.coachEmail ?? null,
      });
    }
    
    return acc;
  }, [] as Array<{
    id: string;
    name: string;
    academyId: string;
    academyName: string | null;
    weekday: number | null;
    startTime: string | null;
    endTime: string | null;
    capacity: number | null;
    createdAt: Date | null;
    coaches: Array<{ id: string; name: string | null; email: string | null }>;
  }>);

    return NextResponse.json({ items: grouped });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = bodySchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verificar acceso a la academia
    const academyAccess = await verifyAcademyAccess(body.academyId, context.tenantId);
    if (!academyAccess.allowed) {
      return NextResponse.json({ error: academyAccess.reason ?? "ACADEMY_ACCESS_DENIED" }, { status: 403 });
    }

    await assertWithinPlanLimits(context.tenantId, body.academyId, "classes");

    await db.insert(classes).values({
      id: crypto.randomUUID(),
      tenantId: context.tenantId,
      academyId: body.academyId,
      name: body.name,
      weekday: body.weekday ?? null,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      capacity: body.capacity ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});
