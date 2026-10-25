/**
 * GET /api/messages/conversations/[id]/messages - Obtener mensajes (alternativa con cursor)
 * POST /api/messages/conversations/[id]/messages - Enviar mensaje
 */
import { and, eq, gt, sql } from "drizzle-orm";
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
import { sendPushToUser } from "@/lib/notifications/push-service";
import { createNotification } from "@/lib/notifications/notification-service";
import { trackEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type RouteContext = { tenantId: string; params: { id: string }; profile?: { id: string } };

const SendMessageSchema = z.object({
  content: z.string().trim().min(1).max(5000),
  attachmentUrl: z.string().url().optional(),
  attachmentType: z.enum(["image", "file", "video"]).optional(),
  attachmentName: z.string().max(255).optional(),
  replyToId: z.string().uuid().optional(),
});

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

    const [conversation] = await db
      .select({ id: conversations.id, tenantId: conversations.tenantId, academyId: conversations.academyId })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, context.tenantId)))
      .limit(1);
    if (!conversation) {
      return apiError("FORBIDDEN", "La conversación no pertenece al tenant activo", 403);
    }

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || "50");
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const cursor = url.searchParams.get("cursor"); // ISO date cursor
    const cursorDate = cursor ? new Date(cursor) : undefined;
    if (cursor && Number.isNaN(cursorDate?.getTime())) {
      return apiError("VALIDATION_ERROR", "Cursor inválido", 400);
    }

    const baseCondition = eq(conversationMessages.conversationId, conversationId);
    const cursorCondition = cursorDate ? gt(conversationMessages.createdAt, cursorDate) : undefined;

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
    logger.error("Error getting messages:", error);
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

    const [conversation] = await db
      .select({ id: conversations.id, tenantId: conversations.tenantId, academyId: conversations.academyId })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, context.tenantId)))
      .limit(1);
    if (!conversation) {
      return apiError("FORBIDDEN", "La conversación no pertenece al tenant activo", 403);
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
    let body: z.infer<typeof SendMessageSchema>;
    try {
      body = SendMessageSchema.parse(await request.json());
    } catch (error) {
      if (error instanceof z.ZodError) {
        return apiError("VALIDATION_ERROR", "Mensaje inválido", 400, error.issues);
      }
      return apiError("INVALID_JSON", "JSON inválido", 400);
    }

    const { content, attachmentUrl, attachmentType, attachmentName, replyToId } = body;

    const sent = await withTransaction(async (tx) => {
      const [currentConversation] = await tx
        .select({ id: conversations.id, tenantId: conversations.tenantId, academyId: conversations.academyId })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, context.tenantId)))
        .limit(1);
      if (!currentConversation) return { kind: "conversation-not-found" as const };

      if (currentConversation.academyId) {
        await lockAcademyOperationalWrites(tx, currentConversation.academyId);
        await assertAcademyOperationalWritable(context.tenantId, currentConversation.academyId, tx);
      }

      const [currentParticipant] = await tx
        .select({ mutedUntil: conversationParticipants.mutedUntil })
        .from(conversationParticipants)
        .where(and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, profile.id),
        ))
        .limit(1);
      if (!currentParticipant) return { kind: "participant-not-found" as const };
      if (currentParticipant.mutedUntil && new Date(currentParticipant.mutedUntil) > new Date()) {
        return { kind: "muted" as const };
      }

      if (replyToId) {
        const [replyTarget] = await tx
          .select({ id: conversationMessages.id })
          .from(conversationMessages)
          .where(and(
            eq(conversationMessages.id, replyToId),
            eq(conversationMessages.conversationId, conversationId),
          ))
          .limit(1);
        if (!replyTarget) return { kind: "invalid-reply" as const };
      }

      const [message] = await tx
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

      await tx
        .update(conversations)
        .set({
          lastMessagePreview: content.substring(0, 100),
          lastMessageAt: message.createdAt,
          updatedAt: new Date(),
        })
        .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, context.tenantId)));

      const otherParticipants = await tx
        .select({
          userId: conversationParticipants.userId,
          notificationsEnabled: conversationParticipants.notificationsEnabled,
          mutedUntil: conversationParticipants.mutedUntil,
        })
        .from(conversationParticipants)
        .where(and(
          eq(conversationParticipants.conversationId, conversationId),
          sql`${conversationParticipants.userId} != ${profile.id}`
        ))
        .limit(100);

      return { kind: "ok" as const, message, conversation: currentConversation, otherParticipants };
    });

    if (sent.kind === "conversation-not-found") {
      return apiError("FORBIDDEN", "La conversación no pertenece al tenant activo", 403);
    }
    if (sent.kind === "participant-not-found") {
      return apiError("FORBIDDEN", "No tienes acceso a esta conversación", 403);
    }
    if (sent.kind === "muted") {
      return apiError("MUTED", "Tienes esta conversación silenciada", 403);
    }
    if (sent.kind === "invalid-reply") {
      return apiError("VALIDATION_ERROR", "El mensaje al que respondes no pertenece a esta conversación", 400);
    }
    const { message, conversation: currentConversation, otherParticipants } = sent;

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

      const messageUrl = currentConversation.academyId
        ? `/app/${currentConversation.academyId}/messages`
        : `/dashboard/messages/${conversationId}`;

      try {
        await createNotification({
          userId: p.userId,
          tenantId: currentConversation.tenantId,
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
        logger.warn("Message notification could not be delivered", {
          conversationId,
          recipientId: p.userId,
          error: notificationError,
        });
      }

      // Push notification (fire and forget)
      sendPushToUser(p.userId, {
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

    // Track event
    try {
      trackEvent("message_sent", {
        metadata: {
          conversationId,
          messageId: message.id,
          hasAttachment: !!attachmentUrl,
        },
      });
    } catch (trackingError) {
      logger.warn("Message telemetry could not be recorded", { conversationId, error: trackingError });
    }

    return apiSuccess({
      id: message.id,
      createdAt: message.createdAt,
    });
  } catch (error) {
    logger.error("Error sending message:", error);
    return handleApiError(error, { endpoint: "/api/messages/conversations/[id]/messages", method: "POST" });
  }
});
