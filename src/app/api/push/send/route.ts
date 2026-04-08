import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { sendPushToUser, isPushConfigured } from "@/lib/notifications/push-service";
import { createNotification } from "@/lib/notifications/notification-service";

export const dynamic = 'force-dynamic';

const sendPushSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  icon: z.string().url().optional(),
  data: z.record(z.unknown()).optional(),
  tag: z.string().optional(),
  requireInteraction: z.boolean().optional(),
  alsoCreateInApp: z.boolean().optional(),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  if (!isPushConfigured()) {
    return apiError("PUSH_NOT_CONFIGURED", "Push notifications are not configured on this server", 503);
  }

  try {
    const body = await request.json();
    const validated = sendPushSchema.parse(body);

    // Send push notification
    const pushResult = await sendPushToUser(validated.userId, {
      title: validated.title,
      body: validated.body,
      icon: validated.icon,
      data: validated.data,
      tag: validated.tag,
      requireInteraction: validated.requireInteraction,
    });

    // Optionally create in-app notification as well
    if (validated.alsoCreateInApp) {
      await createNotification({
        tenantId: context.tenantId,
        userId: validated.userId,
        type: "push_notification",
        title: validated.title,
        message: validated.body,
        data: validated.data,
      });
    }

    return apiSuccess({
      ok: true,
      push: {
        sent: pushResult.sent,
        failed: pushResult.failed,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }
    console.error("Error sending push notification:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});
