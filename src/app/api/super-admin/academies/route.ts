import { NextResponse } from "next/server";

import { withSuperAdmin } from "@/lib/authz";
import { getAllAcademies } from "@/lib/superAdminService";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export const GET = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const planFilter = url.searchParams.get("plan") ?? undefined;
  const typeFilter = url.searchParams.get("type") ?? undefined;
  const countryFilter = url.searchParams.get("country") ?? undefined;
  const statusFilter = url.searchParams.get("status") as "active" | "suspended" | undefined;
  
  // Paginación
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10))
  );

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

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const paginatedItems = filtered.slice(offset, offset + pageSize);

  return NextResponse.json({
    total,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    items: paginatedItems,
  });
});

