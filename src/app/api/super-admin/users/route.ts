import { NextResponse } from "next/server";

import { withSuperAdmin } from "@/lib/authz";
import { getAllUsers } from "@/lib/superAdminService";

export const dynamic = "force-dynamic";

export const GET = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const roleFilter = url.searchParams.get("role") ?? undefined;
  const searchQuery = url.searchParams.get("q")?.toLowerCase() ?? undefined;
  const statusFilter = url.searchParams.get("status") as "active" | "suspended" | undefined;

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

  return NextResponse.json({
    total: filtered.length,
    items: filtered,
  });
});

