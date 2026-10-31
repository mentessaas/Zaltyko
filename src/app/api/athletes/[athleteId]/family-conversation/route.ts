import { and, eq, isNull, sql } from "drizzle-orm";
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
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { withTransaction } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";
import { verifyCoachAthleteScope } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  guardianId: z.guid(),
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
    .where(and(eq(athletes.id, athleteId), isNull(athletes.deletedAt)))
    .limit(1);

  if (!athlete) {
    return apiError("ATHLETE_NOT_FOUND", "Gimnasta no encontrado", 404);
  }

  const canStartFamilyConversation =
    context.profile.role === "super_admin" ||
    context.profile.role === "admin" ||
    context.profile.role === "owner" ||
    context.profile.role === "coach";

  if (!canStartFamilyConversation) {
    return apiError("FORBIDDEN", "No tienes permiso para iniciar esta conversacion", 403);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: athlete.tenantId,
    academyId: athlete.academyId,
    permission: "communications:send",
  });

  if (!scope.allowed) {
    return apiError(scope.reason ?? "FORBIDDEN", "No tienes permiso para iniciar esta conversacion", 403);
  }

  if (context.profile.role === "coach") {
    const coachScope = await verifyCoachAthleteScope({
      tenantId: athlete.tenantId,
      academyId: athlete.academyId,
      athleteId: athlete.id,
      profile: context.profile,
    });

    if (!coachScope.allowed) {
      return apiError("FORBIDDEN", "No tienes permiso sobre este gimnasta", 403);
    }
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
        eq(guardianAthletes.guardianId, body.guardianId),
        eq(guardianAthletes.tenantId, athlete.tenantId),
        eq(guardians.tenantId, athlete.tenantId)
      )
    )
    .limit(1);

  if (!guardian || guardian.tenantId !== athlete.tenantId) {
    return apiError("GUARDIAN_NOT_FOUND", "Tutor no vinculado a este gimnasta", 404);
  }

  if (!guardian.profileId) {
    return apiError(
      "GUARDIAN_PROFILE_REQUIRED",
      "Este tutor todavía no tiene acceso al portal",
      409
    );
  }

  const [existingConversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.tenantId, athlete.tenantId),
        eq(conversations.academyId, athlete.academyId),
        sql`${conversations.metadata}->>'type' = 'group'`,
        sql`${conversations.metadata}->>'context' = 'general'`,
        sql`${conversations.metadata}->>'athleteId' = ${athlete.id}`,
        sql`${conversations.metadata}->>'guardianId' = ${guardian.id}`
      )
    )
    .limit(1);

  if (existingConversation) {
    const currentParticipants = await db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, existingConversation.id));
    const hasOwner = currentParticipants.some((participant) => participant.userId === context.profile.id);
    const hasGuardian = currentParticipants.some((participant) => participant.userId === guardian.profileId);
    if (hasOwner && hasGuardian) {
      return apiSuccess({ conversationId: existingConversation.id, alreadyExists: true });
    }
  }

  const ensured = await withTransaction(async (tx) => {
    await lockAcademyOperationalWrites(tx, athlete.academyId);
    await assertAcademyOperationalWritable(athlete.tenantId, athlete.academyId, tx);

    const [currentAthlete] = await tx
      .select({ id: athletes.id, name: athletes.name })
      .from(athletes)
      .where(and(
        eq(athletes.id, athlete.id),
        eq(athletes.tenantId, athlete.tenantId),
        eq(athletes.academyId, athlete.academyId),
        isNull(athletes.deletedAt),
      ))
      .limit(1);
    if (!currentAthlete) return { kind: "athlete-not-found" as const };

    const [currentGuardian] = await tx
      .select({
        id: guardians.id,
        name: guardians.name,
        profileId: guardians.profileId,
      })
      .from(guardianAthletes)
      .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
      .where(and(
        eq(guardianAthletes.athleteId, currentAthlete.id),
        eq(guardianAthletes.guardianId, guardian.id),
        eq(guardianAthletes.tenantId, athlete.tenantId),
        eq(guardians.tenantId, athlete.tenantId),
      ))
      .limit(1);
    if (!currentGuardian) return { kind: "guardian-not-found" as const };
    if (!currentGuardian.profileId) return { kind: "guardian-profile-required" as const };

    const [conversation] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(
        eq(conversations.tenantId, athlete.tenantId),
        eq(conversations.academyId, athlete.academyId),
        sql`${conversations.metadata}->>'type' = 'group'`,
        sql`${conversations.metadata}->>'context' = 'general'`,
        sql`${conversations.metadata}->>'athleteId' = ${currentAthlete.id}`,
        sql`${conversations.metadata}->>'guardianId' = ${currentGuardian.id}`,
      ))
      .limit(1);

    const alreadyExists = Boolean(conversation);
    const [created] = conversation
      ? [conversation]
      : await tx
          .insert(conversations)
          .values({
            tenantId: athlete.tenantId,
            academyId: athlete.academyId,
            title: `${currentAthlete.name} · ${currentGuardian.name}`,
            metadata: {
              type: "group",
              context: "general",
              athleteId: currentAthlete.id,
              guardianId: currentGuardian.id,
            } as typeof conversations.$inferInsert.metadata,
          })
          .returning({ id: conversations.id });

    const participants = await tx
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, created.id));
    const participantIds = new Set(participants.map((participant) => participant.userId));
    const wanted = [
      { userId: context.profile.id, role: "owner" as const },
      ...(currentGuardian.profileId === context.profile.id
        ? []
        : [{ userId: currentGuardian.profileId, role: "member" as const }]),
    ];
    const missing = wanted.filter((participant) => !participantIds.has(participant.userId));
    if (missing.length > 0) {
      await tx
        .insert(conversationParticipants)
        .values(missing.map((participant) => ({
          conversationId: created.id,
          userId: participant.userId,
          role: participant.role,
          notificationsEnabled: "true",
        })))
        .onConflictDoNothing();
    }

    return { kind: "ok" as const, conversationId: created.id, alreadyExists };
  });

  if (ensured.kind === "athlete-not-found") {
    return apiError("ATHLETE_NOT_FOUND", "Gimnasta no encontrado", 404);
  }
  if (ensured.kind === "guardian-not-found") {
    return apiError("GUARDIAN_NOT_FOUND", "Tutor no vinculado a este gimnasta", 404);
  }
  if (ensured.kind === "guardian-profile-required") {
    return apiError("GUARDIAN_PROFILE_REQUIRED", "Este tutor todavía no tiene acceso al portal", 409);
  }

  return apiSuccess({ conversationId: ensured.conversationId, alreadyExists: ensured.alreadyExists });
});
