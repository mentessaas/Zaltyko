/**
 * GET /api/academies/[academyId]/announcements - Listar anuncios
 * POST /api/academies/[academyId]/announcements - Crear anuncio
 */
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db } from "@/db";
import { announcements as announcementsTable, announcementReadStatus } from "@/db/schema/announcements";
import { memberships } from "@/db/schema/memberships";
import { createNotification } from "@/lib/notifications/notification-service";
import { sendPushToUser } from "@/lib/notifications/push-service";

export const dynamic = "force-dynamic";

/**
 * GET - Listar anuncios de una academia
 */
export const GET = withTenant(async (request, context) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const { params } = context;
    const academyId = (params as { academyId?: string })?.academyId;

    if (!academyId) {
      return apiError("VALIDATION_ERROR", "Academy ID requerido", 400);
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

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status") || "published";

    // Build query
    let query = db
      .select({
        id: announcementsTable.id,
        academyId: announcementsTable.academyId,
        authorId: announcementsTable.authorId,
        title: announcementsTable.title,
        content: announcementsTable.content,
        actionUrl: announcementsTable.actionUrl,
        actionLabel: announcementsTable.actionLabel,
        priority: announcementsTable.priority,
        category: announcementsTable.category,
        sentCount: announcementsTable.sentCount,
        readCount: announcementsTable.readCount,
        status: announcementsTable.status,
        publishedAt: announcementsTable.publishedAt,
        createdAt: announcementsTable.createdAt,
      })
      .from(announcementsTable)
      .where(
        and(
          eq(announcementsTable.academyId, academyId),
          eq(announcementsTable.status, status)
        )
      );

    const items = await query
      .orderBy(desc(announcementsTable.publishedAt))
      .limit(limit)
      .offset(offset);

    // Check if current user has read each announcement
    const itemsWithReadStatus = await Promise.all(
      items.map(async (item) => {
        const [readStatus] = await db
          .select()
          .from(announcementReadStatus)
          .where(
            and(
              eq(announcementReadStatus.announcementId, item.id),
              eq(announcementReadStatus.userId, profile.id)
            )
          )
          .limit(1);

        return {
          ...item,
          isRead: !!readStatus,
        };
      })
    );

    return apiSuccess({
      items: itemsWithReadStatus,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error listing announcements:", error);
    return apiError("INTERNAL_ERROR", "Error al listar anuncios", 500);
  }
});

/**
 * POST - Crear un nuevo anuncio
 */
const CreateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  actionUrl: z.string().url().optional(),
  actionLabel: z.string().max(50).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  category: z.enum(["general", "event", "billing", "class", "news"]).optional(),
  targetRoles: z.array(z.string()).optional(),
  classId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
});

export const POST = withTenant(async (request, context) => {
  try {
    const profile = context.profile;
    if (!profile) {
      return apiError("UNAUTHORIZED", "No autenticado", 401);
    }

    const { params } = context;
    const academyId = (params as { academyId?: string })?.academyId;

    if (!academyId) {
      return apiError("VALIDATION_ERROR", "Academy ID requerido", 400);
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
        "Solo owners y admins pueden crear anuncios",
        403
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return apiError("INVALID_JSON", "JSON inválido", 400);
    }

    const validated = CreateAnnouncementSchema.parse(body);
    const { title, content, actionUrl, actionLabel, priority, category, targetRoles, classId, eventId } =
      validated;

    // Create announcement
    const [announcement] = await db
      .insert(announcementsTable)
      .values({
        academyId,
        authorId: profile.id,
        title,
        content,
        actionUrl: actionUrl || null,
        actionLabel: actionLabel || null,
        priority: priority || "normal",
        category: category || "general",
        metadata: {
          targetRoles: targetRoles || undefined,
          classId: classId || undefined,
          eventId: eventId || undefined,
        },
        status: "published",
        publishedAt: new Date(),
      })
      .returning();

    // Get all academy members to notify
    const members = await db
      .select({
        userId: memberships.userId,
      })
      .from(memberships)
      .where(eq(memberships.academyId, academyId));

    // Send notifications to all members
    let notifiedCount = 0;
    for (const member of members) {
      if (member.userId === profile.userId) continue; // Don't notify self

      // In-app notification
      await createNotification({
        userId: member.userId,
        tenantId: profile.tenantId || "",
        type: "announcement",
        title: `Nuevo anuncio: ${title}`,
        message: content.substring(0, 100),
        data: {
          announcementId: announcement.id,
          academyId,
          priority: priority || "normal",
        },
      });

      // Push notification for high priority
      if (priority === "high" || priority === "urgent") {
        sendPushToUser(member.userId, {
          title: `Nuevo anuncio${priority === "urgent" ? " urgente" : ""}: ${title}`,
          body: content.substring(0, 100),
          icon: "/icons/icon-192x192.png",
          tag: `announcement-${announcement.id}`,
          requireInteraction: priority === "urgent",
          data: {
            announcementId: announcement.id,
            academyId,
            url: `/dashboard/announcements/${announcement.id}`,
          },
        }).catch(() => {});
      }

      notifiedCount++;
    }

    // Update sent count
    await db
      .update(announcementsTable)
      .set({ sentCount: String(notifiedCount) })
      .where(eq(announcementsTable.id, announcement.id));

    return apiSuccess({
      id: announcement.id,
      sentCount: notifiedCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        "Datos inválidos",
        400
      );
    }
    console.error("Error creating announcement:", error);
    return apiError("INTERNAL_ERROR", "Error al crear anuncio", 500);
  }
});
