import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import {
  getScheduledNotifications,
  createScheduledNotification,
  getMessageGroupById,
  getMessageTemplateById,
} from "@/lib/communication-service";
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

const createScheduledSchema = z.object({
  academyId: z.string().uuid(),
  groupId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  channel: z.enum(["whatsapp", "email", "push", "in_app"]).default("whatsapp"),
  scheduledFor: z.string().datetime(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }
  const academyId = new URL(request.url).searchParams.get("academyId");
  if (!academyId || !z.string().uuid().safeParse(academyId).success) {
    return apiError("ACADEMY_REQUIRED", "Academy ID is required", 400);
  }
  const scheduled = await getScheduledNotifications(context.tenantId, academyId);

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

    if (validated.groupId) {
      const group = await getMessageGroupById(validated.groupId);
      if (!group || group.tenantId !== context.tenantId || group.academyId !== validated.academyId) {
        return apiError("FORBIDDEN", "El grupo no pertenece al tenant activo", 403);
      }
    }
    if (validated.templateId) {
      const template = await getMessageTemplateById(validated.templateId);
      if (
        !template ||
        (template.tenantId && template.tenantId !== context.tenantId) ||
        (template.academyId && template.academyId !== validated.academyId)
      ) {
        return apiError("FORBIDDEN", "La plantilla no pertenece al tenant activo", 403);
      }
    }

    const scheduled = await createScheduledNotification({
      tenantId: context.tenantId,
      academyId: validated.academyId,
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
