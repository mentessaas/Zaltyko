import { z } from "zod";

import { db } from "@/db";
import { academies, plans, subscriptions, profiles } from "@/db/schema";
import { getActiveSubscription } from "@/lib/limits";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";

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

  // Obtener academia
  const [academy] = await db
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(eq(academies.id, body.academyId))
    .limit(1);

  if (!academy) {
    return apiError("ACADEMY_NOT_FOUND", "La academia especificada no existe", 404);
  }

  // Verificar acceso
  const isAdmin = context.profile.role === "admin" || context.profile.role === "super_admin";
  if (!isAdmin && academy.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "No tienes acceso a los datos de facturación de esta academia", 403);
  }

  let subscription: { stripeCustomerId: string | null; planCode: string | null; status: string | null } | null = null;

  try {
    if (academy.ownerId) {
      const [owner] = await db
        .select({
          userId: profiles.userId,
        })
        .from(profiles)
        .where(eq(profiles.id, academy.ownerId))
        .limit(1);

      if (owner) {
        const [sub] = await db
          .select({
            stripeCustomerId: subscriptions.stripeCustomerId,
            planCode: plans.code,
            status: subscriptions.status,
          })
          .from(subscriptions)
          .leftJoin(plans, eq(subscriptions.planId, plans.id))
          .where(eq(subscriptions.userId, owner.userId))
          .limit(1);
        subscription = sub ?? null;
      }
    }

    const effective = await getActiveSubscription(body.academyId);

    return apiSuccess({
      planCode: subscription?.planCode ?? effective.planCode,
      status: subscription?.status ?? "active",
      athleteLimit: effective.athleteLimit,
      classLimit: effective.classLimit,
      hasStripeCustomer: Boolean(subscription?.stripeCustomerId),
    });
  } catch (error) {
    console.error("[billing/status] Error fetching subscription status:", error);
    return apiError("INTERNAL_ERROR", "Error al obtener el estado de facturación. Intenta de nuevo más tarde.", 500);
  }
});

