import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { onboardingStates } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { markWizardStep, getOnboardingStatus } from "@/lib/onboarding";
import { WIZARD_STEP_KEYS } from "@/lib/onboarding-utils";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";
import { verifyAcademyAccess } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  academyId: z.string().uuid().optional(),
  step: z.enum(WIZARD_STEP_KEYS),
  notes: z.string().max(2000).optional(),
});

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const params = querySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!params.success) {
      return apiError("INVALID_QUERY", "Query inválido", 400);
    }

    const academyId = params.data.academyId;

    if (!academyId && !context.profile.activeAcademyId) {
      return apiSuccess({ state: null });
    }

    const scopedAcademyId = academyId ?? context.profile.activeAcademyId!;
    const access = await verifyAcademyAccess(scopedAcademyId, context.tenantId);
    if (!access.allowed) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);

    const state = await getOnboardingStatus(scopedAcademyId);
    return apiSuccess({ state });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/onboarding/state", method: "GET" });
  }
});

export const POST = withTenant(async (request, context) => {
  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("INVALID_PAYLOAD", "Payload inválido", 400);
  }

  const academyId = body.data.academyId ?? context.profile.activeAcademyId ?? null;
  if (!academyId) {
    return apiError("ACADEMY_REQUIRED", "Academy requerido", 400);
  }

  const access = await verifyAcademyAccess(academyId, context.tenantId);
  if (!access.allowed) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);

  await markWizardStep({
    academyId,
    tenantId: context.tenantId,
    step: body.data.step,
  });

  if (body.data.notes) {
    await db
      .update(onboardingStates)
      .set({
        notes: body.data.notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(onboardingStates.academyId, academyId),
          eq(onboardingStates.tenantId, context.tenantId)
        )
      );
  }

  const state = await getOnboardingStatus(academyId);

  return apiSuccess({
    ok: true,
    state,
  });
});
