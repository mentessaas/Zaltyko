import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { deleteNotification } from "@/lib/notifications/notification-service";

export const DELETE = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = context.profile;

  const notificationId = (context.params as { notificationId?: string } | undefined)
    ?.notificationId;

  if (!notificationId) {
    return NextResponse.json({ error: "NOTIFICATION_ID_REQUIRED" }, { status: 400 });
  }

  await deleteNotification(notificationId, context.tenantId);

  return NextResponse.json({ ok: true });
});

