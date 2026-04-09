/**
 * GET /api/messages/conversations/[id]/messages - Obtener mensajes (alternativa con cursor)
 * POST /api/messages/conversations/[id]/messages - Enviar mensaje
 */
import { NextResponse } from "next/server";
import { and, desc, eq, gt, sql } from "drizzle-orm";

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
import { trackEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

type RouteContext = { tenantId: string; params: { id: string }; profile?: { id: string } };

/**
 * GET - Obtener mensajes con cursor-based pagination
 */
export const GET = withTenant(async (request: Request, context: RouteContext) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const { id: conversationId } = context.params;

    if (!conversationId) {
      return apiError("VALIDATION_ERROR", "ID de conversación requerido", 400);
    }

    // Verify user is participant
    const [participant] = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, profile.id)
        )
      )
      .limit(1);

    if (!participant) {
      return apiError("FORBIDDEN", "No tienes acceso a esta conversación", 403);
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const cursor = url.searchParams.get("cursor"); // ISO date cursor

    const baseCondition = eq(conversationMessages.conversationId, conversationId);
    const cursorCondition = cursor ? gt(conversationMessages.createdAt, new Date(cursor)) : undefined;

    const messages = await db
      .select({
        id: conversationMessages.id,
        senderId: conversationMessages.senderId,
        content: conversationMessages.content,
        attachmentUrl: conversationMessages.attachmentUrl,
        attachmentType: conversationMessages.attachmentType,
        attachmentName: conversationMessages.attachmentName,
        replyToId: conversationMessages.replyToId,
        editedAt: conversationMessages.editedAt,
        deletedAt: conversationMessages.deletedAt,
        createdAt: conversationMessages.createdAt,
      })
      .from(conversationMessages)
      .where(cursorCondition ? and(baseCondition, cursorCondition) : baseCondition)
      .orderBy(conversationMessages.createdAt)
      .limit(limit + 1); // Fetch one extra to check if there's more

    const hasMore = messages.length > limit;
    const results = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore
      ? results[results.length - 1]?.createdAt.toISOString()
      : null;

    // Mark as read
    await db
      .update(conversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, profile.id)
        )
      );

    return apiSuccess({
      items: results,
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    console.error("Error getting messages:", error);
    return apiError("INTERNAL_ERROR", "Error al obtener mensajes", 500);
  }
});

/**
 * POST - Enviar un mensaje
 */
export const POST = withTenant(async (request: Request, context: RouteContext) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const { id: conversationId } = context.params;

    if (!conversationId) {
      return apiError("VALIDATION_ERROR", "ID de conversación requerido", 400);
    }

    // Verify user is participant
    const [participant] = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, profile.id)
        )
      )
      .limit(1);

    if (!participant) {
      return apiError("FORBIDDEN", "No tienes acceso a esta conversación", 403);
    }

    // Check if muted
    if (participant.mutedUntil && new Date(participant.mutedUntil) > new Date()) {
      return apiError(
        "MUTED",
        "Tienes esta conversación silenciada",
        403
      );
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return apiError("INVALID_JSON", "JSON inválido", 400);
    }

    const { content, attachmentUrl, attachmentType, attachmentName, replyToId } = body;

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

    // Create message
    const [message] = await db
      .insert(conversationMessages)
      .values({
        conversationId,
        senderId: profile.id,
        content: content.trim(),
        attachmentUrl: attachmentUrl || null,
        attachmentType: attachmentType || null,
        attachmentName: attachmentName || null,
        replyToId: replyToId || null,
      })
      .returning();

    // Update conversation
    await db
      .update(conversations)
      .set({
        lastMessagePreview: content.substring(0, 100),
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    // Get conversation info for notifications
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    // Get all other participants
    const otherParticipants = await db
      .select({
        userId: conversationParticipants.userId,
        notificationsEnabled: conversationParticipants.notificationsEnabled,
        mutedUntil: conversationParticipants.mutedUntil,
      })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          sql`${conversationParticipants.userId} != ${profile.id}`
        )
      );

    // Send notifications to other participants
    const notificationsToSend: Array<{
      userId: string;
      type: "in_app" | "push";
      enabled: boolean;
      muted: boolean;
    }> = otherParticipants.map((p) => ({
      userId: p.userId,
      type: p.notificationsEnabled === "true" ? "in_app" : "in_app",
      enabled: p.notificationsEnabled === "true",
      muted: p.mutedUntil ? new Date(p.mutedUntil) > new Date() : false,
    }));

    // Send in-app notifications
    for (const p of notificationsToSend) {
      if (!p.enabled || p.muted) continue;

      // In-app notification
      await createNotification({
        userId: p.userId,
        tenantId: conversation?.tenantId || "",
        type: "new_message",
        title: "Nuevo mensaje",
        message: content.substring(0, 100),
        data: {
          conversationId,
          messageId: message.id,
          senderId: profile.id,
        },
      });

      // Push notification (fire and forget)
      sendPushToUser(p.userId, {
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

    // Track event
    trackEvent("message_sent", {
      metadata: {
        conversationId,
        messageId: message.id,
        hasAttachment: !!attachmentUrl,
      },
    });

    return apiSuccess({
      id: message.id,
      createdAt: message.createdAt,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    return apiError("INTERNAL_ERROR", "Error al enviar mensaje", 500);
  }
});
