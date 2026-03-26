/**
 * Single Scheduled Notification API
 * Cancel a scheduled notification
 */

import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { cancelScheduledNotification } from "@/lib/communication-service";

export const dynamic = 'force-dynamic';

// DELETE /api/communication/scheduled/[notificationId] - Cancel a scheduled notification
export const DELETE = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const notificationId = (context.params as { notificationId?: string } | undefined)?.notificationId;
  if (!notificationId) {
    return NextResponse.json({ error: "NOTIFICATION_ID_REQUIRED" }, { status: 400 });
  }

  try {
    await cancelScheduledNotification(notificationId, context.tenantId);
    return NextResponse.json({ ok: true, message: "Notificación cancelada" });
  } catch (error) {
    console.error("Error cancelling scheduled notification:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});
