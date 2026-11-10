import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
  readJson,
  validationError,
} from "@/lib/competencia/api";
import { FlowCoverageSchema } from "@/lib/competencia/contracts";
import { upsertFlowCoverage } from "@/lib/competencia/mutations";

const ParamsSchema = z.object({ competitorId: z.guid() });

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */
export const PUT = withSuperAdmin(async (request, context) => {
  const params = ParamsSchema.safeParse(context.params);
  if (!params.success)
    return apiError(
      "VALIDATION_ERROR",
      "Identificador de competidor inválido",
      400
    );
  const parsed = FlowCoverageSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const row = await upsertFlowCoverage(
      params.data.competitorId,
      parsed.data,
      context.profile.id
    );
    await logCompetenciaAction({
      userId: context.userId,
      action: "coverage_saved",
      resourceType: "ci_competitor_flow",
      resourceId: row.id,
      description: `Cobertura de flujo guardada (${row.coverage})`,
    });
    return apiSuccess({ id: row.id });
  } catch (error) {
    return competenciaErrorResponse(error);
  }
});
