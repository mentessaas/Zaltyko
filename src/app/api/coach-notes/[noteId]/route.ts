import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { coachNotes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getUserPermissions } from "@/lib/authz/permissions-service";
import { authorizeAthleteResource } from "@/lib/authz/resource-scope";

const updateSchema = z.object({
  note: z.string().min(1),
  sharedWithParents: z.boolean().default(false),
  tags: z.array(z.string()).nullable().optional(),
});

export const PUT = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const profile = context.profile;

  const noteId = (context.params as { noteId?: string } | undefined)?.noteId;

  if (!noteId) {
    return apiError("NOTE_ID_REQUIRED", "ID de nota requerido", 400);
  }

  const body = updateSchema.parse(await request.json());

  // Validar que la nota existe y pertenece al tenant
  const [noteRow] = await db
    .select({
      id: coachNotes.id,
      authorId: coachNotes.authorId,
      academyId: coachNotes.academyId,
      athleteId: coachNotes.athleteId,
    })
    .from(coachNotes)
    .where(and(eq(coachNotes.id, noteId), eq(coachNotes.tenantId, context.tenantId)))
    .limit(1);

  if (!noteRow) {
    return apiError("NOTE_NOT_FOUND", "Nota no encontrada", 404);
  }
  const athleteScope = await authorizeAthleteResource({ context, athleteId: noteRow.athleteId });
  if (!athleteScope.allowed) return apiError("NOTE_NOT_FOUND", "Nota no encontrada", 404);

  // Solo el autor puede editar (o admin)
  const permissions = await getUserPermissions(context.userId, noteRow.academyId);
  if (
    noteRow.authorId !== profile.id &&
    profile.role !== "super_admin" &&
    !permissions.isOwner
  ) {
    return apiError("FORBIDDEN", "Prohibido", 403);
  }

  // Actualizar nota
  await db
    .update(coachNotes)
    .set({
      note: body.note,
      sharedWithParents: body.sharedWithParents,
      tags: body.tags || null,
      updatedAt: new Date(),
    })
    .where(eq(coachNotes.id, noteId));

  // TODO: Si sharedWithParents cambió a true, enviar notificación a padres

  return apiSuccess({ ok: true });
});

export const DELETE = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const profile = context.profile;

  const noteId = (context.params as { noteId?: string } | undefined)?.noteId;

  if (!noteId) {
    return apiError("NOTE_ID_REQUIRED", "ID de nota requerido", 400);
  }

  // Validar que la nota existe y pertenece al tenant
  const [noteRow] = await db
    .select({
      id: coachNotes.id,
      authorId: coachNotes.authorId,
      academyId: coachNotes.academyId,
      athleteId: coachNotes.athleteId,
    })
    .from(coachNotes)
    .where(and(eq(coachNotes.id, noteId), eq(coachNotes.tenantId, context.tenantId)))
    .limit(1);

  if (!noteRow) {
    return apiError("NOTE_NOT_FOUND", "Nota no encontrada", 404);
  }
  const athleteScope = await authorizeAthleteResource({ context, athleteId: noteRow.athleteId });
  if (!athleteScope.allowed) return apiError("NOTE_NOT_FOUND", "Nota no encontrada", 404);

  // Solo el autor puede eliminar (o admin)
  const permissions = await getUserPermissions(context.userId, noteRow.academyId);
  if (
    noteRow.authorId !== profile.id &&
    profile.role !== "super_admin" &&
    !permissions.isOwner
  ) {
    return apiError("FORBIDDEN", "Prohibido", 403);
  }

  // Eliminar nota
  await db.delete(coachNotes).where(eq(coachNotes.id, noteId));

  return apiSuccess({ ok: true });
});
