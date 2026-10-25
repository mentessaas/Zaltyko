export const dynamic = 'force-dynamic';

import { apiSuccess, apiError } from "@/lib/api-response";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, classWaitingList, classes } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";
import { withTenant } from "@/lib/authz";
import { withTransaction } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";

const AddToWaitingListSchema = z.object({
  classId: z.string().uuid(),
  athleteId: z.string().uuid(),
  notes: z.string().optional(),
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = AddToWaitingListSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Resolve the lock key first, then re-read the class and athlete after the
    // academy lock so a concurrent archive cannot leave a partial waitlist row.
    const [candidateClass] = await db
      .select({ academyId: classes.academyId })
      .from(classes)
      .where(and(eq(classes.id, body.classId), eq(classes.tenantId, context.tenantId), isNull(classes.deletedAt)))
      .limit(1);

    if (!candidateClass) {
      return apiError("CLASS_NOT_FOUND", "Class not found", 404);
    }

    const outcome = await withTransaction(async (tx) => {
      await lockAcademyOperationalWrites(tx, candidateClass.academyId);
      await assertAcademyOperationalWritable(context.tenantId!, candidateClass.academyId, tx);

      const [classRow] = await tx
      .select()
      .from(classes)
      .where(and(eq(classes.id, body.classId), eq(classes.tenantId, context.tenantId!), eq(classes.academyId, candidateClass.academyId), isNull(classes.deletedAt)))
      .limit(1);

      if (!classRow) return { kind: "class_missing" as const };

      const [athlete] = await tx
      .select()
      .from(athletes)
      .where(and(
        eq(athletes.id, body.athleteId),
        eq(athletes.tenantId, context.tenantId!),
        eq(athletes.academyId, classRow.academyId),
        isNull(athletes.deletedAt),
        eq(athletes.status, "active"),
      ))
      .limit(1);

      if (!athlete) return { kind: "athlete_missing" as const };

      const [existing] = await tx
      .select()
      .from(classWaitingList)
      .where(
        and(
          eq(classWaitingList.classId, body.classId),
          eq(classWaitingList.athleteId, body.athleteId),
          eq(classWaitingList.tenantId, context.tenantId!),
        )
      )
      .limit(1);

      if (existing) return { kind: "already_listed" as const };

      const [{ maxPosition }] = await tx
      .select({ maxPosition: sql<number>`COALESCE(MAX(${classWaitingList.position}), 0)` })
      .from(classWaitingList)
      .where(and(eq(classWaitingList.classId, body.classId), eq(classWaitingList.tenantId, context.tenantId!)));

      const position = (maxPosition ?? 0) + 1;

      const entryId = crypto.randomUUID();

      const [createdEntry] = await tx.insert(classWaitingList).values({
        id: entryId,
        tenantId: context.tenantId!,
        academyId: classRow.academyId,
        classId: body.classId,
        athleteId: body.athleteId,
        position,
        notes: body.notes ?? null,
      }).onConflictDoNothing({ target: [classWaitingList.tenantId, classWaitingList.classId, classWaitingList.athleteId] }).returning({ id: classWaitingList.id, position: classWaitingList.position });

      if (!createdEntry) return { kind: "already_listed" as const };
      return { kind: "created" as const, id: createdEntry.id, position: createdEntry.position };
    });

    if (outcome.kind === "class_missing") return apiError("CLASS_NOT_FOUND", "Class not found", 404);
    if (outcome.kind === "athlete_missing") return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    if (outcome.kind === "already_listed") return apiError("ALREADY_IN_WAITING_LIST", "Already in waiting list", 409);

    return apiSuccess({ ok: true, id: outcome.id, position: outcome.position });
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
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const { classId, page = 1, limit = 50 } = filters.data;

    const pageSize = Math.min(200, Math.max(1, limit));
    const offset = (page - 1) * pageSize;

    const conditions = classId
      ? and(eq(classWaitingList.tenantId, context.tenantId), eq(classWaitingList.classId, classId))
      : eq(classWaitingList.tenantId, context.tenantId);

    if (classId) {
      const [classRow] = await db
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.id, classId), eq(classes.tenantId, context.tenantId)))
        .limit(1);

      if (!classRow) {
        return apiError("CLASS_NOT_FOUND", "Class not found", 404);
      }
    }

    // Obtener total sin cargar toda la lista en memoria.
    const [{ total }] = await db
      .select({ total: count(classWaitingList.id) })
      .from(classWaitingList)
      .where(conditions)
    const totalCount = Number(total ?? 0);

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
      .leftJoin(
        athletes,
        and(eq(classWaitingList.athleteId, athletes.id), eq(athletes.tenantId, context.tenantId))
      )
      .leftJoin(
        classes,
        and(eq(classWaitingList.classId, classes.id), eq(classes.tenantId, context.tenantId))
      )
      .where(conditions)
      .orderBy(asc(classWaitingList.position))
      .limit(pageSize)
      .offset(offset);

    const totalPages = Math.ceil(totalCount / pageSize);

    return apiSuccess({
      total: totalCount,
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
