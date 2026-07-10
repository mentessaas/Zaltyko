/**
 * GET /api/messages/conversations/[id] - Obtener conversación
 * PATCH /api/messages/conversations/[id] - Actualizar conversación
 * DELETE /api/messages/conversations/[id] - Eliminar/ocultar conversación
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import {
  conversations,
  conversationParticipants,
  conversationMessages,
} from "@/db/schema/direct-messages";
import { db } from "@/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type RouteContext = { tenantId: string; params: { id: string }; profile?: { id: string } };
type ParticipantSettings = Pick<
  InferInsertModel<typeof conversationParticipants>,
  "notificationsEnabled" | "mutedUntil"
>;

const UpdateConversationSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  notificationsEnabled: z.boolean().optional(),
  mutedUntil: z.string().datetime().nullable().optional(),
}).strict();

/**
 * GET - Obtener una conversación con sus participantes y mensajes
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

    // Get conversation
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, context.tenantId)))
      .limit(1);

    if (!conversation) {
      return apiError("NOT_FOUND", "Conversación no encontrada", 404);
    }

    // Get all participants
    const participants = await db
      .select({
        id: conversationParticipants.id,
        userId: conversationParticipants.userId,
        role: conversationParticipants.role,
        lastReadAt: conversationParticipants.lastReadAt,
        notificationsEnabled: conversationParticipants.notificationsEnabled,
      })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));

    // Get profile info for participants
    const participantsWithProfiles = await Promise.all(
      participants.map(async (p) => {
        // Get profile from profiles table
        const [userProfile] = await db
          .select({
            id: sql<string>`id`,
            fullName: sql<string>`full_name`,
            avatarUrl: sql<string>`avatar_url`,
            role: sql<string>`role`,
          })
          .from(sql`profiles`)
          .where(sql`id = ${p.userId}`)
          .limit(1);
        return {
          ...p,
          profile: userProfile,
        };
      })
    );

    // Get pagination params
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || "50");
    const requestedOffset = Number(url.searchParams.get("offset") || "0");
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const offset = Number.isInteger(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
    const before = url.searchParams.get("before"); // ISO date for cursor pagination

    const baseCondition = eq(conversationMessages.conversationId, conversationId);
    const beforeCondition = before
      ? sql`${conversationMessages.createdAt} < ${before}`
      : undefined;

    const messages = await db
      .select({
        id: conversationMessages.id,
        conversationId: conversationMessages.conversationId,
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
      .where(beforeCondition ? and(baseCondition, beforeCondition) : baseCondition)
      .orderBy(desc(conversationMessages.createdAt))
      .limit(limit)
      .offset(offset);

    // Mark conversation as read for current user
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
      conversation: {
        ...conversation,
        participants: participantsWithProfiles,
        currentUserRole: participant.role,
      },
      messages: messages.reverse(), // Return in chronological order
      pagination: {
        limit,
        offset,
        hasMore: messages.length === limit,
      },
    });
  } catch (error) {
    logger.error("Error getting conversation:", error);
    return apiError("INTERNAL_ERROR", "Error al obtener conversación", 500);
  }
});

/**
 * PATCH - Actualizar conversación (título, notificaciones, etc.)
 */
export const PATCH = withTenant(async (request: Request, context: RouteContext) => {
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
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, context.tenantId)))
      .limit(1);
    if (!conversation) {
      return apiError("FORBIDDEN", "La conversación no pertenece al tenant activo", 403);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiError("INVALID_JSON", "JSON inválido", 400);
    }

    const parsed = UpdateConversationSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Datos de conversación inválidos", 400, parsed.error.flatten());
    }
    const body = parsed.data;

    // Only admins/owners can update title
    if (body.title !== undefined && !["owner", "admin"].includes(participant.role)) {
      return apiError(
        "FORBIDDEN",
        "Solo admins pueden cambiar el título",
        403
      );
    }

    if (body.title !== undefined) {
      await db
        .update(conversations)
        .set({ title: body.title, updatedAt: new Date() })
        .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, context.tenantId)));
    }

    // Update participant settings
    const participantUpdates: ParticipantSettings = {};
    if (body.notificationsEnabled !== undefined) {
      participantUpdates.notificationsEnabled = body.notificationsEnabled ? "true" : "false";
    }
    if (body.mutedUntil !== undefined) {
      participantUpdates.mutedUntil = body.mutedUntil ? new Date(body.mutedUntil) : null;
    }

    if (Object.keys(participantUpdates).length > 0) {
      await db
        .update(conversationParticipants)
        .set(participantUpdates)
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, profile.id)
          )
        );
    }

    return apiSuccess({ success: true });
  } catch (error) {
    logger.error("Error updating conversation:", error);
    return apiError("INTERNAL_ERROR", "Error al actualizar conversación", 500);
  }
});

/**
 * DELETE - Ocultar conversación para el usuario actual
 */
export const DELETE = withTenant(async (request: Request, context: RouteContext) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const { id: conversationId } = context.params;

    if (!conversationId) {
      return apiError("VALIDATION_ERROR", "ID de conversación requerido", 400);
    }

    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, context.tenantId)))
      .limit(1);
    if (!conversation) {
      return apiError("FORBIDDEN", "La conversación no pertenece al tenant activo", 403);
    }

    const [participant] = await db
      .select({ id: conversationParticipants.id })
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

    // Soft delete - just set hiddenAt for this user
    await db
      .update(conversationParticipants)
      .set({ hiddenAt: new Date() })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, profile.id)
        )
      );

    return apiSuccess({ success: true });
  } catch (error) {
    logger.error("Error hiding conversation:", error);
    return apiError("INTERNAL_ERROR", "Error al ocultar conversación", 500);
  }
});
