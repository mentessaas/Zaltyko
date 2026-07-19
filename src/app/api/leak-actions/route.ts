import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, leakActionHistory } from "@/db/schema";
import { apiCreated, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { requireLeakProfitabilityFeature } from "@/lib/product/leak-profitability-feature";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  academyId: z.string().uuid(),
  actionType: z.enum(["payment_reminder", "absence_message", "progress_message", "churn_message", "waitlist_message"]),
  athleteId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  channel: z.enum(["whatsapp", "email", "push", "in_app"]).default("whatsapp"),
  message: z.string().max(2000).optional(),
  payload: z.record(z.unknown()).default({}),
});

export const POST = withTenant(async (request, context) => {
  const disabled = requireLeakProfitabilityFeature();
  if (disabled) return disabled;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid leak action payload", 400, parsed.error.flatten());
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
    .insert(leakActionHistory)
    .values({
      tenantId: context.tenantId,
      academyId: parsed.data.academyId,
      actionType: parsed.data.actionType,
      athleteId: parsed.data.athleteId ?? null,
      classId: parsed.data.classId ?? null,
      channel: parsed.data.channel,
      message: parsed.data.message,
      payload: parsed.data.payload,
      createdByProfileId: context.profile.id,
    })
    .returning();

  return apiCreated(row);
});

