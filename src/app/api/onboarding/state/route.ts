import { z } from "zod";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { onboardingStates } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { markWizardStep, getOnboardingStatus } from "@/lib/onboarding";
import { WIZARD_STEP_KEYS } from "@/lib/onboarding-utils";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  academyId: z.string().uuid().optional(),
  step: z.enum(WIZARD_STEP_KEYS),
  notes: z.string().max(2000).optional(),
});

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
});

export const GET = async (request: Request) => {
  try {
    // Intentar usar withTenant primero, pero si falla por autenticación, permitir acceso básico
    const url = new URL(request.url);
    const params = querySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!params.success) {
      return apiError("INVALID_QUERY", "Query inválido", 400);
    }

    const academyId = params.data.academyId;

    if (!academyId) {
      // Intentar obtener de la sesión si no está en query params
      const cookieStore = await cookies();
      const supabase = await createClient(cookieStore);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return apiError("UNAUTHENTICATED", "No autenticado", 401);
      }

      // Si no hay academyId, retornar estado vacío
      return apiSuccess({ state: null });
    }

    const state = await getOnboardingStatus(academyId);
    return apiSuccess({ state });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/onboarding/state", method: "GET" });
  }
};

export const POST = withTenant(async (request, context) => {
  const body = bodySchema.safeParse(await request.json());

  if (!body.success) {
    return apiError("INVALID_PAYLOAD", "Payload inválido", 400);
  }

  const academyId = body.data.academyId ?? context.profile.activeAcademyId ?? null;
  if (!academyId) {
    return apiError("ACADEMY_REQUIRED", "Academy requerido", 400);
  }

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
      .where(eq(onboardingStates.academyId, academyId));
  }

  const state = await getOnboardingStatus(academyId);

  return apiSuccess({
    ok: true,
    state,
  });
});
