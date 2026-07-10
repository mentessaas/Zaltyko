import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getScheduledNotificationById, cancelScheduledNotification } from "@/lib/communication-service";

export const dynamic = 'force-dynamic';

const canManageCommunication = (role?: string) =>
  ["owner", "admin", "super_admin"].includes(role ?? "");

export const DELETE = withTenant(async (request, context) => {
  if (!canManageCommunication(context.profile?.role)) {
    return apiError("FORBIDDEN", "No tienes permiso para cancelar comunicaciones", 403);
  }
  const { notificationId } = context.params as { notificationId: string };

  const existing = await getScheduledNotificationById(notificationId);

  if (!existing) {
    return apiError("NOT_FOUND", "Notification not found", 404);
  }

  if (existing.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

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
