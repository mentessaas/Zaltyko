import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
  readJson,
  validationError,
} from "@/lib/competencia/api";
import { CompetitorUpdateSchema } from "@/lib/competencia/contracts";
import { updateCompetitor } from "@/lib/competencia/mutations";

const ParamsSchema = z.object({ competitorId: z.guid() });

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */
export const PATCH = withSuperAdmin(async (request, context) => {
  const params = ParamsSchema.safeParse(context.params);
  if (!params.success)
    return apiError(
      "VALIDATION_ERROR",
      "Identificador de competidor inválido",
      400
    );
  const parsed = CompetitorUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const competitor = await updateCompetitor(
      params.data.competitorId,
      parsed.data,
      context.profile.id
    );
    await logCompetenciaAction({
      userId: context.userId,
      action: parsed.data.lifecycleStatus
        ? `competitor_${parsed.data.lifecycleStatus}`
        : "competitor_updated",
      resourceType: "ci_competitor",
      resourceId: competitor.id,
      resourceName: competitor.name,
      description: `Competidor actualizado: ${competitor.name}`,
    });
    return apiSuccess({
      id: competitor.id,
      slug: competitor.slug,
      lifecycleStatus: competitor.lifecycleStatus,
    });
  } catch (error) {
    return competenciaErrorResponse(error);
  }
});
