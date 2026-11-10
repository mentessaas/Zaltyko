import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
  readJson,
  validationError,
} from "@/lib/competencia/api";
import { SourceUpdateSchema } from "@/lib/competencia/contracts";
import { updateSource } from "@/lib/competencia/mutations";

const ParamsSchema = z.object({ sourceId: z.guid() });

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */
export const PATCH = withSuperAdmin(async (request, context) => {
  const params = ParamsSchema.safeParse(context.params);
  if (!params.success)
    return apiError(
      "VALIDATION_ERROR",
      "Identificador de fuente inválido",
      400
    );
  const parsed = SourceUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const source = await updateSource(
      params.data.sourceId,
      parsed.data,
      context.profile.id
    );
    await logCompetenciaAction({
      userId: context.userId,
      action: "source_updated",
      resourceType: "ci_source",
      resourceId: source.id,
      resourceName: source.title ?? source.url,
      description: "Fuente actualizada",
    });
    return apiSuccess({ id: source.id });
  } catch (error) {
    return competenciaErrorResponse(error);
  }
});
