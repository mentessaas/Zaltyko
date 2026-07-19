import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, academyExpenses } from "@/db/schema";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { requireLeakProfitabilityFeature } from "@/lib/product/leak-profitability-feature";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  academyId: z.string().uuid(),
});

const createSchema = z.object({
  academyId: z.string().uuid(),
  label: z.string().min(1).max(200),
  category: z.string().min(1).max(80).default("other"),
  amountCents: z.number().int().min(0),
  currency: z.string().length(3).default("EUR"),
  recurrence: z.enum(["monthly", "one_time"]).default("monthly"),
  appliesToType: z.enum(["academy", "class", "coach", "sport_config"]).default("academy"),
  appliesToId: z.string().uuid().optional(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).optional(),
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
    .from(academyExpenses)
    .where(and(eq(academyExpenses.tenantId, context.tenantId), eq(academyExpenses.academyId, parsed.data.academyId)))
    .orderBy(desc(academyExpenses.createdAt));

  return apiSuccess({ items: rows, total: rows.length });
});

export const POST = withTenant(async (request, context) => {
  const disabled = requireLeakProfitabilityFeature();
  if (disabled) return disabled;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid expense payload", 400, parsed.error.flatten());
  }

  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.id, parsed.data.academyId), eq(academies.tenantId, context.tenantId)))
    .limit(1);
  if (!academy) {
    return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  const [row] = await db
    .insert(academyExpenses)
    .values({ ...parsed.data, appliesToId: parsed.data.appliesToId ?? null, tenantId: context.tenantId })
    .returning();

  return apiCreated(row);
});
