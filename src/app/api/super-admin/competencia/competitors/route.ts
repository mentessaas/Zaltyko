import { apiCreated, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
  readJson,
  validationError,
} from "@/lib/competencia/api";
import {
  CompetitorCreateSchema,
  parseCompetitorFilters,
} from "@/lib/competencia/contracts";
import { createCompetitor } from "@/lib/competencia/mutations";
import { listCompetitors } from "@/lib/competencia/storage";

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */
export const GET = withSuperAdmin(async (request) => {
  const filters = parseCompetitorFilters(new URL(request.url).searchParams);
  try {
    const items = await listCompetitors(filters);
    return apiSuccess({ items }, { total: items.length });
  } catch (error) {
    return competenciaErrorResponse(error);
  }
});

export const POST = withSuperAdmin(async (request, context) => {
  const parsed = CompetitorCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const competitor = await createCompetitor(parsed.data, context.profile.id);
    await logCompetenciaAction({
      userId: context.userId,
      action: "competitor_created",
      resourceType: "ci_competitor",
      resourceId: competitor.id,
      resourceName: competitor.name,
      description: `Competidor añadido: ${competitor.name}`,
    });
    return apiCreated({ id: competitor.id, slug: competitor.slug });
  } catch (error) {
    return competenciaErrorResponse(
      error,
      "Ya existe un competidor con ese identificador"
    );
  }
});
