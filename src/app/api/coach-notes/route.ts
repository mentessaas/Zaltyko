import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { coachNotes, athletes, profiles, guardianAthletes, guardians } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability, authorizeAthleteResource } from "@/lib/authz/resource-scope";
import { apiSuccess, apiError } from "@/lib/api-response";
import { createNotification } from "@/lib/notifications/notification-service";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  athleteId: z.string().uuid(),
  note: z.string().trim().min(1).max(10000),
  sharedWithParents: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).nullable().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const url = new URL(request.url);
  const athleteId = url.searchParams.get("athleteId");
  const academyId = url.searchParams.get("academyId");

  if (!athleteId && !academyId) {
    return apiError("ATHLETE_OR_ACADEMY_REQUIRED", "Indica un atleta o una academia", 400);
  }

  if (context.profile.role === "coach" && !athleteId) {
    return apiError(
      "ATHLETE_REQUIRED_FOR_COACH",
      "Los entrenadores deben consultar las notas de una gimnasta asignada",
      403,
    );
  }

  let onlySharedWithParents = false;

  if (athleteId) {
    const athleteScope = await authorizeAthleteResource({ context, athleteId });
    if (!athleteScope.resource) {
      // Keep resource existence opaque to callers outside the tenant/scope.
      if (context.profile.role !== "parent" && context.profile.role !== "athlete") {
        return apiError("ATHLETE_NOT_FOUND", "Atleta no encontrado", 404);
      }
    }

    if (context.profile.role === "parent") {
      const [linkedGuardian] = await db
        .select({ id: guardianAthletes.id })
        .from(guardianAthletes)
        .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
        .where(
          and(
            eq(guardianAthletes.tenantId, context.tenantId),
            eq(guardianAthletes.athleteId, athleteId),
            eq(guardians.tenantId, context.tenantId),
            eq(guardians.profileId, context.profile.id),
          ),
        )
        .limit(1);
      if (!linkedGuardian) {
        return apiError("NOTE_NOT_FOUND", "Notas no encontradas", 404);
      }
      onlySharedWithParents = true;
    } else if (context.profile.role === "athlete") {
      const [ownAthlete] = await db
        .select({ id: athletes.id })
        .from(athletes)
        .where(
          and(
            eq(athletes.id, athleteId),
            eq(athletes.tenantId, context.tenantId),
            eq(athletes.userId, context.profile.userId),
          ),
        )
        .limit(1);
      if (!ownAthlete) return apiError("NOTE_NOT_FOUND", "Notas no encontradas", 404);
      onlySharedWithParents = true;
    } else if (!athleteScope.allowed) {
      return apiError("NOTE_NOT_FOUND", "Notas no encontradas", 404);
    }
  } else if (academyId) {
    const academyScope = await authorizeAcademyCapability({
      context,
      resourceTenantId: context.tenantId,
      academyId,
      permission: "athletes:read",
    });
    if (!academyScope.allowed) {
      return apiError("NOTES_ACCESS_DENIED", "No tienes permiso para consultar estas notas", 403);
    }
  }

  const whereConditions = [eq(coachNotes.tenantId, context.tenantId)];
  if (athleteId) {
    whereConditions.push(eq(coachNotes.athleteId, athleteId));
  }
  if (academyId) {
    whereConditions.push(eq(coachNotes.academyId, academyId));
  }
  if (onlySharedWithParents) {
    whereConditions.push(eq(coachNotes.sharedWithParents, true));
  }

  const notes = await db
    .select({
      id: coachNotes.id,
      athleteId: coachNotes.athleteId,
      athleteName: athletes.name,
      note: coachNotes.note,
      sharedWithParents: coachNotes.sharedWithParents,
      tags: coachNotes.tags,
      createdAt: coachNotes.createdAt,
      authorId: coachNotes.authorId,
      authorName: profiles.name,
    })
    .from(coachNotes)
    .innerJoin(athletes, eq(coachNotes.athleteId, athletes.id))
    .leftJoin(profiles, eq(coachNotes.authorId, profiles.id))
    .where(and(...whereConditions))
    .orderBy(desc(coachNotes.createdAt))
    .limit(5000);

  return apiSuccess({
    items: notes.map((note) => ({
      id: note.id,
      athleteId: note.athleteId,
      athleteName: note.athleteName,
      note: note.note,
      sharedWithParents: note.sharedWithParents,
      tags: note.tags,
      createdAt: note.createdAt?.toISOString(),
      authorId: note.authorId,
      authorName: note.authorName || "Desconocido",
    })),
  });
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const profile = context.profile;

  const body = createSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("INVALID_PAYLOAD", "Payload inválido", 400);

  // Validar que el atleta existe y pertenece al tenant
  const [athlete] = await db
    .select({
      id: athletes.id,
      academyId: athletes.academyId,
    })
    .from(athletes)
    .where(and(eq(athletes.id, body.data.athleteId), eq(athletes.tenantId, context.tenantId)))
    .limit(1);

  if (!athlete) {
    return apiError("ATHLETE_NOT_FOUND", "Atleta no encontrado", 404);
  }

  // Crear nota
  const [newNote] = await db
    .insert(coachNotes)
    .values({
      tenantId: context.tenantId,
      academyId: athlete.academyId,
      athleteId: body.data.athleteId,
      authorId: profile.id,
      note: body.data.note,
      sharedWithParents: body.data.sharedWithParents,
      tags: body.data.tags || null,
    })
    .returning({ id: coachNotes.id });

  if (body.data.sharedWithParents) {
    try {
      const recipients = await db
        .select({ profileId: guardians.profileId })
        .from(guardianAthletes)
        .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
        .where(and(eq(guardianAthletes.tenantId, context.tenantId), eq(guardianAthletes.athleteId, body.data.athleteId), eq(guardians.tenantId, context.tenantId)))
        .limit(100);
      for (const recipient of recipients) {
        if (!recipient.profileId) continue;
        await createNotification({
          tenantId: context.tenantId,
          userId: recipient.profileId,
          type: "coach_note_shared",
          title: "Nueva actualización del entrenador",
          message: "Se ha compartido una nueva nota sobre tu atleta.",
          data: { noteId: newNote.id, athleteId: body.data.athleteId },
        });
      }
    } catch (error) {
      logger.warn("No se pudo notificar la nota compartida", { error, noteId: newNote.id });
    }
  }

  return apiSuccess({ ok: true, id: newNote.id });
});
