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

const canViewCommunication = (role?: string) =>
  ["owner", "admin", "coach", "super_admin"].includes(role ?? "");
const canManageCommunication = (role?: string) =>
  ["owner", "admin", "super_admin"].includes(role ?? "");

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
  if (!canViewCommunication(context.profile?.role)) {
    return apiError("FORBIDDEN", "No tienes permiso para consultar comunicaciones programadas", 403);
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
  if (!canManageCommunication(context.profile?.role)) {
    return apiError("FORBIDDEN", "No tienes permiso para programar comunicaciones", 403);
  }

  try {
    const body = await request.json();
    const validated = createScheduledSchema.parse(body);

    if (validated.groupId) {
      const group = await getMessageGroupById(validated.groupId);
      if (!group || group.tenantId !== context.tenantId) {
        return apiError("FORBIDDEN", "El grupo no pertenece al tenant activo", 403);
      }
    }
    if (validated.templateId) {
      const template = await getMessageTemplateById(validated.templateId);
      if (!template || template.tenantId !== context.tenantId) {
        return apiError("FORBIDDEN", "La plantilla no pertenece al tenant activo", 403);
      }
    }

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
