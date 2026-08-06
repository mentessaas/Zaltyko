import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getUserNotifications } from "@/lib/notifications/notification-service";

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  type: z.string().min(1).max(100).optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const profile = context.profile;

  const url = new URL(request.url);
  const params = {
    unreadOnly: url.searchParams.get("unreadOnly") || undefined,
    limit: url.searchParams.get("limit") || undefined,
    offset: url.searchParams.get("offset") || undefined,
    type: url.searchParams.get("type") || undefined,
  };

  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Parámetros de consulta inválidos", 400);
  }
  const validated = parsed.data;

  const notifications = await getUserNotifications(context.tenantId, profile.id, {
    unreadOnly: validated.unreadOnly === "true",
    limit: validated.limit,
    offset: validated.offset,
    type: validated.type || undefined,
  });

  return apiSuccess({
    items: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      readAt: n.readAt?.toISOString() || null,
      createdAt: n.createdAt?.toISOString(),
      data: n.data,
    })),
  });
});
