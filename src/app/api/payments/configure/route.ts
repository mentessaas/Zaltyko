import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiError, apiSuccess } from "@/lib/api-response";
import { verifyAcademyAccess } from "@/lib/permissions";
import { markChecklistItem, markWizardStep } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";

const bodySchema = z.object({
  academyId: z.string().uuid(),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("INVALID_PAYLOAD", "Payload inválido", 400, parsed.error.issues);
  }

  const access = await verifyAcademyAccess(parsed.data.academyId, context.tenantId, context.profile);
  if (!access.allowed) {
    return apiError(access.reason ?? "FORBIDDEN", "Access denied", 403);
  }

  const now = new Date();

  await db
    .update(academies)
    .set({
      paymentsConfiguredAt: now,
    })
    .where(eq(academies.id, parsed.data.academyId));

  await markChecklistItem({
    academyId: parsed.data.academyId,
    tenantId: context.tenantId,
    key: "enable_payments",
  });

  await markWizardStep({
    academyId: parsed.data.academyId,
    tenantId: context.tenantId,
    step: "payments-team",
  });

  await trackEvent("payments_configured", {
    academyId: parsed.data.academyId,
    tenantId: context.tenantId,
    userId: context.userId,
  });

  return apiSuccess({ configuredAt: now.toISOString() });
});
