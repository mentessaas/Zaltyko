/**
 * POST /api/messages/send - Enviar mensaje directo a un usuario
 *
 * Este endpoint es un shortcut para:
 * 1. Buscar si existe una conversación P2P con el usuario
 * 2. Si no existe, crearla
 * 3. Enviar el mensaje
 */
import { and, eq, inArray, sql } from "drizzle-orm";
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
import { sendPushToUser } from "@/lib/notifications/push-service";
import { createNotification } from "@/lib/notifications/notification-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const SendDirectMessageSchema = z.object({
  recipientId: z.string().uuid(),
  content: z.string().trim().min(1).max(5000),
  academyId: z.string().uuid().optional(),
  initialMessage: z.boolean().optional(),
});

/**
 * POST - Enviar mensaje directo a un usuario
 *
 * Body:
 * {
 *   recipientId: string (uuid del perfil del destinatario),
 *   content: string (contenido del mensaje),
 *   academyId?: string (uuid de academia, opcional),
 *   initialMessage?: boolean (si es el primer mensaje de una conversación nueva)
 * }
 */
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

    let body: z.infer<typeof SendDirectMessageSchema>;
    try {
      body = SendDirectMessageSchema.parse(await request.json());
    } catch (error) {
      if (error instanceof z.ZodError) {
        return apiError("VALIDATION_ERROR", "Datos del mensaje inválidos", 400, error.issues);
      }
      return apiError("INVALID_JSON", "JSON inválido", 400);
    }

    const { recipientId, content, academyId } = body;

    if (recipientId === profile.id) {
      return apiError(
        "VALIDATION_ERROR",
        "No puedes enviarte mensajes a ti mismo",
        400
      );
    }

    // Verify recipient exists (check profiles table)
    const [recipient] = await db
      .select({ id: profiles.id, userId: profiles.userId, tenantId: profiles.tenantId })
      .from(profiles)
      .where(and(eq(profiles.id, recipientId), eq(profiles.tenantId, tenantId)))
      .limit(1);

    if (!recipient) {
      return apiError("FORBIDDEN", "Destinatario no válido para este tenant", 403);
    }

    if (academyId) {
      const [[academy], academyMemberships] = await Promise.all([
        db.select({ id: academies.id }).from(academies).where(and(eq(academies.id, academyId), eq(academies.tenantId, tenantId))).limit(1),
        db.select({ userId: memberships.userId }).from(memberships).where(and(
          eq(memberships.academyId, academyId),
          inArray(memberships.userId, [profile.userId, recipient.userId])
        )),
      ]);
      if (!academy || new Set(academyMemberships.map((item) => item.userId)).size !== 2) {
        return apiError("FORBIDDEN", "Emisor y destinatario deben pertenecer a la academia", 403);
      }
    }

    // Check for existing P2P conversation
    // Look for a conversation where both users are participants
    const existingConversations = await db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id)
      )
      .where(
        and(
          eq(conversations.tenantId, tenantId),
          academyId ? eq(conversations.academyId, academyId) : undefined,
          sql`${conversations.metadata}->>'type' = 'p2p'`
        )
      );

    let conversationId: string | null = null;

    // Find conversation where both users are participants
    for (const conv of existingConversations) {
      const participants = await db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conv.id));

      const participantIds = participants.map((p) => p.userId);

      if (
        participantIds.includes(profile.id) &&
        participantIds.includes(recipientId) &&
        participants.length === 2
      ) {
        // Found existing conversation with just these 2 participants
        const otherParticipants = participants.filter(
          (p) => p.userId !== profile.id
        );
        if (otherParticipants.length === 1 && otherParticipants[0].userId === recipientId) {
          conversationId = conv.id;
          break;
        }
      }
    }

    // If no existing conversation, create one
    if (!conversationId) {
      const [newConversation] = await db
        .insert(conversations)
        .values({
          tenantId,
          academyId: academyId || null,
          metadata: { type: "p2p", context: "general" },
        })
        .returning();

      conversationId = newConversation.id;

      // Add participants
      await db.insert(conversationParticipants).values([
        {
          conversationId,
          userId: profile.id,
          role: "member",
          notificationsEnabled: "true",
        },
        {
          conversationId,
          userId: recipientId,
          role: "member",
          notificationsEnabled: "true",
        },
      ]);
    }

    // Send the message
    const [message] = await db
      .insert(conversationMessages)
      .values({
        conversationId,
        senderId: profile.id,
        content: content.trim(),
      })
      .returning();

    // Update conversation last message
    await db
      .update(conversations)
      .set({
        lastMessagePreview: content.substring(0, 100),
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    // Send notifications to recipient
    const [recipientParticipant] = await db
      .select({
        notificationsEnabled: conversationParticipants.notificationsEnabled,
        mutedUntil: conversationParticipants.mutedUntil,
      })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, recipientId)
        )
      )
      .limit(1);

    const shouldNotify =
      recipientParticipant &&
      recipientParticipant.notificationsEnabled === "true" &&
      (!recipientParticipant.mutedUntil ||
        new Date(recipientParticipant.mutedUntil) <= new Date());

    if (shouldNotify) {
      const messageUrl = academyId
        ? `/app/${academyId}/messages?c=${conversationId}`
        : `/dashboard/messages/${conversationId}`;

      // In-app notification
      await createNotification({
        userId: recipientId,
        tenantId,
        type: "new_message",
        title: "Nuevo mensaje",
        message: content.substring(0, 100),
        data: {
          conversationId,
          messageId: message.id,
          senderId: profile.id,
          url: messageUrl,
        },
      });

      // Push notification
      sendPushToUser(recipientId, {
        title: "Nuevo mensaje",
        body: content.substring(0, 100),
        icon: "/icons/icon-192x192.png",
        tag: `conversation-${conversationId}`,
        data: {
          conversationId,
          messageId: message.id,
          url: messageUrl,
        },
      }).catch(() => {});
    }

    return apiSuccess({
      conversationId,
      messageId: message.id,
      createdAt: message.createdAt,
    });
  } catch (error) {
    logger.error("Error sending message:", error);
    return apiError("INTERNAL_ERROR", "Error al enviar mensaje", 500);
  }
});
