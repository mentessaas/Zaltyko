import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { globalSearch, getSearchableTypes, SearchResultType } from "@/lib/search/search-service";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  academyId: z.string().uuid(),
  q: z.string().min(2),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(["athlete", "coach", "class", "group", "event", "academy"]).optional(),
  includeAllTypes: z.enum(["true", "false"]).optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    q: url.searchParams.get("q"),
    limit: url.searchParams.get("limit"),
    type: url.searchParams.get("type") as SearchResultType | null,
    includeAllTypes: url.searchParams.get("includeAllTypes"),
  };

  const parsed = querySchema.safeParse({
    ...params,
    academyId: params.academyId || undefined,
    q: params.q || undefined,
    type: params.type || undefined,
    includeAllTypes: params.includeAllTypes || undefined,
  });
  if (!parsed.success) {
    return apiError("INVALID_QUERY", "Parámetros de búsqueda inválidos", 400);
  }
  const validated = parsed.data;

  if (!validated.academyId || !validated.q) {
    return apiError("ACADEMY_ID_AND_QUERY_REQUIRED", "academyId y query son requeridos", 400);
  }

  try {
    const results = await globalSearch(validated.academyId, context.tenantId, validated.q, {
      limit: validated.limit,
      type: validated.type,
      includeAllTypes: validated.includeAllTypes !== "false",
    });

    return apiSuccess({
      items: results,
      total: results.length,
      types: getSearchableTypes(),
    });
  } catch (error: unknown) {
    logger.error("Error performing search:", error);
    return apiError("SEARCH_FAILED", "Error al realizar la búsqueda", 500);
  }
});
