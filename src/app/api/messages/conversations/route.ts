/**
 * GET /api/messages/conversations - Listar conversaciones del usuario
 * POST /api/messages/conversations - Crear nueva conversación
 */
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import {
  conversations,
  conversationParticipants,
  conversationMessages,
} from "@/db/schema/direct-messages";
import { db } from "@/db";

export const dynamic = "force-dynamic";

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
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

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
      .where(
        and(
          eq(conversations.tenantId, tenantId),
          sql`${conversationParticipants.hiddenAt} IS NULL`
        )
      )
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
                  id: sql<string>`id`,
                  fullName: sql<string>`full_name`,
                  avatarUrl: sql<string>`avatar_url`,
                })
                .from(sql`profiles`)
                .where(sql`id = ${p.userId}`)
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
    console.error("Error listing conversations:", error);
    return apiError("INTERNAL_ERROR", "Error al listar conversaciones", 500);
  }
});

/**
 * POST - Crear nueva conversación
 */
const CreateConversationSchema = z.object({
  participantIds: z.array(z.string().uuid()),
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

    // Validate participants exist
    if (participantIds.length === 0) {
      return apiError("VALIDATION_ERROR", "Se requiere al menos un participante", 400);
    }

    // For P2P, check if conversation already exists
    if (participantIds.length === 1) {
      const existingConversation = await db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          eq(conversationParticipants.conversationId, conversations.id)
        )
        .where(
          and(
            eq(conversations.tenantId, tenantId),
            eq(conversations.metadata, { type: "p2p" } as any)
          )
        )
        .limit(1);

      // Check if other participant is in this conversation
      if (existingConversation.length > 0) {
        const otherParticipant = await db
          .select({ id: conversationParticipants.id })
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.conversationId, existingConversation[0].id),
              eq(conversationParticipants.userId, participantIds[0])
            )
          );

        if (otherParticipant.length > 0) {
          return apiSuccess({ id: existingConversation[0].id, alreadyExists: true });
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
        metadata: metadata || { type: participantIds.length === 1 ? "p2p" : "group" },
      })
      .returning();

    // Add all participants including the current user
    const allParticipantIds = [...new Set([profile.id, ...participantIds])];
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
    console.error("Error creating conversation:", error);
    return apiError("INTERNAL_ERROR", "Error al crear conversación", 500);
  }
});
