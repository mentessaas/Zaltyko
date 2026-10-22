import { z } from "zod";

import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getBillingAcademyAccess } from "@/lib/billing/access";
import { startAcademyTrial } from "@/lib/billing/trial-service";

const BodySchema = z.object({
  academyId: z.string().uuid(),
});

export const POST = withTenant(async (request, context) => {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Academia no válida", 400);
  }

  const academy = await getBillingAcademyAccess({
    academyId: parsed.data.academyId,
    userId: context.userId,
    profileId: context.profile.id,
    profileRole: context.profile.role,
  });
  if (!academy) {
    return apiError("BILLING_FORBIDDEN", "Solo la persona propietaria puede iniciar la prueba", 403);
  }

  const result = await startAcademyTrial({
    academyId: academy.id,
    tenantId: academy.tenantId,
    userId: context.userId,
  });

  if (!result.created && !result.status.active) {
    return apiError("TRIAL_NOT_ELIGIBLE", "Esta academia no puede iniciar otra prueba todavía", 409, {
      reason: result.status.reason,
      nextEligibleAt: result.status.nextEligibleAt,
    });
  }

  return result.created ? apiCreated(result.status) : apiSuccess(result.status);
});
