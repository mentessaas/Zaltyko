import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getUnreadCount } from "@/lib/notifications/notification-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  if (!context.profile) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401);
  }

  // Obtener userId del profile
  const userId = context.profile.userId;
  if (!userId) {
    return apiError("USER_ID_REQUIRED", "User ID is required", 400);
  }

  try {
    const count = await getUnreadCount(context.tenantId, userId);
    return apiSuccess({ count });
  } catch (error) {
    logger.error("Error getting unread count", error, { userId, tenantId: context.tenantId });
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});

