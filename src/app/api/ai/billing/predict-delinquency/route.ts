import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, charges } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { getScopedAthlete } from "@/lib/ai/attendance-data";
import { getAIOrchestrator } from "@/lib/ai/orchestrator";
import { BILLING_SYSTEM_PROMPT, generateDelinquencyPrompt } from "@/lib/ai/prompts/billing";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  athleteId: z.string().uuid(),
  academyId: z.string().uuid(),
});

const DELINQUENT_STATUSES = ["pending", "overdue", "partial", "failed", "requires_action"] as const;

const handler = withTenant(async (request: Request, context) => {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("INVALID_PAYLOAD", "athleteId y academyId deben ser UUID válidos", 400);
    }
    const { athleteId, academyId } = parsed.data;
    const athlete = await getScopedAthlete({
      tenantId: context.tenantId,
      academyId,
      athleteId,
      profile: context.profile,
    });
    if (athlete.status === "not_found") {
      return apiError("ATHLETE_NOT_FOUND", "No se encontró el atleta en esta academia", 404);
    }
    if (athlete.status === "forbidden") {
      return apiError("ATHLETE_ACCESS_DENIED", "No tienes permiso para consultar este atleta", 403);
    }

    const paymentRows = await db
      .select({
        amountCents: charges.amountCents,
        currency: charges.currency,
        status: charges.status,
        period: charges.period,
        dueDate: charges.dueDate,
        paidAt: charges.paidAt,
      })
      .from(charges)
      .innerJoin(athletes, eq(charges.athleteId, athletes.id))
      .where(
        and(
          eq(charges.tenantId, context.tenantId),
          eq(charges.academyId, academyId),
          eq(charges.athleteId, athleteId),
          isNull(athletes.deletedAt),
        ),
      )
      .orderBy(desc(charges.period))
      .limit(100);

    const paymentHistory = paymentRows.map((row) => ({
      date: row.dueDate ?? row.period,
      amount: Number(row.amountCents ?? 0) / 100,
      status: row.status,
    }));
    const pendingAmount = paymentRows
      .filter((row) => (DELINQUENT_STATUSES as readonly string[]).includes(row.status))
      .reduce((sum, row) => sum + Number(row.amountCents ?? 0), 0) / 100;
    const paidRows = paymentRows.filter((row) => row.status === "paid");
    const lastPaymentDate = paidRows.find((row) => row.paidAt)?.paidAt?.toISOString();
    const currencies = new Set(paymentRows.map((row) => row.currency.toUpperCase()));
    const currency = currencies.size === 1 ? Array.from(currencies)[0] : "moneda local";

    if (paymentHistory.length < 2) {
      return apiSuccess({
        athleteId,
        probability: 0.5,
        analysis: "Aún no hay suficientes cargos para calcular un riesgo fiable.",
        dataPoints: paymentHistory.length,
        insufficientData: true,
      });
    }

    const orchestrator = getAIOrchestrator();
    const prompt = generateDelinquencyPrompt({
      name: "la familia",
      paymentHistory,
      lastPaymentDate,
      pendingAmount,
      currency,
    });

    const response = await orchestrator.execute(prompt, BILLING_SYSTEM_PROMPT, {
      temperature: 0.2,
      maxTokens: 500,
    });

    // Parse simple response
    const probabilityMatch = response.content.match(/(\d+)%/);
    const probability = probabilityMatch
      ? Math.min(1, Math.max(0, parseInt(probabilityMatch[1], 10) / 100))
      : 0.5;

    return apiSuccess({
      athleteId,
      probability,
      analysis: response.content,
      pendingAmount,
      dataPoints: paymentHistory.length,
      insufficientData: false,
    });
  } catch (error) {
    logger.error("AI billing error", error);
    return apiError("AI_DELINQUENCY_FAILED", "No se pudo analizar el riesgo de impago", 500);
  }
});

export const POST = withRateLimit(handler, {
  identifier: getUserIdentifier,
  limit: 10,
  window: 60,
});
