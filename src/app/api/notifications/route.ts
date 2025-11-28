import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getUserNotifications } from "@/lib/notifications/notification-service";

const querySchema = z.object({
  unreadOnly: z.string().optional(),
  limit: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = context.profile;

  const url = new URL(request.url);
  const params = {
    unreadOnly: url.searchParams.get("unreadOnly"),
    limit: url.searchParams.get("limit"),
  };

  const validated = querySchema.parse(params);

  const notifications = await getUserNotifications(context.tenantId, profile.id, {
    unreadOnly: validated.unreadOnly === "true",
    limit: validated.limit ? parseInt(validated.limit) : undefined,
  });

  return NextResponse.json({
    items: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt?.toISOString(),
      data: n.data,
    })),
  });
});

