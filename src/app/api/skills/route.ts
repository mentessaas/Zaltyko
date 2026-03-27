export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { skillCatalog } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";

const querySchema = z.object({
  apparatus: z.string().optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(200)).optional(),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
});

export const GET = withTenant(async (request: Request, context: Record<string, unknown>) => {
  try {
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const params = querySchema.safeParse(search);

    if (!params.success) {
      return handleApiError(params.error);
    }

    const tenantId = context.tenantId as string;
    if (!tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const whereConditions = [eq(skillCatalog.tenantId, tenantId)];

    if (params.data.apparatus) {
      whereConditions.push(eq(skillCatalog.apparatus, params.data.apparatus));
    }

    const limit = params.data.limit ?? 50;
    const offset = params.data.offset ?? 0;

    const rows = await db
      .select({
        id: skillCatalog.id,
        skillCode: skillCatalog.skillCode,
        name: skillCatalog.name,
        description: skillCatalog.description,
        apparatus: skillCatalog.apparatus,
        difficulty: skillCatalog.difficulty,
      })
      .from(skillCatalog)
      .where(and(...whereConditions))
      .orderBy(skillCatalog.name)
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      items: rows,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(error);
  }
});
