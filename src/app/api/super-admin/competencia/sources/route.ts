import { z } from "zod";

import { apiCreated, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
  readJson,
  validationError,
} from "@/lib/competencia/api";
import { SourceCreateSchema } from "@/lib/competencia/contracts";
import { EVIDENCE_LEVELS, SOURCE_TYPES } from "@/lib/competencia/domain";
import { createSource } from "@/lib/competencia/mutations";
import { listSources } from "@/lib/competencia/storage";

const FiltersSchema = z.object({
  competitorId: z.guid().nullable().optional().catch(null),
  evidence: z.enum(EVIDENCE_LEVELS).nullable().optional().catch(null),
  type: z.enum(SOURCE_TYPES).nullable().optional().catch(null),
  q: z.string().trim().max(120).nullable().optional(),
});

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */
export const GET = withSuperAdmin(async (request) => {
  const search = new URL(request.url).searchParams;
  const filters = FiltersSchema.parse({
    competitorId: search.get("competitorId"),
    evidence: search.get("evidence"),
    type: search.get("type"),
    q: search.get("q"),
  });
  try {
    const items = await listSources(filters);
    return apiSuccess({ items }, { total: items.length });
  } catch (error) {
    return competenciaErrorResponse(error);
  }
});

export const POST = withSuperAdmin(async (request, context) => {
  const parsed = SourceCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const source = await createSource(parsed.data, context.profile.id);
    await logCompetenciaAction({
      userId: context.userId,
      action: "source_created",
      resourceType: "ci_source",
      resourceId: source.id,
      resourceName: source.title ?? source.url,
      description: `Fuente añadida (${source.evidenceLevel})`,
    });
    return apiCreated({ id: source.id });
  } catch (error) {
    return competenciaErrorResponse(error);
  }
});
