import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { markNotificationAsRead } from "@/lib/notifications/notification-service";

/** @resource-scope self — service filters by tenant and current profile id. */

export const PUT = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const profile = context.profile;

  const notificationId = (context.params as { notificationId?: string } | undefined)
    ?.notificationId;

  if (!notificationId) {
    return apiError("NOTIFICATION_ID_REQUIRED", "Notification ID is required", 400);
  }

  await markNotificationAsRead(notificationId, context.tenantId, profile.id);

  return apiSuccess({ ok: true });
});
