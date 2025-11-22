import { NextResponse } from "next/server";
import { withTenant, getCurrentProfile } from "@/lib/authz";
import { markNotificationAsRead } from "@/lib/notifications/notification-service";

export const PUT = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = await getCurrentProfile(_request);
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const notificationId = (context.params as { notificationId?: string } | undefined)
    ?.notificationId;

  if (!notificationId) {
    return NextResponse.json({ error: "NOTIFICATION_ID_REQUIRED" }, { status: 400 });
  }

  await markNotificationAsRead(notificationId, context.tenantId);

  return NextResponse.json({ ok: true });
});

