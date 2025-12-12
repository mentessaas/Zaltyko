import { NextResponse } from "next/server";

import { withSuperAdmin } from "@/lib/authz";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { getAllUsers } from "@/lib/superAdminService";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// Aplicar rate limiting: 50 requests por minuto para Super Admin
const handler = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const roleFilter = url.searchParams.get("role") ?? undefined;
  const searchQuery = url.searchParams.get("q")?.toLowerCase() ?? undefined;
  const statusFilter = url.searchParams.get("status") as "active" | "suspended" | undefined;
  
  // Paginación
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10))
  );

  const items = await getAllUsers();

  const filtered = items.filter((user) => {
    if (roleFilter && user.role !== roleFilter) return false;
    if (statusFilter) {
      const isSuspended = statusFilter === "suspended";
      if (user.isSuspended !== isSuspended) return false;
    }
    if (searchQuery) {
      const haystack = `${user.fullName ?? ""} ${user.email ?? ""}`.toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
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

export const GET = withRateLimit(
  async (request) => {
    return (await handler(request, {} as any)) as NextResponse;
  },
  { identifier: getUserIdentifier }
);

