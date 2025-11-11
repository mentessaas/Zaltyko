import { NextResponse } from "next/server";

import { getDashboardData } from "@/lib/dashboard";
import { withTenant } from "@/lib/authz";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (_request, context) => {
  const academyId = context.params?.academyId;

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const { data } = await getDashboardData(academyId);

  return NextResponse.json(data);
});

