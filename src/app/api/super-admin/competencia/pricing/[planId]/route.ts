import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
  readJson,
  validationError,
} from "@/lib/competencia/api";
import { PricingPlanSchema } from "@/lib/competencia/contracts";
import { updatePricingPlan } from "@/lib/competencia/mutations";

const ParamsSchema = z.object({ planId: z.guid() });

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */
export const PATCH = withSuperAdmin(async (request, context) => {
  const params = ParamsSchema.safeParse(context.params);
  if (!params.success)
    return apiError("VALIDATION_ERROR", "Identificador de plan inválido", 400);
  const parsed = PricingPlanSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const plan = await updatePricingPlan(
      params.data.planId,
      parsed.data,
      context.profile.id
    );
    await logCompetenciaAction({
      userId: context.userId,
      action: "pricing_updated",
      resourceType: "ci_pricing_plan",
      resourceId: plan.id,
      resourceName: plan.planName,
      description: `Plan de precios actualizado: ${plan.planName}`,
    });
    return apiSuccess({ id: plan.id });
  } catch (error) {
    return competenciaErrorResponse(
      error,
      "Este competidor ya tiene un plan con ese nombre"
    );
  }
});
