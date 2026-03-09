import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getUserNotifications } from "@/lib/notifications/notification-service";

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  unreadOnly: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
  type: z.string().optional(),
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
    offset: url.searchParams.get("offset"),
    type: url.searchParams.get("type"),
  };

  const validated = querySchema.parse(params);

  const notifications = await getUserNotifications(context.tenantId, profile.id, {
    unreadOnly: validated.unreadOnly === "true",
    limit: validated.limit ? parseInt(validated.limit) : undefined,
    offset: validated.offset ? parseInt(validated.offset) : undefined,
    type: validated.type || undefined,
  });

  return NextResponse.json({
    items: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      readAt: n.readAt?.toISOString() || null,
      createdAt: n.createdAt?.toISOString(),
      data: n.data,
    })),
  });
});
