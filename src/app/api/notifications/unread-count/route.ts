import { NextResponse } from "next/server";
import { withTenant, getCurrentProfile } from "@/lib/authz";
import { getUnreadCount } from "@/lib/notifications/notification-service";

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = await getCurrentProfile(_request);
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const count = await getUnreadCount(context.tenantId, profile.id);

  return NextResponse.json({ count });
});

