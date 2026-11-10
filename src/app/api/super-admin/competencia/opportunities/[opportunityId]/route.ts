import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
  readJson,
  validationError,
} from "@/lib/competencia/api";
import { OpportunityInputSchema } from "@/lib/competencia/contracts";
import { updateOpportunity } from "@/lib/competencia/mutations";

const ParamsSchema = z.object({ opportunityId: z.guid() });

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */
export const PATCH = withSuperAdmin(async (request, context) => {
  const params = ParamsSchema.safeParse(context.params);
  if (!params.success)
    return apiError(
      "VALIDATION_ERROR",
      "Identificador de oportunidad inválido",
      400
    );
  const parsed = OpportunityInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const opportunity = await updateOpportunity(
      params.data.opportunityId,
      parsed.data,
      context.profile.id
    );
    await logCompetenciaAction({
      userId: context.userId,
      action: "opportunity_updated",
      resourceType: "ci_opportunity",
      resourceId: opportunity.id,
      resourceName: opportunity.title,
      description: `Oportunidad actualizada: ${opportunity.title}`,
    });
    return apiSuccess({ id: opportunity.id });
  } catch (error) {
    return competenciaErrorResponse(
      error,
      "Ya existe una oportunidad con ese título"
    );
  }
});
