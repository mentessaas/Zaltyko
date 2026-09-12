import { apiSuccess } from "@/lib/api-response";

import { withSuperAdmin } from "@/lib/authz";
import { getSuperAdminLogsPage } from "@/lib/super-admin";

export const dynamic = "force-dynamic";

export const GET = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const pageParam = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const page = Number.isFinite(pageParam) ? Math.max(1, pageParam) : 1;
  const pageSize = Number.isFinite(limitParam) ? Math.min(200, Math.max(1, limitParam)) : 100;
  const result = await getSuperAdminLogsPage({ page, pageSize });

  return apiSuccess({
    items: result.items,
    total: result.total,
    page: result.page,
    pageSize,
    totalPages: result.totalPages,
    hasNextPage: result.page < result.totalPages,
    hasPreviousPage: result.page > 1,
  });
});

