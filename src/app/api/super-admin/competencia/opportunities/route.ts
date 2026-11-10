import { apiCreated, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
  readJson,
  validationError,
} from "@/lib/competencia/api";
import { OpportunityInputSchema } from "@/lib/competencia/contracts";
import { createOpportunity } from "@/lib/competencia/mutations";
import { listOpportunities } from "@/lib/competencia/storage";

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */
export const GET = withSuperAdmin(async () => {
  try {
    const items = await listOpportunities();
    return apiSuccess({ items }, { total: items.length });
  } catch (error) {
    return competenciaErrorResponse(error);
  }
});

export const POST = withSuperAdmin(async (request, context) => {
  const parsed = OpportunityInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const opportunity = await createOpportunity(
      parsed.data,
      context.profile.id
    );
    await logCompetenciaAction({
      userId: context.userId,
      action: "opportunity_created",
      resourceType: "ci_opportunity",
      resourceId: opportunity.id,
      resourceName: opportunity.title,
      description: `Oportunidad añadida: ${opportunity.title}`,
    });
    return apiCreated({ id: opportunity.id });
  } catch (error) {
    return competenciaErrorResponse(
      error,
      "Ya existe una oportunidad con ese título"
    );
  }
});
