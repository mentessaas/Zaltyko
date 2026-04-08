/**
 * GET /api/messages/conversations/[id] - Obtener conversación
 * PATCH /api/messages/conversations/[id] - Actualizar conversación
 * DELETE /api/messages/conversations/[id] - Eliminar/ocultar conversación
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

export const dynamic = "force-dynamic";

/**
 * GET - Obtener una conversación con sus participantes y mensajes
 */
export const GET = withTenant(async (request, context) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const { params } = context;
    const conversationId = params.id;

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
      .where(eq(conversations.id, conversationId))
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
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const before = url.searchParams.get("before"); // ISO date for cursor pagination

    // Build message query
    let messageQuery = db
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
      .where(eq(conversationMessages.conversationId, conversationId));

    // Add cursor pagination if 'before' is provided
    if (before) {
      messageQuery = messageQuery.where(
        sql`${conversationMessages.createdAt} < ${before}`
      ) as any;
    }

    const messages = await messageQuery
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
    console.error("Error getting conversation:", error);
    return apiError("INTERNAL_ERROR", "Error al obtener conversación", 500);
  }
});

/**
 * PATCH - Actualizar conversación (título, notificaciones, etc.)
 */
export const PATCH = withTenant(async (request, context) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const { params } = context;
    const conversationId = params.id;

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

    const body = await request.json();
    const updates: Record<string, any> = { updatedAt: new Date() };

    // Fields user can update
    if (body.title !== undefined) updates.title = body.title;
    if (body.notificationsEnabled !== undefined) {
      updates.notificationsEnabled = body.notificationsEnabled ? "true" : "false";
    }
    if (body.mutedUntil !== undefined) {
      updates.mutedUntil = body.mutedUntil ? new Date(body.mutedUntil) : null;
    }

    // Only admins/owners can update title
    if (body.title !== undefined && !["owner", "admin"].includes(participant.role)) {
      return apiError(
        "FORBIDDEN",
        "Solo admins pueden cambiar el título",
        403
      );
    }

    await db
      .update(conversations)
      .set(updates)
      .where(eq(conversations.id, conversationId));

    // Update participant settings
    const participantUpdates: Record<string, any> = {};
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
    console.error("Error updating conversation:", error);
    return apiError("INTERNAL_ERROR", "Error al actualizar conversación", 500);
  }
});

/**
 * DELETE - Ocultar conversación para el usuario actual
 */
export const DELETE = withTenant(async (request, context) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const { params } = context;
    const conversationId = params.id;

    if (!conversationId) {
      return apiError("VALIDATION_ERROR", "ID de conversación requerido", 400);
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
    console.error("Error hiding conversation:", error);
    return apiError("INTERNAL_ERROR", "Error al ocultar conversación", 500);
  }
});
