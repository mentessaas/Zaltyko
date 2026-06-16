import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getScheduledNotifications, createScheduledNotification } from "@/lib/communication-service";
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

const createScheduledSchema = z.object({
  groupId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  channel: z.enum(["whatsapp", "email", "push", "in_app"]).default("whatsapp"),
  scheduledFor: z.string().datetime(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const scheduled = await getScheduledNotifications(context.tenantId);

  return apiSuccess({
    items: scheduled.map((s) => ({
      id: s.id,
      groupId: s.groupId,
      templateId: s.templateId,
      channel: s.channel,
      scheduledFor: s.scheduledFor?.toISOString(),
      status: s.status,
      sentAt: s.sentAt?.toISOString() || null,
      cancelledAt: s.cancelledAt?.toISOString() || null,
      createdAt: s.createdAt?.toISOString(),
    })),
    total: scheduled.length,
  });
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  try {
    const body = await request.json();
    const validated = createScheduledSchema.parse(body);

    const scheduled = await createScheduledNotification({
      tenantId: context.tenantId,
      groupId: validated.groupId,
      templateId: validated.templateId,
      channel: validated.channel,
      scheduledFor: new Date(validated.scheduledFor),
      status: "pending",
    });

    return apiCreated({
      id: scheduled.id,
      groupId: scheduled.groupId,
      templateId: scheduled.templateId,
      channel: scheduled.channel,
      scheduledFor: scheduled.scheduledFor?.toISOString(),
      status: scheduled.status,
      createdAt: scheduled.createdAt?.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }
    logger.error("Error creating scheduled notification:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});
