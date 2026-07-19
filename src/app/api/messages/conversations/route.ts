/**
 * GET /api/messages/conversations - Listar conversaciones del usuario
 * POST /api/messages/conversations - Crear nueva conversación
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import {
  conversations,
  conversationParticipants,
  conversationMessages,
} from "@/db/schema/direct-messages";
import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ListConversationsSchema = z.object({
  academyId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET - Listar conversaciones del usuario actual
 */
export const GET = withTenant(async (request, context) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const tenantId = context.tenantId || profile.tenantId;
    if (!tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID es requerido", 400);
    }

    const url = new URL(request.url);
    const parsedQuery = ListConversationsSchema.safeParse({
      academyId: url.searchParams.get("academyId") || undefined,
      limit: url.searchParams.get("limit") || undefined,
      offset: url.searchParams.get("offset") || undefined,
    });
    if (!parsedQuery.success) {
      return apiError("VALIDATION_ERROR", "Parámetros de consulta inválidos", 400);
    }
    const { academyId, limit, offset } = parsedQuery.data;

    // Obtener conversaciones donde el usuario es participante
    const userConversations = await db
      .select({
        id: conversations.id,
        tenantId: conversations.tenantId,
        academyId: conversations.academyId,
        title: conversations.title,
        lastMessagePreview: conversations.lastMessagePreview,
        lastMessageAt: conversations.lastMessageAt,
        metadata: conversations.metadata,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        // Participant info
        userRole: conversationParticipants.role,
        userLastReadAt: conversationParticipants.lastReadAt,
        userNotificationsEnabled: conversationParticipants.notificationsEnabled,
      })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        and(
          eq(conversationParticipants.conversationId, conversations.id),
          eq(conversationParticipants.userId, profile.id)
        )
      )
      .where(and(
        eq(conversations.tenantId, tenantId),
        academyId ? eq(conversations.academyId, academyId) : undefined,
        sql`${conversationParticipants.hiddenAt} IS NULL`
      ))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit)
      .offset(offset);

    // Obtener información de los otros participantes
    const conversationsWithParticipants = await Promise.all(
      userConversations.map(async (conv) => {
        const participants = await db
          .select({
            id: conversationParticipants.id,
            userId: conversationParticipants.userId,
            role: conversationParticipants.role,
          })
          .from(conversationParticipants)
          .where(eq(conversationParticipants.conversationId, conv.id));

        // Get profile info for each participant
        const participantProfiles = await Promise.all(
          participants
            .filter((p) => p.userId !== profile.id)
            .map(async (p) => {
              const [userProfile] = await db
                .select({
                  id: profiles.id,
                  fullName: profiles.name,
                  avatarUrl: profiles.photoUrl,
                })
                .from(profiles)
                .where(eq(profiles.id, p.userId))
                .limit(1);
              return {
                userId: p.userId,
                role: p.role,
                profile: userProfile,
              };
            })
        );

        // Count unread messages
        const [unreadResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(conversationMessages)
          .where(
            and(
              eq(conversationMessages.conversationId, conv.id),
              sql`${conversationMessages.senderId} != ${profile.id}`,
              sql`${conversationMessages.createdAt} > COALESCE(${conv.userLastReadAt}, '1970-01-01')`
            )
          );

        return {
          ...conv,
          otherParticipants: participantProfiles,
          unreadCount: unreadResult?.count || 0,
        };
      })
    );

    return apiSuccess({
      items: conversationsWithParticipants,
      limit,
      offset,
    });
  } catch (error) {
    logger.error("Error listing conversations:", error);
    return apiError("INTERNAL_ERROR", "Error al listar conversaciones", 500);
  }
});

/**
 * POST - Crear nueva conversación
 */
const CreateConversationSchema = z.object({
  participantIds: z.array(z.string().uuid()).min(1).max(100),
  academyId: z.string().uuid().optional(),
  title: z.string().min(1).max(255).optional(),
  initialMessage: z.string().min(1).max(2000).optional(),
  metadata: z
    .object({
      type: z.enum(["p2p", "group", "academy_broadcast"]).optional(),
      context: z
        .enum(["general", "class", "event", "attendance", "billing"])
        .optional(),
    })
    .optional(),
});

