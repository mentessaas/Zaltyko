import { apiSuccess, apiError } from "@/lib/api-response";

import { getDashboardData } from "@/lib/dashboard";
import { withTenant } from "@/lib/authz";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (_request, context) => {
  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const { data } = await getDashboardData(academyId);

  return apiSuccess(data);
});

