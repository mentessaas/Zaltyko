import { apiSuccess } from "@/lib/api-response";

import { withSuperAdmin } from "@/lib/authz";
import { getRecentEvents } from "@/lib/superAdminService";

export const dynamic = "force-dynamic";

export const GET = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "10", 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(50, Math.max(1, requestedLimit))
    : 10;

  return apiSuccess(await getRecentEvents(limit));
});
