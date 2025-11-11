import { NextResponse } from "next/server";

import { withSuperAdmin } from "@/lib/authz";
import { getGlobalStats } from "@/lib/superAdminService";

export const dynamic = "force-dynamic";

export const GET = withSuperAdmin(async () => {
  const stats = await getGlobalStats();
  return NextResponse.json(stats);
});

