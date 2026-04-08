export const dynamic = 'force-dynamic';

import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getMonthlyFeeForAthlete } from "@/lib/billing/athlete-fees";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";

const QuerySchema = z.object({
  academyId: z.string().uuid(),
  athleteId: z.string().uuid(),
  groupId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const query = QuerySchema.parse(Object.fromEntries(url.searchParams));

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const feeCents = await getMonthlyFeeForAthlete(
      query.academyId,
      query.athleteId,
      query.groupId
    );

    return apiSuccess({ feeCents });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/billing/athlete-fee", method: "GET" }) as NextResponse;
  }
});

