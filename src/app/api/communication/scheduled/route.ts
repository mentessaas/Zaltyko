/**
 * Scheduled Notifications API
 * CRUD operations for scheduled notifications
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import {
  createScheduledNotification,
  getScheduledNotifications,
  cancelScheduledNotification,
} from "@/lib/communication-service";
import { createNotification } from "@/lib/notifications/notification-service";

const createScheduledSchema = z.object({
  userId: z.string().uuid().optional(),
  type: z.string().min(1, "Type is required"),
  title: z.string().min(1, "Title is required"),
  message: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  scheduledFor: z.string().transform((str) => new Date(str)),
});

export const dynamic = 'force-dynamic';

// GET /api/communication/scheduled - List all scheduled notifications
export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const userId = url.searchParams.get("userId");

  try {
    const notifications = await getScheduledNotifications(context.tenantId, {
      status: status || undefined,
      userId: userId || undefined,
    });

    return NextResponse.json({
      items: notifications.map((n) => ({
        id: n.id,
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data,
        scheduledFor: n.scheduledFor?.toISOString(),
        status: n.status,
        sentAt: n.sentAt?.toISOString(),
        errorMessage: n.errorMessage,
        createdAt: n.createdAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching scheduled notifications:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});

// POST /api/communication/scheduled - Create a new scheduled notification
export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validated = createScheduledSchema.parse(body);

    // Validate scheduledFor is in the future
    if (validated.scheduledFor <= new Date()) {
      return NextResponse.json(
        { error: "SCHEDULED_FOR_MUST_BE_FUTURE" },
        { status: 400 }
      );
    }

    const notification = await createScheduledNotification({
      academyId: context.tenantId,
      ...validated,
      createdBy: context.profile.id,
    });

    return NextResponse.json({
      id: notification.id,
      scheduledFor: notification.scheduledFor?.toISOString(),
      message: "Notificación programada correctamente",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: error.errors }, { status: 400 });
    }
    console.error("Error creating scheduled notification:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});
