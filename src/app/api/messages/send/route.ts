/**
 * POST /api/messages/send - Enviar mensaje directo a un usuario
 *
 * Este endpoint es un shortcut para:
 * 1. Buscar si existe una conversación P2P con el usuario
 * 2. Si no existe, crearla
 * 3. Enviar el mensaje
 */
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import {
  conversations,
  conversationParticipants,
  conversationMessages,
} from "@/db/schema/direct-messages";
import { db } from "@/db";
import { sendPushToUser } from "@/lib/notifications/push-service";
import { createNotification } from "@/lib/notifications/notification-service";

export const dynamic = "force-dynamic";

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

    let body;
    try {
      body = await request.json();
    } catch {
      return apiError("INVALID_JSON", "JSON inválido", 400);
    }

    const { recipientId, content, academyId, initialMessage } = body;

    if (!recipientId) {
      return apiError("VALIDATION_ERROR", "recipientId es requerido", 400);
    }

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return apiError("VALIDATION_ERROR", "Contenido del mensaje requerido", 400);
    }

    if (content.length > 5000) {
      return apiError(
        "VALIDATION_ERROR",
        "Mensaje muy largo (máx 5000 caracteres)",
        400
      );
    }

    if (recipientId === profile.id) {
      return apiError(
        "VALIDATION_ERROR",
        "No puedes enviarte mensajes a ti mismo",
        400
      );
    }

    // Verify recipient exists (check profiles table)
    const [recipientExists] = await db
      .select({ id: sql<string>`id` })
      .from(sql`profiles`)
      .where(sql`id = ${recipientId}`)
      .limit(1);

    if (!recipientExists) {
      return apiError("NOT_FOUND", "Destinatario no encontrado", 404);
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
          eq(conversations.metadata, { type: "p2p" } as any)
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
        participants.filter((p) => !participantIds.includes(profile.id as any) || p.userId === profile.id).length === 2
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
          url: `/dashboard/messages/${conversationId}`,
        },
      }).catch(() => {});
    }

    return apiSuccess({
      conversationId,
      messageId: message.id,
      createdAt: message.createdAt,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    return apiError("INTERNAL_ERROR", "Error al enviar mensaje", 500);
  }
});