export const POST = withTenant(async (request, context) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const tenantId = context.tenantId || profile.tenantId;
    if (!tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID es requerido", 400);
    }

    let body;
    try {
      body = CreateConversationSchema.parse(await request.json());
    } catch (parseError) {
      if (parseError instanceof z.ZodError) {
        return apiError(
          "VALIDATION_ERROR",
          "Datos inválidos",
          400,
          parseError.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
        );
      }
      return apiError("INVALID_JSON", "JSON inválido", 400);
    }

    const { participantIds, academyId, title, initialMessage, metadata } = body;

    const uniqueParticipantIds = [...new Set(participantIds)].filter((id) => id !== profile.id);
    if (uniqueParticipantIds.length === 0) {
      return apiError("VALIDATION_ERROR", "Se requiere al menos un destinatario distinto", 400);
    }
    const participantProfiles = await db
      .select({ id: profiles.id, userId: profiles.userId, tenantId: profiles.tenantId })
      .from(profiles)
      .where(inArray(profiles.id, uniqueParticipantIds));

    if (participantProfiles.length !== uniqueParticipantIds.length || participantProfiles.some((item) => item.tenantId !== tenantId)) {
      return apiError("FORBIDDEN", "Uno o más destinatarios no pertenecen al tenant", 403);
    }

    if (academyId) {
      const [academy] = await db
        .select({ id: academies.id })
        .from(academies)
        .where(and(eq(academies.id, academyId), eq(academies.tenantId, tenantId)))
        .limit(1);
      if (!academy) return apiError("FORBIDDEN", "Academia no válida para este tenant", 403);

      const academyMembers = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(
          eq(memberships.academyId, academyId),
          inArray(memberships.userId, [profile.userId, ...participantProfiles.map((item) => item.userId)])
        ));
      if (new Set(academyMembers.map((item) => item.userId)).size !== participantProfiles.length + 1) {
        return apiError("FORBIDDEN", "Emisor y destinatarios deben pertenecer a la academia", 403);
      }
    }

    const conversationType = uniqueParticipantIds.length === 1 ? "p2p" : "group";
    const conversationMetadata = {
      type: conversationType,
      context: metadata?.context ?? "general",
    } as typeof conversations.$inferInsert.metadata;

    // For P2P, reuse only a conversation in which the current profile and
    // recipient are the two exact participants. Checking one arbitrary P2P
    // conversation could otherwise expose a conversation between other users.
    if (uniqueParticipantIds.length === 1) {
      const existingConversations = await db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          and(
            eq(conversationParticipants.conversationId, conversations.id),
            eq(conversationParticipants.userId, profile.id)
          )
        )
        .where(
          and(
            eq(conversations.tenantId, tenantId),
            academyId ? eq(conversations.academyId, academyId) : undefined,
            sql`${conversations.metadata}->>'type' = 'p2p'`
          )
        );

      for (const existingConversation of existingConversations) {
        const existingParticipants = await db
          .select({ userId: conversationParticipants.userId })
          .from(conversationParticipants)
          .where(
            eq(conversationParticipants.conversationId, existingConversation.id)
          );

        const participantIdsInConversation = new Set(existingParticipants.map((participant) => participant.userId));
        if (
          participantIdsInConversation.size === 2 &&
          participantIdsInConversation.has(profile.id) &&
          participantIdsInConversation.has(uniqueParticipantIds[0])
        ) {
          return apiSuccess({ id: existingConversation.id, alreadyExists: true });
        }
      }
    }

    // Create conversation
    const [newConversation] = await db
      .insert(conversations)
      .values({
        tenantId,
        academyId: academyId || null,
        title: title || null,
        metadata: conversationMetadata,
      })
      .returning();

    // Add all participants including the current user
    const allParticipantIds = [profile.id, ...uniqueParticipantIds];
    await db.insert(conversationParticipants).values(
      allParticipantIds.map((userId) => ({
        conversationId: newConversation.id,
        userId,
        role: userId === profile.id ? "owner" : "member",
        notificationsEnabled: "true",
      }))
    );

    // Send initial message if provided
    if (initialMessage) {
      const [message] = await db
        .insert(conversationMessages)
        .values({
          conversationId: newConversation.id,
          senderId: profile.id,
          content: initialMessage,
        })
        .returning();

      // Update conversation last message
      await db
        .update(conversations)
        .set({
          lastMessagePreview: initialMessage.substring(0, 100),
          lastMessageAt: new Date(),
        })
        .where(eq(conversations.id, newConversation.id));

      return apiSuccess({ id: newConversation.id, messageId: message.id });
    }

    return apiSuccess({ id: newConversation.id });
  } catch (error) {
    logger.error("Error creating conversation:", error);
    return apiError("INTERNAL_ERROR", "Error al crear conversación", 500);
  }
});
