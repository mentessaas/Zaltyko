import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  conversationParticipants,
  conversations,
  athletes,
  groupAthletes,
  groups,
  guardianAthletes,
  guardians,
} from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { verifyCoachAthleteScope } from "@/lib/permissions";

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
    .where(and(eq(groups.id, groupId), isNull(groups.deletedAt)))
    .limit(1);

  if (!group) {
    return apiError("GROUP_NOT_FOUND", "Grupo no encontrado", 404);
  }

  const canStartGroupConversation = ["super_admin", "admin", "owner", "coach"].includes(
    context.profile.role
  );

  if (!canStartGroupConversation) {
    return apiError("FORBIDDEN", "No tienes permiso para iniciar esta conversacion", 403);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: group.tenantId,
    academyId: group.academyId,
    permission: "communications:send",
  });

  if (!scope.allowed) {
    return apiError(scope.reason ?? "FORBIDDEN", "No tienes permiso para iniciar esta conversacion", 403);
  }

  const groupMembers = await db
    .select({ athleteId: groupAthletes.athleteId })
    .from(groupAthletes)
    .innerJoin(
      athletes,
      and(
        eq(groupAthletes.athleteId, athletes.id),
        eq(athletes.tenantId, group.tenantId),
        eq(athletes.academyId, group.academyId),
        eq(athletes.status, "active"),
        isNull(athletes.deletedAt)
      )
    )
    .where(
      and(
        eq(groupAthletes.groupId, group.id),
        eq(groupAthletes.tenantId, group.tenantId)
      )
    )
    .limit(5000);

  const athleteIds = groupMembers.map((member) => member.athleteId);

  if (athleteIds.length === 0) {
    return apiError("GROUP_EMPTY", "Este grupo no tiene gimnastas asignados", 409);
  }

  if (context.profile.role === "coach") {
    const coachScope = await verifyCoachAthleteScope({
      tenantId: group.tenantId,
      academyId: group.academyId,
      athleteId: athleteIds[0],
      profile: context.profile,
    });

    if (!coachScope.allowed) {
      return apiError("FORBIDDEN", "No tienes permiso sobre este grupo", 403);
    }
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
        eq(guardianAthletes.tenantId, group.tenantId),
        eq(guardians.tenantId, group.tenantId),
        sql`${guardians.profileId} IS NOT NULL`
      )
    )
    .limit(5000);

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
      .where(eq(conversationParticipants.conversationId, existingConversation.id))
      .limit(5000);
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
