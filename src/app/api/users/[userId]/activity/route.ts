export const dynamic = "force-dynamic";

import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import {
  getUserActivityStats,
  getUserActivityTimeline,
} from "@/lib/authz/audit-service";

const QuerySchema = z.object({
  academyId: z.string().uuid().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

/** @resource-scope self — another user additionally requires settings:users on the requested academy. */
export const GET = withTenant(async (request, context) => {
  const userId = (context.params as { userId?: string } | undefined)?.userId;
  if (!userId) return apiError("USER_ID_REQUIRED", "User ID required", 400);

  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid query", 400, parsed.error.flatten());

  const isSelf = context.profile.userId === userId;
  const academyId = parsed.data.academyId ?? context.profile.activeAcademyId ?? undefined;
  if (!isSelf) {
    if (!academyId) return apiError("ACADEMY_REQUIRED", "Academy ID required", 400);
    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: context.tenantId,
      academyId,
      permission: "settings:users",
    });
    if (!scope.allowed) return apiError("USER_NOT_FOUND", "User not found", 404);
  }

  const [stats, timeline] = await Promise.all([
    getUserActivityStats(userId, academyId, parsed.data.days),
    getUserActivityTimeline(userId, academyId, parsed.data.days),
  ]);

  return apiSuccess({ stats, timeline });
});
