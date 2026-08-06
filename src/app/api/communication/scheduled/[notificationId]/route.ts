import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getScheduledNotificationById, cancelScheduledNotification } from "@/lib/communication-service";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";

export const dynamic = 'force-dynamic';

export const DELETE = withTenant(async (request, context) => {
  const { notificationId } = context.params as { notificationId: string };

  const existing = await getScheduledNotificationById(notificationId);

  if (!existing) {
    return apiError("NOT_FOUND", "Notification not found", 404);
  }

  if (!existing.academyId) return apiError("NOT_FOUND", "Notification not found", 404);
  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: existing.tenantId ?? "",
    academyId: existing.academyId,
    permission: "communications:send",
  });
  if (!scope.allowed) return apiError("NOT_FOUND", "Notification not found", 404);

  if (existing.status !== "pending") {
    return apiError("CANNOT_CANCEL_NON_PENDING", "Cannot cancel non-pending notification", 400);
  }

  const cancelled = await cancelScheduledNotification(notificationId);

  if (!cancelled) {
    return apiError("NOT_FOUND", "Notification not found", 404);
  }

  return apiSuccess({
    id: cancelled.id,
    status: cancelled.status,
    cancelledAt: cancelled.cancelledAt?.toISOString(),
  });
});
