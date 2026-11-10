import { apiCreated, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
  readJson,
  validationError,
} from "@/lib/competencia/api";
import { FlowInputSchema } from "@/lib/competencia/contracts";
import { createFlow } from "@/lib/competencia/mutations";
import { listFlows } from "@/lib/competencia/storage";

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */
export const GET = withSuperAdmin(async () => {
  try {
    const items = await listFlows();
    return apiSuccess({ items }, { total: items.length });
  } catch (error) {
    return competenciaErrorResponse(error);
  }
});

export const POST = withSuperAdmin(async (request, context) => {
  const parsed = FlowInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const flow = await createFlow(parsed.data, context.profile.id);
    await logCompetenciaAction({
      userId: context.userId,
      action: "flow_created",
      resourceType: "ci_flow",
      resourceId: flow.id,
      resourceName: flow.name,
      description: `Flujo añadido: ${flow.name}`,
    });
    return apiCreated({ id: flow.id });
  } catch (error) {
    return competenciaErrorResponse(error, "Ya existe un flujo con ese nombre");
  }
});
