import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { markAllNotificationsAsRead } from "@/lib/notifications/notification-service";

export const PUT = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = context.profile;

  await markAllNotificationsAsRead(context.tenantId, profile.id);

  return NextResponse.json({ ok: true });
});

