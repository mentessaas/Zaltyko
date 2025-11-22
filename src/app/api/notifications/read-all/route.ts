import { NextResponse } from "next/server";
import { withTenant, getCurrentProfile } from "@/lib/authz";
import { markAllNotificationsAsRead } from "@/lib/notifications/notification-service";

export const PUT = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = await getCurrentProfile(_request);
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await markAllNotificationsAsRead(context.tenantId, profile.id);

  return NextResponse.json({ ok: true });
});

