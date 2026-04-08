import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { classCoachAssignments, coaches } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { withTransaction } from "@/lib/db-transactions";
import { apiSuccess, apiError } from "@/lib/api-response";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  isPublic: z.boolean().optional(),
  specialties: z.array(z.string()).optional().nullable(),
});

async function getCoach(coachId: string) {
  const [row] = await db
    .select({
      id: coaches.id,
      tenantId: coaches.tenantId,
    })
    .from(coaches)
    .where(eq(coaches.id, coachId))
    .limit(1);

  return row ?? null;
}

export const PATCH = withTenant(async (request, context) => {
  const params = context.params as { coachId?: string };
  const coachId = params?.coachId;

  if (!coachId) {
    return apiError("COACH_ID_REQUIRED", "coachId es requerido", 400);
  }

  const coach = await getCoach(coachId);

  if (!coach) {
    return apiError("COACH_NOT_FOUND", "Coach no encontrado", 404);
  }

  if (
    context.profile.role !== "super_admin" &&
    coach.tenantId !== context.tenantId
  ) {
    return apiError("FORBIDDEN", "No tienes permisos para actualizar este coach", 403);
  }

  const body = UpdateSchema.parse(await request.json());

  if (Object.keys(body).length === 0) {
    return apiSuccess({ ok: true });
  }

  await db
    .update(coaches)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.email !== undefined ? { email: body.email ?? null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
      ...(body.bio !== undefined ? { bio: body.bio ?? null } : {}),
      ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl ?? null } : {}),
      ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
      ...(body.specialties !== undefined ? { specialties: body.specialties ?? null } : {}),
    })
    .where(eq(coaches.id, coachId));

  return apiSuccess({ ok: true });
});

export const DELETE = withTenant(async (_request, context) => {
  const params = context.params as { coachId?: string };
  const coachId = params?.coachId;

  if (!coachId) {
    return apiError("COACH_ID_REQUIRED", "coachId es requerido", 400);
  }

  const coach = await getCoach(coachId);

  if (!coach) {
    return apiError("COACH_NOT_FOUND", "Coach no encontrado", 404);
  }

  if (
    context.profile.role !== "super_admin" &&
    coach.tenantId !== context.tenantId
  ) {
    return apiError("FORBIDDEN", "No tienes permisos para eliminar este coach", 403);
  }

  // Use transaction to ensure atomicity: delete assignments first, then coach
  await withTransaction(async (tx) => {
    await tx.delete(classCoachAssignments).where(eq(classCoachAssignments.coachId, coachId));
    await tx.delete(coaches).where(eq(coaches.id, coachId));
  });

  return apiSuccess({ ok: true });
});


