export const dynamic = 'force-dynamic';

import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { getChecklist } from "@/lib/onboarding";
import { CHECKLIST_DEFINITIONS } from "@/lib/onboarding-utils";
import { apiSuccess, apiError } from "@/lib/api-response";
import { verifyAcademyAccess } from "@/lib/permissions";

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const params = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!params.success) {
    return apiError("INVALID_QUERY", "Query inválido", 400);
  }

  const academyId = params.data.academyId ?? context.profile.activeAcademyId ?? null;
  if (!academyId) {
    return apiError("ACADEMY_REQUIRED", "Academy requerido", 400);
  }

  const access = await verifyAcademyAccess(academyId, context.tenantId);
  if (!access.allowed) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);

  const items = await getChecklist(academyId);
  const completed = items.filter((item) => item.status === "completed").length;
  const total = CHECKLIST_DEFINITIONS.length;

  return apiSuccess({
    items,
    summary: {
      completed,
      total,
    },
  });
});
