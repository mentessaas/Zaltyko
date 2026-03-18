export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { globalSearch, getSearchableTypes, SearchResultType } from "@/lib/search/search-service";

const querySchema = z.object({
  academyId: z.string().uuid(),
  q: z.string().min(2),
  limit: z.string().optional(),
  type: z.enum(["athlete", "coach", "class", "group", "event", "academy"]).optional(),
  includeAllTypes: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
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
    return NextResponse.json({ error: "ACADEMY_ID_AND_QUERY_REQUIRED" }, { status: 400 });
  }

  try {
    const limit = validated.limit ? parseInt(validated.limit) : 20;
    const results = await globalSearch(validated.academyId, context.tenantId, validated.q, {
      limit,
      type: validated.type,
      includeAllTypes: validated.includeAllTypes !== "false",
    });

    return NextResponse.json({
      items: results,
      total: results.length,
      types: getSearchableTypes(),
    });
  } catch (error: any) {
    console.error("Error performing search:", error);
    return NextResponse.json(
      { error: "SEARCH_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

