/**
 * GET /api/academies/[academyId]/announcements/[id] - Obtener anuncio
 * PATCH /api/academies/[academyId]/announcements/[id] - Actualizar anuncio
 * DELETE /api/academies/[academyId]/announcements/[id] - Eliminar anuncio
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db } from "@/db";
import {
  announcements as announcementsTable,
  announcementReadStatus,
} from "@/db/schema/announcements";
import { memberships } from "@/db/schema/memberships";
import { profiles } from "@/db/schema/profiles";

export const dynamic = "force-dynamic";

/**
 * GET - Obtener un anuncio específico
 */
export const GET = withTenant(async (request, context) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const { params } = context;
    const { academyId, id } = params as { academyId: string; id: string };

    if (!academyId || !id) {
      return apiError("VALIDATION_ERROR", "Academy ID e ID de anuncio requeridos", 400);
    }

    // Verify user is a member of the academy
    const [membership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.academyId, academyId),
          eq(memberships.userId, profile.userId)
        )
      )
      .limit(1);

    if (!membership) {
      return apiError("FORBIDDEN", "No eres miembro de esta academia", 403);
    }

    // Get announcement
    const [announcement] = await db
      .select()
      .from(announcementsTable)
      .where(
        and(
          eq(announcementsTable.id, id),
          eq(announcementsTable.academyId, academyId)
        )
      )
      .limit(1);

    if (!announcement) {
      return apiError("NOT_FOUND", "Anuncio no encontrado", 404);
    }

    // Get author info
    const [author] = await db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(profiles)
      .where(eq(profiles.id, announcement.authorId))
      .limit(1);

    // Check if current user has read this announcement
    const [readStatus] = await db
      .select()
      .from(announcementReadStatus)
      .where(
        and(
          eq(announcementReadStatus.announcementId, id),
          eq(announcementReadStatus.userId, profile.id)
        )
      )
      .limit(1);

    // Mark as read if not already
    if (!readStatus) {
      await db.insert(announcementReadStatus).values({
        announcementId: id,
        userId: profile.id,
      });

      // Update read count
      const newReadCount = parseInt(announcement.readCount || "0") + 1;
      await db
        .update(announcementsTable)
        .set({ readCount: String(newReadCount) })
        .where(eq(announcementsTable.id, id));
    }

    return apiSuccess({
      ...announcement,
      isRead: !!readStatus,
      author,
    });
  } catch (error) {
    console.error("Error getting announcement:", error);
    return apiError("INTERNAL_ERROR", "Error al obtener anuncio", 500);
  }
});

/**
 * PATCH - Actualizar un anuncio
 */
const UpdateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(5000).optional(),
  actionUrl: z.string().url().optional().nullable(),
  actionLabel: z.string().max(50).optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  category: z.enum(["general", "event", "billing", "class", "news"]).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export const PATCH = withTenant(async (request, context) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const { params } = context;
    const { academyId, id } = params as { academyId: string; id: string };

    if (!academyId || !id) {
      return apiError("VALIDATION_ERROR", "Academy ID e ID de anuncio requeridos", 400);
    }

    // Verify user has permission (owner or admin)
    const [membership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.academyId, academyId),
          eq(memberships.userId, profile.userId)
        )
      )
      .limit(1);

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return apiError(
        "FORBIDDEN",
        "Solo owners y admins pueden modificar anuncios",
        403
      );
    }

    // Verify announcement exists
    const [existing] = await db
      .select()
      .from(announcementsTable)
      .where(
        and(
          eq(announcementsTable.id, id),
          eq(announcementsTable.academyId, academyId)
        )
      )
      .limit(1);

    if (!existing) {
      return apiError("NOT_FOUND", "Anuncio no encontrado", 404);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return apiError("INVALID_JSON", "JSON inválido", 400);
    }

    const validated = UpdateAnnouncementSchema.parse(body);

    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (validated.title !== undefined) updates.title = validated.title;
    if (validated.content !== undefined) updates.content = validated.content;
    if (validated.actionUrl !== undefined) updates.actionUrl = validated.actionUrl;
    if (validated.actionLabel !== undefined) updates.actionLabel = validated.actionLabel;
    if (validated.priority !== undefined) updates.priority = validated.priority;
    if (validated.category !== undefined) updates.category = validated.category;
    if (validated.status !== undefined) {
      updates.status = validated.status;
      if (validated.status === "published" && !existing.publishedAt) {
        updates.publishedAt = new Date();
      }
    }

    await db
      .update(announcementsTable)
      .set(updates)
      .where(eq(announcementsTable.id, id));

    return apiSuccess({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Datos inválidos", 400, error.issues);
    }
    console.error("Error updating announcement:", error);
    return apiError("INTERNAL_ERROR", "Error al actualizar anuncio", 500);
  }
});

/**
 * DELETE - Eliminar un anuncio
 */
export const DELETE = withTenant(async (request, context) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const { params } = context;
    const { academyId, id } = params as { academyId: string; id: string };

    if (!academyId || !id) {
      return apiError("VALIDATION_ERROR", "Academy ID e ID de anuncio requeridos", 400);
    }

    // Verify user has permission (only owner can delete)
    const [membership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.academyId, academyId),
          eq(memberships.userId, profile.userId)
        )
      )
      .limit(1);

    if (!membership || membership.role !== "owner") {
      return apiError(
        "FORBIDDEN",
        "Solo el owner puede eliminar anuncios",
        403
      );
    }

    // Delete announcement (cascade will handle read statuses)
    await db
      .delete(announcementsTable)
      .where(
        and(
          eq(announcementsTable.id, id),
          eq(announcementsTable.academyId, academyId)
        )
      );

    return apiSuccess({ success: true });
  } catch (error) {
    console.error("Error deleting announcement:", error);
    return apiError("INTERNAL_ERROR", "Error al eliminar anuncio", 500);
  }
});
