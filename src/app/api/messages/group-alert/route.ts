import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { NextResponse } from "next/server";

import { db } from "@/db";
import {
  athletes,
  classEnrollments,
  classSessions,
  classes,
  guardianAthletes,
  guardians,
  groupAthletes,
  groups,
  memberships,
  profiles,
} from "@/db/schema";
import {
  conversationMessages,
  conversationParticipants,
  conversations,
} from "@/db/schema/direct-messages";
import { apiCreated, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications/notification-service";
import { sendPushToUser } from "@/lib/notifications/push-service";
import { verifyCoachClassScope } from "@/lib/permissions";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const GroupAlertSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().trim().min(1).max(2000),
}).strict();

const AcademyQuerySchema = z.object({ academyId: z.string().uuid() });

const groupAlertHandler = withTenant(async (request, context) => {
  const query = AcademyQuerySchema.safeParse({
    academyId: new URL(request.url).searchParams.get("academyId"),
  });
  if (!query.success) {
    return apiError("VALIDATION_ERROR", "Academia inválida", 400, query.error.flatten());
  }

  let payload: z.infer<typeof GroupAlertSchema>;
  try {
    payload = GroupAlertSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Aviso inválido", 400, error.flatten());
    }
    return apiError("INVALID_JSON", "JSON inválido", 400);
  }

  const academyId = query.data.academyId;
  const tenantId = context.tenantId;

  const [session] = await db
    .select({
      id: classSessions.id,
      classId: classSessions.classId,
      className: classes.name,
      sessionDate: classSessions.sessionDate,
      groupId: classes.groupId,
      groupName: groups.name,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .leftJoin(groups, eq(classes.groupId, groups.id))
    .where(
      and(
        eq(classSessions.id, payload.sessionId),
        eq(classSessions.tenantId, tenantId),
        eq(classes.tenantId, tenantId),
        eq(classes.academyId, academyId),
        isNull(classes.deletedAt)
      )
    )
    .limit(1);

  if (!session) {
    return apiError("NOT_FOUND", "Sesión no encontrada en esta academia", 404);
  }

  const scope = await verifyCoachClassScope({
    tenantId,
    academyId,
    classId: session.classId,
    profile: context.profile,
  });
  if (!scope.allowed) {
    return apiError("FORBIDDEN", "No puedes enviar avisos para esta clase", 403, {
      reason: scope.reason,
    });
  }

  const [enrolledAthletes, groupedAthletes] = await Promise.all([
    db
      .select({ athleteId: classEnrollments.athleteId })
      .from(classEnrollments)
      .innerJoin(athletes, eq(classEnrollments.athleteId, athletes.id))
      .where(
        and(
          eq(classEnrollments.tenantId, tenantId),
          eq(classEnrollments.academyId, academyId),
          eq(classEnrollments.classId, session.classId),
          eq(athletes.tenantId, tenantId),
          eq(athletes.academyId, academyId),
          isNull(athletes.deletedAt)
        )
      ),
    session.groupId
      ? db
          .select({ athleteId: groupAthletes.athleteId })
          .from(groupAthletes)
          .innerJoin(athletes, eq(groupAthletes.athleteId, athletes.id))
          .where(
            and(
              eq(groupAthletes.tenantId, tenantId),
              eq(groupAthletes.groupId, session.groupId),
              eq(athletes.tenantId, tenantId),
              eq(athletes.academyId, academyId),
              isNull(athletes.deletedAt)
            )
          )
      : Promise.resolve([]),
  ]);

  const athleteIds = Array.from(
    new Set([...enrolledAthletes, ...groupedAthletes].map((item) => item.athleteId))
  );
  if (athleteIds.length === 0) {
    return apiError("NO_RECIPIENTS", "La clase no tiene gimnastas vinculadas", 409);
  }

  const [guardianProfiles, athleteProfiles] = await Promise.all([
    db
      .select({ id: profiles.id, userId: profiles.userId })
      .from(guardianAthletes)
      .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
      .innerJoin(profiles, eq(guardians.profileId, profiles.id))
      .where(
        and(
          eq(guardianAthletes.tenantId, tenantId),
          eq(guardians.tenantId, tenantId),
          eq(profiles.tenantId, tenantId),
          inArray(guardianAthletes.athleteId, athleteIds)
        )
      ),
    db
      .select({ id: profiles.id, userId: profiles.userId })
      .from(athletes)
      .innerJoin(profiles, eq(athletes.userId, profiles.userId))
      .where(
        and(
          eq(athletes.tenantId, tenantId),
          eq(athletes.academyId, academyId),
          inArray(athletes.id, athleteIds),
          eq(profiles.tenantId, tenantId),
          isNull(athletes.deletedAt)
        )
      ),
  ]);

  const candidateProfiles = [...guardianProfiles, ...athleteProfiles].filter(
    (item) => item.id !== context.profile.id
  );
  const candidateUserIds = Array.from(new Set(candidateProfiles.map((item) => item.userId)));
  if (candidateUserIds.length === 0) {
    return apiError(
      "NO_LINKED_RECIPIENTS",
      "No hay cuentas de familia o gimnasta vinculadas a esta clase",
      409
    );
  }

  const academyMembers = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.academyId, academyId),
        inArray(memberships.userId, candidateUserIds)
      )
    );
  const memberUserIds = new Set(academyMembers.map((item) => item.userId));
  const recipientIds = Array.from(
    new Set(
      candidateProfiles
        .filter((item) => memberUserIds.has(item.userId))
        .map((item) => item.id)
    )
  );

  if (recipientIds.length === 0) {
    return apiError(
      "NO_LINKED_RECIPIENTS",
      "Las cuentas vinculadas todavía no tienen acceso a esta academia",
      409
    );
  }

  const authUserIdByProfileId = new Map(
    candidateProfiles.map((item) => [item.id, item.userId])
  );

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${session.id}, 0))`
    );

    const [existing] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, tenantId),
          eq(conversations.academyId, academyId),
          sql`${conversations.metadata}->>'sessionId' = ${session.id}`
        )
      )
      .limit(1);

    let conversationId = existing?.id;
    if (!conversationId) {
      const [created] = await tx
        .insert(conversations)
        .values({
          tenantId,
          academyId,
          title: `Avisos · ${session.className} · ${session.sessionDate}`,
          metadata: {
            type: "group",
            context: "class",
            sessionId: session.id,
            classId: session.classId,
            groupId: session.groupId ?? undefined,
          } as unknown as typeof conversations.$inferInsert.metadata,
        })
        .returning({ id: conversations.id });
      conversationId = created.id;
    }

    const currentParticipantIds = [context.profile.id, ...recipientIds];
    await tx
      .delete(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          notInArray(conversationParticipants.userId, currentParticipantIds)
        )
      );

    await tx
      .insert(conversationParticipants)
      .values([
        {
          conversationId,
          userId: context.profile.id,
          role: "owner",
          notificationsEnabled: "true",
        },
        ...recipientIds.map((userId) => ({
          conversationId,
          userId,
          role: "member",
          notificationsEnabled: "true",
        })),
      ])
      .onConflictDoNothing();

    const [message] = await tx
      .insert(conversationMessages)
      .values({
        conversationId,
        senderId: context.profile.id,
        content: payload.content,
      })
      .returning({ id: conversationMessages.id, createdAt: conversationMessages.createdAt });

    await tx
      .update(conversations)
      .set({
        lastMessagePreview: payload.content.slice(0, 100),
        lastMessageAt: message.createdAt,
        updatedAt: new Date(),
      })
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)));

    return { conversationId, message };
  });

  const messageUrl = `/app/${academyId}/messages?c=${result.conversationId}`;
  for (const recipientId of recipientIds) {
    try {
      await createNotification({
        userId: recipientId,
        tenantId,
        type: "class_group_alert",
        title: `Aviso de ${session.className}`,
        message: payload.content.slice(0, 100),
        data: {
          academyId,
          conversationId: result.conversationId,
          messageId: result.message.id,
          sessionId: session.id,
          classId: session.classId,
          groupId: session.groupId,
          url: messageUrl,
        },
      });
      const authUserId = authUserIdByProfileId.get(recipientId);
      if (authUserId) {
        void sendPushToUser(authUserId, {
          title: `Aviso de ${session.className}`,
          body: payload.content.slice(0, 100),
          tag: `class-session-${session.id}`,
          data: { url: messageUrl, conversationId: result.conversationId },
        }).catch(() => undefined);
      }
    } catch (error) {
      logger.warn("Group alert notification could not be delivered", {
        recipientId,
        conversationId: result.conversationId,
        error,
      });
    }
  }

  return apiCreated({
    conversationId: result.conversationId,
    messageId: result.message.id,
    createdAt: result.message.createdAt,
    recipientCount: recipientIds.length,
  });
});

export const POST = withRateLimit(
  async (request, context) =>
    (await groupAlertHandler(request, context ?? {})) as NextResponse,
  { identifier: getUserIdentifier, limit: 10, window: 60 }
);
