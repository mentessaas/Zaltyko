import { apiSuccess, apiError } from "@/lib/api-response";

import { getDashboardData } from "@/lib/dashboard";
import { withTenant } from "@/lib/authz";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (_request, context) => {
  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const access = await verifyAcademyAccessForProfile({
    academyId,
    tenantId: context.tenantId,
    profile: context.profile,
  });
  if (!access.allowed) {
    return apiError(access.reason ?? "FORBIDDEN", "Access denied", 403);
  }

  const { data } = await getDashboardData(academyId);

  return apiSuccess(data);
});
