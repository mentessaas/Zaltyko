import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { globalSearch, getSearchableTypes, SearchResultType } from "@/lib/search/search-service";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  academyId: z.string().uuid(),
  q: z.string().min(2),
  limit: z.string().optional(),
  type: z.enum(["athlete", "coach", "class", "group", "event", "academy"]).optional(),
  includeAllTypes: z.string().optional(),
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

  const validated = querySchema.parse({
    ...params,
    academyId: params.academyId || undefined,
    q: params.q || undefined,
  });

  if (!validated.academyId || !validated.q) {
    return apiError("ACADEMY_ID_AND_QUERY_REQUIRED", "academyId y query son requeridos", 400);
  }

  try {
    const limit = validated.limit ? parseInt(validated.limit) : 20;
    const results = await globalSearch(validated.academyId, context.tenantId, validated.q, {
      limit,
      type: validated.type,
      includeAllTypes: validated.includeAllTypes !== "false",
    });

    return apiSuccess({
      items: results,
      total: results.length,
      types: getSearchableTypes(),
    });
  } catch (error: any) {
    logger.error("Error performing search:", error);
    return apiError("SEARCH_FAILED", error.message, 500);
  }
});
