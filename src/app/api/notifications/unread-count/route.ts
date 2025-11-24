import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { getUnreadCount } from "@/lib/notifications/notification-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  if (!context.profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Obtener userId del profile
  const userId = context.profile.userId;
  if (!userId) {
    return NextResponse.json({ error: "USER_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const count = await getUnreadCount(context.tenantId, userId);
    return NextResponse.json({ count });
  } catch (error) {
    logger.error("Error getting unread count", error, { userId, tenantId: context.tenantId });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});

