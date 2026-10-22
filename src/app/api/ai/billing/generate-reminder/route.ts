import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, athletes, charges } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { getScopedAthlete } from "@/lib/ai/attendance-data";
import { getAIOrchestrator } from "@/lib/ai/orchestrator";
import { BILLING_SYSTEM_PROMPT, generateReminderPrompt } from "@/lib/ai/prompts/billing";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  chargeId: z.string().uuid(),
  academyId: z.string().uuid(),
});

const REMINDER_STATUSES = ["pending", "overdue", "partial", "failed", "requires_action"] as const;

const handler = withTenant(async (request: Request, context) => {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("INVALID_PAYLOAD", "chargeId y academyId deben ser UUID válidos", 400);
    }
    const { chargeId, academyId } = parsed.data;
    const [charge] = await db
      .select({
        id: charges.id,
        athleteId: charges.athleteId,
        amountCents: charges.amountCents,
        currency: charges.currency,
        dueDate: charges.dueDate,
        academyName: academies.name,
      })
      .from(charges)
      .innerJoin(athletes, eq(charges.athleteId, athletes.id))
      .innerJoin(academies, eq(charges.academyId, academies.id))
      .where(
        and(
          eq(charges.id, chargeId),
          eq(charges.tenantId, context.tenantId),
          eq(charges.academyId, academyId),
          eq(athletes.tenantId, context.tenantId),
          eq(athletes.academyId, academyId),
          inArray(charges.status, REMINDER_STATUSES),
        ),
      )
      .limit(1);

    if (!charge) {
      return apiError("CHARGE_NOT_FOUND", "No se encontró un cobro pendiente en esta academia", 404);
    }
    if (!charge.dueDate) {
      return apiError("CHARGE_DUE_DATE_MISSING", "El cobro no tiene fecha de vencimiento", 409);
    }

    const athlete = await getScopedAthlete({
      tenantId: context.tenantId,
      academyId,
      athleteId: charge.athleteId,
      profile: context.profile,
    });
    if (athlete.status === "not_found") {
      return apiError("ATHLETE_NOT_FOUND", "No se encontró el atleta en esta academia", 404);
    }
    if (athlete.status === "forbidden") {
      return apiError("ATHLETE_ACCESS_DENIED", "No tienes permiso para consultar este atleta", 403);
    }

    const response = await getAIOrchestrator().execute(
      generateReminderPrompt({
        // La IA solo necesita el contexto del cobro, no la identidad del menor.
        name: "la familia",
        pendingAmount: Number(charge.amountCents) / 100,
        dueDate: charge.dueDate,
        academyName: charge.academyName ?? "la academia",
        currency: charge.currency,
      }),
      BILLING_SYSTEM_PROMPT,
      { temperature: 0.3, maxTokens: 500 },
    );

    return apiSuccess({
      athleteId: charge.athleteId,
      chargeId: charge.id,
      message: response.content,
      tone: "friendly",
      currency: charge.currency,
    });
  } catch (error) {
    logger.error("AI reminder error", error);
    return apiError("AI_REMINDER_FAILED", "No se pudo generar el recordatorio", 500);
  }
});

export const POST = withRateLimit(handler, {
  identifier: getUserIdentifier,
  limit: 10,
  window: 60,
});
