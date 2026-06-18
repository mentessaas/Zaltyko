import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, coachCompensation, coaches } from "@/db/schema";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { requireLeakProfitabilityFeature } from "@/lib/product/leak-profitability-feature";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  academyId: z.string().uuid(),
});

const createSchema = z.object({
  academyId: z.string().uuid(),
  coachId: z.string().uuid(),
  hourlyRateCents: z.number().int().min(0).default(0),
  monthlySalaryCents: z.number().int().min(0).default(0),
  estimatedWeeklyHours: z.number().int().min(0).max(168).default(0),
  notes: z.string().max(1000).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isActive: z.boolean().default(true),
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
    .from(coachCompensation)
    .where(and(eq(coachCompensation.tenantId, context.tenantId), eq(coachCompensation.academyId, parsed.data.academyId)))
    .orderBy(desc(coachCompensation.createdAt));

  return apiSuccess({ items: rows, total: rows.length });
});

export const POST = withTenant(async (request, context) => {
  const disabled = requireLeakProfitabilityFeature();
  if (disabled) return disabled;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid compensation payload", 400, parsed.error.flatten());
  }

  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.id, parsed.data.academyId), eq(academies.tenantId, context.tenantId)))
    .limit(1);
  if (!academy) {
    return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  const [coach] = await db
    .select({ id: coaches.id })
    .from(coaches)
    .where(and(eq(coaches.id, parsed.data.coachId), eq(coaches.tenantId, context.tenantId)))
    .limit(1);
  if (!coach) {
    return apiError("COACH_NOT_FOUND", "Coach not found", 404);
  }

  const [row] = await db
    .insert(coachCompensation)
    .values({ ...parsed.data, tenantId: context.tenantId })
    .returning();

  return apiCreated(row);
});

