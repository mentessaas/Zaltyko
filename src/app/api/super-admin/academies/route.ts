import { NextResponse } from "next/server";

import { withSuperAdmin } from "@/lib/authz";
import { getAllAcademies } from "@/lib/superAdminService";

export const dynamic = "force-dynamic";

export const GET = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const planFilter = url.searchParams.get("plan") ?? undefined;
  const typeFilter = url.searchParams.get("type") ?? undefined;
  const countryFilter = url.searchParams.get("country") ?? undefined;
  const statusFilter = url.searchParams.get("status") as "active" | "suspended" | undefined;

  const items = await getAllAcademies();

  const filtered = items.filter((academy) => {
    if (planFilter && academy.planCode !== planFilter) return false;
    if (typeFilter && academy.academyType !== typeFilter) return false;
    if (countryFilter && academy.country !== countryFilter) return false;
    if (statusFilter) {
      const isSuspended = statusFilter === "suspended";
      if (academy.isSuspended !== isSuspended) return false;
    }
    return true;
  });

  return NextResponse.json({
    total: filtered.length,
    items: filtered,
  });
});

