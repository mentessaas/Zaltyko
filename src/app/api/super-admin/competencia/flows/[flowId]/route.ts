import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
  readJson,
  validationError,
} from "@/lib/competencia/api";
import { FlowInputSchema } from "@/lib/competencia/contracts";
import { updateFlow } from "@/lib/competencia/mutations";

const ParamsSchema = z.object({ flowId: z.guid() });

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */
export const PATCH = withSuperAdmin(async (request, context) => {
  const params = ParamsSchema.safeParse(context.params);
  if (!params.success)
    return apiError("VALIDATION_ERROR", "Identificador de flujo inválido", 400);
  const parsed = FlowInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const flow = await updateFlow(
      params.data.flowId,
      parsed.data,
      context.profile.id
    );
    await logCompetenciaAction({
      userId: context.userId,
      action: "flow_updated",
      resourceType: "ci_flow",
      resourceId: flow.id,
      resourceName: flow.name,
      description: `Flujo actualizado: ${flow.name}`,
    });
    return apiSuccess({ id: flow.id });
  } catch (error) {
    return competenciaErrorResponse(error);
  }
});
