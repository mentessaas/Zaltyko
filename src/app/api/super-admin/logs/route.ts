import { NextResponse } from "next/server";

import { withSuperAdmin } from "@/lib/authz";
import { getSuperAdminLogs } from "@/lib/super-admin";

export const dynamic = "force-dynamic";

export const GET = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Number(limitParam) || 100, 500) : 100;

  const logs = await getSuperAdminLogs(limit);

  return NextResponse.json({ items: logs });
});

