import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, academyDiagnostics } from "@/db/schema";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { requireLeakProfitabilityFeature } from "@/lib/product/leak-profitability-feature";
import { calculateDiagnosticResult } from "@/lib/reports/leak-profitability";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  academyId: z.string().uuid(),
});

const createSchema = z.object({
  academyId: z.string().uuid(),
  answers: z.record(z.union([z.boolean(), z.number(), z.string()])),
});

export const GET = withTenant(async (request, context) => {
  const disabled = requireLeakProfitabilityFeature();
  if (disabled) return disabled;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid query parameters", 400, parsed.error.flatten());
  }

  const rows = await db
    .select()
    .from(academyDiagnostics)
    .where(and(eq(academyDiagnostics.tenantId, context.tenantId), eq(academyDiagnostics.academyId, parsed.data.academyId)))
    .orderBy(desc(academyDiagnostics.createdAt))
    .limit(5);

  return apiSuccess({ items: rows, total: rows.length });
});

export const POST = withTenant(async (request, context) => {
  const disabled = requireLeakProfitabilityFeature();
  if (disabled) return disabled;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid diagnostic payload", 400, parsed.error.flatten());
  }

  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.id, parsed.data.academyId), eq(academies.tenantId, context.tenantId)))
    .limit(1);
  if (!academy) {
    return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  const result = calculateDiagnosticResult(parsed.data.answers);
  const [row] = await db
    .insert(academyDiagnostics)
    .values({
      tenantId: context.tenantId,
      academyId: parsed.data.academyId,
      answers: parsed.data.answers,
      score: result.score,
      level: result.level,
      recommendedTasks: result.recommendedTasks,
      createdByProfileId: context.profile.id,
    })
    .returning();

  return apiCreated(row);
});

