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
import { withTransaction } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";
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

    if (missingParticipantIds.length === 0) {
      return apiSuccess({
        conversationId: existingConversation.id,
        participantCount: existingParticipantIds.size,
        alreadyExists: true,
      });
    }
  }

  const ensured = await withTransaction(async (tx) => {
    await lockAcademyOperationalWrites(tx, group.academyId);
    await assertAcademyOperationalWritable(group.tenantId, group.academyId, tx);

    const [currentGroup] = await tx
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(and(
        eq(groups.id, group.id),
        eq(groups.tenantId, group.tenantId),
        eq(groups.academyId, group.academyId),
        isNull(groups.deletedAt),
      ))
      .limit(1);
    if (!currentGroup) return { kind: "group-not-found" as const };

    const currentGroupMembers = await tx
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
      .where(and(
        eq(groupAthletes.groupId, currentGroup.id),
        eq(groupAthletes.tenantId, group.tenantId),
      ))
      .limit(5000);
    const currentAthleteIds = currentGroupMembers.map((member) => member.athleteId);
    if (currentAthleteIds.length === 0) return { kind: "group-empty" as const };

    const currentGuardianRows = await tx
      .select({ profileId: guardians.profileId })
      .from(guardianAthletes)
      .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
      .where(and(
        inArray(guardianAthletes.athleteId, currentAthleteIds),
        eq(guardianAthletes.tenantId, group.tenantId),
        eq(guardians.tenantId, group.tenantId),
        sql`${guardians.profileId} IS NOT NULL`
      ))
      .limit(5000);
    const currentGuardianProfileIds = Array.from(new Set(
      currentGuardianRows
        .map((guardian) => guardian.profileId)
        .filter((profileId): profileId is string => Boolean(profileId))
    ));
    if (currentGuardianProfileIds.length === 0) return { kind: "no-portal-guardians" as const };

    const [currentConversation] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(
        eq(conversations.tenantId, group.tenantId),
        eq(conversations.academyId, group.academyId),
        sql`${conversations.metadata}->>'type' = 'group'`,
        sql`${conversations.metadata}->>'context' = 'class'`,
        sql`${conversations.metadata}->>'groupId' = ${currentGroup.id}`
      ))
      .limit(1);

    let conversationId = currentConversation?.id;
    const alreadyExists = Boolean(conversationId);
    if (!conversationId) {
      const [createdConversation] = await tx
        .insert(conversations)
        .values({
          tenantId: group.tenantId,
          academyId: group.academyId,
          title: `Grupo · ${currentGroup.name}`,
          metadata: {
            type: "group",
            context: "class",
            groupId: currentGroup.id,
          } as typeof conversations.$inferInsert.metadata,
        })
        .returning({ id: conversations.id });
      conversationId = createdConversation.id;
    }

    const currentParticipantRows = await tx
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId))
      .limit(5000);
    const currentParticipantIds = new Set(currentParticipantRows.map((row) => row.userId));
    const desiredProfileIds = Array.from(new Set([context.profile.id, ...currentGuardianProfileIds]));
    const missingParticipantIds = desiredProfileIds.filter((profileId) => !currentParticipantIds.has(profileId));

    if (missingParticipantIds.length > 0) {
      await tx
        .insert(conversationParticipants)
        .values(missingParticipantIds.map((profileId) => ({
          conversationId,
          userId: profileId,
          role: profileId === context.profile.id ? "owner" : "member",
          notificationsEnabled: "true",
        })))
        .onConflictDoNothing();
    }

    const finalParticipantRows = await tx
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId))
      .limit(5000);

    return {
      kind: "ok" as const,
      conversationId,
      participantCount: finalParticipantRows.length,
      alreadyExists,
    };
  });

  if (ensured.kind === "group-not-found") {
    return apiError("GROUP_NOT_FOUND", "Grupo no encontrado", 404);
  }
  if (ensured.kind === "group-empty") {
    return apiError("GROUP_EMPTY", "Este grupo no tiene gimnastas asignados", 409);
  }
  if (ensured.kind === "no-portal-guardians") {
    return apiError("NO_PORTAL_GUARDIANS", "No hay tutores con acceso al portal en este grupo", 409);
  }

  return apiSuccess({
    conversationId: ensured.conversationId,
    participantCount: ensured.participantCount,
    alreadyExists: ensured.alreadyExists,
  });
});
