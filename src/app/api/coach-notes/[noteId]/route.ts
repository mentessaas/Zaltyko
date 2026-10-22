import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { coachNotes, guardianAthletes, guardians } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getUserPermissions } from "@/lib/authz/permissions-service";
import { authorizeAthleteResource } from "@/lib/authz/resource-scope";
import { createNotification } from "@/lib/notifications/notification-service";
import { logger } from "@/lib/logger";

const updateSchema = z.object({
  note: z.string().trim().min(1).max(10000),
  sharedWithParents: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).nullable().optional(),
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

  const body = updateSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("INVALID_PAYLOAD", "Payload inválido", 400);

  // Validar que la nota existe y pertenece al tenant
  const [noteRow] = await db
    .select({
      id: coachNotes.id,
      authorId: coachNotes.authorId,
      academyId: coachNotes.academyId,
      athleteId: coachNotes.athleteId,
      sharedWithParents: coachNotes.sharedWithParents,
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
      note: body.data.note,
      sharedWithParents: body.data.sharedWithParents,
      tags: body.data.tags || null,
      updatedAt: new Date(),
    })
    .where(eq(coachNotes.id, noteId));

  // Notificar solo cuando la nota pasa de privada a compartida.
  if (!noteRow.sharedWithParents && body.data.sharedWithParents) {
    try {
      const recipients = await db
        .select({ profileId: guardians.profileId })
        .from(guardianAthletes)
        .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
        .where(
          and(
            eq(guardianAthletes.tenantId, context.tenantId),
            eq(guardianAthletes.athleteId, noteRow.athleteId),
            eq(guardians.tenantId, context.tenantId),
          ),
        )
        .limit(100);
      for (const recipient of recipients) {
        if (!recipient.profileId) continue;
        await createNotification({
          tenantId: context.tenantId,
          userId: recipient.profileId,
          type: "coach_note_shared",
          title: "Nueva actualización del entrenador",
          message: "Se ha compartido una nueva nota sobre tu atleta.",
          data: { noteId, athleteId: noteRow.athleteId },
        });
      }
    } catch (error) {
      logger.warn("No se pudo notificar la nota compartida", { error, noteId });
    }
  }

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
