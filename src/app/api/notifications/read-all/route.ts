import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { markAllNotificationsAsRead } from "@/lib/notifications/notification-service";

export const PUT = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const profile = context.profile;

  await markAllNotificationsAsRead(context.tenantId, profile.id);

  return apiSuccess({ ok: true });
});

