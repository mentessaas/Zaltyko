export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";

import {
  getUserActivityStats,
  getUserActivityTimeline,
} from "@/lib/authz/audit-service";
import { withTenant } from "@/lib/authz";

// GET /api/users/[userId]/activity
export const GET = withTenant(async (request, context) => {
  const { searchParams } = new URL(request.url);
  const params = context.params as { userId: string };
  const userId = params?.userId;
  const days = parseInt(searchParams.get("days") || "30");
  const academyId = searchParams.get("academyId") || context.tenantId;

  if (!userId) {
    return NextResponse.json({ error: "USER_ID_REQUIRED" }, { status: 400 });
  }

  // Verificar que el usuario es el mismo o es admin
  const isSelf = context.profile.userId === userId;
  const isAdmin = ["owner", "admin", "super_admin"].includes(context.profile.role);

  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const [stats, timeline] = await Promise.all([
    getUserActivityStats(userId, academyId, days),
    getUserActivityTimeline(userId, academyId, days),
  ]);

  return NextResponse.json({
    stats,
    timeline,
  });
});