import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";
import { getActiveSubscription } from "@/lib/limits";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { getBillingAcademyAccess } from "@/lib/billing/access";
import { getAcademyTrialStatus } from "@/lib/billing/trial-service";
import { isSubscriptionManaged } from "@/lib/billing/subscription-status";

const BodySchema = z.object({
  academyId: z.string().uuid({
    message: "El ID de la academia debe ser un UUID válido",
  }),
});

export const POST = withTenant(async (request, context) => {
  // Validar body
  let body;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Los datos proporcionados no son válidos", 400);
    }
    return apiError("INVALID_JSON", "El cuerpo de la petición no es un JSON válido", 400);
  }

  const academy = await getBillingAcademyAccess({
    academyId: body.academyId,
    userId: context.userId,
    profileId: context.profile.id,
    profileRole: context.profile.role,
  });
  if (!academy) {
    return apiError("BILLING_FORBIDDEN", "Solo la persona propietaria puede consultar la suscripción", 403);
  }

  let subscription: {
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    planCode: string | null;
    status: string | null;
  } | null = null;

  try {
    const [sub] = await db
      .select({
        stripeCustomerId: subscriptions.stripeCustomerId,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
        planCode: plans.code,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .leftJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.userId, academy.ownerUserId))
      .limit(1);
    subscription = sub ?? null;

    const [effective, trial] = await Promise.all([
      getActiveSubscription(body.academyId),
      getAcademyTrialStatus(body.academyId),
    ]);

    return apiSuccess({
      planCode: effective.planCode,
      status: trial.active ? "trialing" : subscription?.status ?? "active",
      athleteLimit: effective.athleteLimit,
      classLimit: effective.classLimit,
      hasStripeCustomer: Boolean(subscription?.stripeCustomerId),
      hasManagedSubscription: isSubscriptionManaged(
        subscription ?? { stripeSubscriptionId: null, status: null }
      ),
      trial,
    });
  } catch (error) {
    logger.error("[billing/status] Error fetching subscription status:", error);
    return apiError("INTERNAL_ERROR", "Error al obtener el estado de cobros. Intenta de nuevo más tarde.", 500);
  }
});
