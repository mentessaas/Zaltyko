import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  conversationParticipants,
  conversations,
  groupAthletes,
  groups,
  guardianAthletes,
  guardians,
} from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";

export const dynamic = "force-dynamic";

export const POST = withTenant(async (_request, context) => {
  const groupId = (context.params as { groupId?: string } | undefined)?.groupId;

  if (!groupId) {
    return apiError("GROUP_ID_REQUIRED", "Group ID is required", 400);
  }

  const [group] = await db
    .select({
      id: groups.id,
      name: groups.name,
      tenantId: groups.tenantId,
      academyId: groups.academyId,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) {
    return apiError("GROUP_NOT_FOUND", "Grupo no encontrado", 404);
  }

  const canStartGroupConversation =
    context.profile.role === "super_admin" ||
    context.profile.role === "admin" ||
    context.profile.role === "owner" ||
    context.profile.role === "coach";

  if (
    !canStartGroupConversation ||
    (context.profile.role !== "super_admin" && group.tenantId !== context.tenantId)
  ) {
    return apiError("FORBIDDEN", "No tienes permiso para iniciar esta conversacion", 403);
  }

  const groupMembers = await db
    .select({ athleteId: groupAthletes.athleteId })
    .from(groupAthletes)
    .where(eq(groupAthletes.groupId, group.id));

  const athleteIds = groupMembers.map((member) => member.athleteId);

  if (athleteIds.length === 0) {
    return apiError("GROUP_EMPTY", "Este grupo no tiene gimnastas asignados", 409);
  }

  const guardianRows = await db
    .select({
      guardianId: guardians.id,
      profileId: guardians.profileId,
    })
    .from(guardianAthletes)
    .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
    .where(
      and(
        inArray(guardianAthletes.athleteId, athleteIds),
        eq(guardians.tenantId, group.tenantId),
        sql`${guardians.profileId} IS NOT NULL`
      )
    );

  const guardianProfileIds = Array.from(
    new Set(
      guardianRows
        .map((guardian) => guardian.profileId)
        .filter((profileId): profileId is string => Boolean(profileId))
    )
  );

  if (guardianProfileIds.length === 0) {
    return apiError(
      "NO_PORTAL_GUARDIANS",
      "No hay tutores con acceso al portal en este grupo",
      409
    );
  }

  const [existingConversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.tenantId, group.tenantId),
        eq(conversations.academyId, group.academyId),
        sql`${conversations.metadata}->>'type' = 'group'`,
        sql`${conversations.metadata}->>'context' = 'class'`,
        sql`${conversations.metadata}->>'groupId' = ${group.id}`
      )
    )
    .limit(1);

  if (existingConversation) {
    const participantRows = await db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, existingConversation.id));
    const existingParticipantIds = new Set(participantRows.map((row) => row.userId));
    const missingParticipantIds = [context.profile.id, ...guardianProfileIds].filter(
      (profileId) => !existingParticipantIds.has(profileId)
    );

    if (missingParticipantIds.length > 0) {
      await db.insert(conversationParticipants).values(
        missingParticipantIds.map((profileId) => ({
          conversationId: existingConversation.id,
          userId: profileId,
          role: profileId === context.profile.id ? "owner" : "member",
          notificationsEnabled: "true",
        }))
      );
    }

    return apiSuccess({
      conversationId: existingConversation.id,
      participantCount: existingParticipantIds.size + missingParticipantIds.length,
      alreadyExists: true,
    });
  }

  const [conversation] = await db
    .insert(conversations)
    .values({
      tenantId: group.tenantId,
      academyId: group.academyId,
      title: `Grupo · ${group.name}`,
      metadata: {
        type: "group",
        context: "class",
        groupId: group.id,
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
    ...guardianProfileIds.map((profileId) => ({
      conversationId: conversation.id,
      userId: profileId,
      role: "member",
      notificationsEnabled: "true",
    })),
  ]);

  return apiSuccess({
    conversationId: conversation.id,
    participantCount: guardianProfileIds.length + 1,
    alreadyExists: false,
  });
});
