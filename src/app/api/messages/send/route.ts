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
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";
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
  recipientId: z.guid(),
  content: z.string().trim().min(1).max(5000),
  academyId: z.guid().optional(),
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
        )).limit(2),
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
      )
      .limit(100);

    let conversationId: string | null = null;

    // Find conversation where both users are participants
    for (const conv of existingConversations) {
      const participants = await db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conv.id))
        .limit(10);

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

    const sent = await withTransaction(async (tx) => {
      if (academyId) {
        await lockAcademyOperationalWrites(tx, academyId);
        await assertAcademyOperationalWritable(tenantId, academyId, tx);

        const [currentAcademy] = await tx
          .select({ id: academies.id })
          .from(academies)
          .where(and(eq(academies.id, academyId), eq(academies.tenantId, tenantId)))
          .limit(1);
        const currentMemberships = await tx
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(and(
            eq(memberships.academyId, academyId),
            inArray(memberships.userId, [profile.userId, recipient.userId])
          ))
          .limit(2);
        if (!currentAcademy || new Set(currentMemberships.map((item) => item.userId)).size !== 2) {
          return { kind: "forbidden" as const };
        }
      }

      let currentConversationId = conversationId;
      if (currentConversationId) {
        const [currentConversation] = await tx
          .select({ id: conversations.id, academyId: conversations.academyId })
          .from(conversations)
          .where(and(
            eq(conversations.id, currentConversationId),
            eq(conversations.tenantId, tenantId),
            academyId ? eq(conversations.academyId, academyId) : sql`${conversations.academyId} IS NULL`,
            sql`${conversations.metadata}->>'type' = 'p2p'`,
          ))
          .limit(1);
        if (!currentConversation) return { kind: "forbidden" as const };

        const currentParticipants = await tx
          .select({ userId: conversationParticipants.userId })
          .from(conversationParticipants)
          .where(eq(conversationParticipants.conversationId, currentConversationId))
          .limit(3);
        const ids = new Set(currentParticipants.map((item) => item.userId));
        if (ids.size !== 2 || !ids.has(profile.id) || !ids.has(recipientId)) {
          return { kind: "forbidden" as const };
        }
      } else {
        const [newConversation] = await tx
          .insert(conversations)
          .values({
            tenantId,
            academyId: academyId || null,
            metadata: { type: "p2p", context: "general" },
          })
          .returning();

        currentConversationId = newConversation.id;
        await tx.insert(conversationParticipants).values([
          { conversationId: currentConversationId, userId: profile.id, role: "member", notificationsEnabled: "true" },
          { conversationId: currentConversationId, userId: recipientId, role: "member", notificationsEnabled: "true" },
        ]);
      }

      const [message] = await tx
        .insert(conversationMessages)
        .values({ conversationId: currentConversationId, senderId: profile.id, content: content.trim() })
        .returning();

      await tx
        .update(conversations)
        .set({
          lastMessagePreview: content.substring(0, 100),
          lastMessageAt: message.createdAt,
          updatedAt: new Date(),
        })
        .where(and(eq(conversations.id, currentConversationId), eq(conversations.tenantId, tenantId)));

      const [recipientParticipant] = await tx
        .select({
          notificationsEnabled: conversationParticipants.notificationsEnabled,
          mutedUntil: conversationParticipants.mutedUntil,
        })
        .from(conversationParticipants)
        .where(and(
          eq(conversationParticipants.conversationId, currentConversationId),
          eq(conversationParticipants.userId, recipientId)
        ))
        .limit(1);

      return { kind: "ok" as const, conversationId: currentConversationId, message, recipientParticipant };
    });

    if (sent.kind === "forbidden") {
      return apiError("FORBIDDEN", "La conversación o la pertenencia a la academia ha cambiado", 403);
    }

    conversationId = sent.conversationId;
    const { message, recipientParticipant } = sent;

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
      try {
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
      } catch (notificationError) {
        logger.warn("Direct message notification could not be delivered", { conversationId, error: notificationError });
      }

      // Push notification
      sendPushToUser(recipientId, {
        title: "Nuevo mensaje",
        body: content.substring(0, 100),
        icon: "/icons/icon-192.png",
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
    return handleApiError(error, { endpoint: "/api/messages/send", method: "POST" });
  }
});
