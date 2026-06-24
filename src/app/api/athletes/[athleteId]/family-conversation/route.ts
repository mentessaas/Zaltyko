import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athletes,
  conversationParticipants,
  conversations,
  guardianAthletes,
  guardians,
} from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  guardianId: z.string().uuid(),
});

export const POST = withTenant(async (request, context) => {
  const athleteId = (context.params as { athleteId?: string } | undefined)?.athleteId;

  if (!athleteId) {
    return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        "Datos invalidos",
        400,
        error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }))
      );
    }

    return apiError("INVALID_JSON", "JSON invalido", 400);
  }

  const [athlete] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      tenantId: athletes.tenantId,
      academyId: athletes.academyId,
    })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1);

  if (!athlete) {
    return apiError("ATHLETE_NOT_FOUND", "Gimnasta no encontrado", 404);
  }

  const canStartFamilyConversation =
    context.profile.role === "super_admin" ||
    context.profile.role === "admin" ||
    context.profile.role === "owner" ||
    context.profile.role === "coach";

  if (
    !canStartFamilyConversation ||
    (context.profile.role !== "super_admin" &&
      context.profile.role !== "admin" &&
      athlete.tenantId !== context.tenantId)
  ) {
    return apiError("FORBIDDEN", "No tienes permiso para iniciar esta conversacion", 403);
  }

  const [guardian] = await db
    .select({
      id: guardians.id,
      name: guardians.name,
      profileId: guardians.profileId,
      tenantId: guardians.tenantId,
      linkId: guardianAthletes.id,
    })
    .from(guardianAthletes)
    .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
    .where(
      and(
        eq(guardianAthletes.athleteId, athlete.id),
        eq(guardianAthletes.guardianId, body.guardianId)
      )
    )
    .limit(1);

  if (!guardian || guardian.tenantId !== athlete.tenantId) {
    return apiError("GUARDIAN_NOT_FOUND", "Tutor no vinculado a este gimnasta", 404);
  }

  if (!guardian.profileId) {
    return apiError(
      "GUARDIAN_PROFILE_REQUIRED",
      "Este tutor todavia no tiene acceso al portal",
      409
    );
  }

  const [existingConversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      conversationParticipants,
      eq(conversationParticipants.conversationId, conversations.id)
    )
    .where(
      and(
        eq(conversations.tenantId, athlete.tenantId),
        eq(conversations.academyId, athlete.academyId),
        eq(conversationParticipants.userId, guardian.profileId),
        sql`${conversations.metadata}->>'type' = 'group'`,
        sql`${conversations.metadata}->>'context' = 'general'`,
        sql`${conversations.metadata}->>'athleteId' = ${athlete.id}`,
        sql`${conversations.metadata}->>'guardianId' = ${guardian.id}`
      )
    )
    .limit(1);

  if (existingConversation) {
    const [currentParticipant] = await db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, existingConversation.id),
          eq(conversationParticipants.userId, context.profile.id)
        )
      )
      .limit(1);

    if (!currentParticipant) {
      await db.insert(conversationParticipants).values({
        conversationId: existingConversation.id,
        userId: context.profile.id,
        role: "owner",
        notificationsEnabled: "true",
      });
    }

    return apiSuccess({
      conversationId: existingConversation.id,
      alreadyExists: true,
    });
  }

  const [conversation] = await db
    .insert(conversations)
    .values({
      tenantId: athlete.tenantId,
      academyId: athlete.academyId,
      title: `${athlete.name} · ${guardian.name}`,
      metadata: {
        type: "group",
        context: "general",
        athleteId: athlete.id,
        guardianId: guardian.id,
      } as typeof conversations.$inferInsert.metadata,
    })
    .returning({ id: conversations.id });

  await db.insert(conversationParticipants).values([
    {
      conversationId: conversation.id,
      userId: context.profile.id,
      role: "owner",
      notificationsEnabled: "true",
    },
    {
      conversationId: conversation.id,
      userId: guardian.profileId,
      role: "member",
      notificationsEnabled: "true",
    },
  ]);

  return apiSuccess({
    conversationId: conversation.id,
    alreadyExists: false,
  });
});
