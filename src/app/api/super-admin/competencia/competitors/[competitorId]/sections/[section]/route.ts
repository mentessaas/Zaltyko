import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
  readJson,
  validationError,
} from "@/lib/competencia/api";
import {
  SectionKeySchema,
  SectionUpdateSchema,
} from "@/lib/competencia/contracts";
import { upsertSection } from "@/lib/competencia/mutations";

const ParamsSchema = z.object({
  competitorId: z.guid(),
  section: SectionKeySchema,
});

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */
export const PUT = withSuperAdmin(async (request, context) => {
  const params = ParamsSchema.safeParse(context.params);
  if (!params.success)
    return apiError("VALIDATION_ERROR", "Competidor o sección inválidos", 400);
  const parsed = SectionUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const section = await upsertSection(
      params.data.competitorId,
      params.data.section,
      parsed.data,
      context.profile.id
    );
    await logCompetenciaAction({
      userId: context.userId,
      action: "section_saved",
      resourceType: "ci_competitor_section",
      resourceId: section.id,
      resourceName: params.data.section,
      description: `Sección ${params.data.section} guardada (${parsed.data.dataStatus})`,
    });
    return apiSuccess({ id: section.id });
  } catch (error) {
    return competenciaErrorResponse(error);
  }
});
