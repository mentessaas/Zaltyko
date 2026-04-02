export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, classWaitingList, classes } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";
import { withTenant } from "@/lib/authz";

const AddToWaitingListSchema = z.object({
  classId: z.string().uuid(),
  athleteId: z.string().uuid(),
  notes: z.string().optional(),
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = AddToWaitingListSchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verificar que la clase existe
    const [classRow] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, body.classId), eq(classes.tenantId, context.tenantId)))
      .limit(1);

    if (!classRow) {
      return NextResponse.json({ error: "CLASS_NOT_FOUND" }, { status: 404 });
    }

    // Verificar que el atleta existe
    const [athlete] = await db
      .select()
      .from(athletes)
      .where(and(eq(athletes.id, body.athleteId), eq(athletes.tenantId, context.tenantId)))
      .limit(1);

    if (!athlete) {
      return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
    }

    // Verificar que no esté ya en la lista
    const [existing] = await db
      .select()
      .from(classWaitingList)
      .where(
        and(
          eq(classWaitingList.classId, body.classId),
          eq(classWaitingList.athleteId, body.athleteId)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({ error: "ALREADY_IN_WAITING_LIST" }, { status: 409 });
    }

    // Obtener la siguiente posición
    const [{ maxPosition }] = await db
      .select({ maxPosition: sql<number>`COALESCE(MAX(${classWaitingList.position}), 0)` })
      .from(classWaitingList)
      .where(eq(classWaitingList.classId, body.classId));

    const position = (maxPosition ?? 0) + 1;

    const entryId = crypto.randomUUID();

    await db.insert(classWaitingList).values({
      id: entryId,
      classId: body.classId,
      athleteId: body.athleteId,
      position,
      notes: body.notes ?? null,
    });

    return NextResponse.json({ ok: true, id: entryId, position });
  } catch (error) {
    return handleApiError(error);
  }
});

const filterSchema = z.object({
  classId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const filters = filterSchema.safeParse(Object.fromEntries(url.searchParams));

    if (!filters.success) {
      return handleApiError(filters.error);
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const { classId, page = 1, limit = 50 } = filters.data;

    const pageSize = Math.min(200, Math.max(1, limit));
    const offset = (page - 1) * pageSize;

    // Construir condiciones
    const conditions = [eq(classWaitingList.classId, classId ?? classWaitingList.classId)];

    // Obtener total
    const allEntries = await db
      .select({ id: classWaitingList.id })
      .from(classWaitingList)
      .where(conditions[0]);

    const total = allEntries.length;

    // Obtener entradas paginadas
    const entries = await db
      .select({
        id: classWaitingList.id,
        classId: classWaitingList.classId,
        athleteId: classWaitingList.athleteId,
        position: classWaitingList.position,
        addedAt: classWaitingList.addedAt,
        notes: classWaitingList.notes,
        athleteName: athletes.name,
        className: classes.name,
      })
      .from(classWaitingList)
      .leftJoin(athletes, eq(classWaitingList.athleteId, athletes.id))
      .leftJoin(classes, eq(classWaitingList.classId, classes.id))
      .where(conditions[0])
      .orderBy(asc(classWaitingList.position))
      .limit(pageSize)
      .offset(offset);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      items: entries.map((e) => ({
        id: e.id,
        classId: e.classId,
        athleteId: e.athleteId,
        position: e.position,
        addedAt: e.addedAt?.toISOString() ?? null,
        notes: e.notes,
        athleteName: e.athleteName,
        className: e.className,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
});
