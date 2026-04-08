import { apiSuccess, apiError } from "@/lib/api-response";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, subscriptions, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { getStripeClient } from "@/lib/stripe/client";
import { getAppUrl, getOptionalEnvVar } from "@/lib/env";
import { NextResponse } from "next/server";

const BodySchema = z.object({
  academyId: z.string().uuid({
    message: "El ID de la academia debe ser un UUID válido",
  }),
});

// Handler for POST - separated to apply rate limiting
const portalHandler = withTenant(async (request, context) => {
  // Verificar configuración de Stripe
  const stripeSecretKey = getOptionalEnvVar("STRIPE_SECRET_KEY");
  if (!stripeSecretKey || stripeSecretKey.trim() === "") {
    return apiError("STRIPE_NOT_CONFIGURED", "El sistema de pagos no está configurado. Contacta con soporte para habilitar la gestión de pagos.", 503);
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    console.error("[billing/portal] Error initializing Stripe:", error);
    return apiError("STRIPE_INIT_ERROR", "Error al conectar con el sistema de pagos. Intenta de nuevo más tarde.", 500);
  }

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

  // Verificar que la academia tiene owner
  if (!academy.ownerId) {
    return apiError("ACADEMY_HAS_NO_OWNER", "La academia no tiene un propietario asignado", 400);
  }

  // Obtener owner
  const [owner] = await db
    .select({
      userId: profiles.userId,
    })
    .from(profiles)
    .where(eq(profiles.id, academy.ownerId))
    .limit(1);

  if (!owner) {
    return apiError("OWNER_NOT_FOUND", "No se encontró el propietario de la academia", 404);
  }

  // Obtener suscripción
  const [subscription] = await db
    .select({
      stripeCustomerId: subscriptions.stripeCustomerId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, owner.userId))
    .limit(1);

  if (!subscription?.stripeCustomerId) {
    return apiError("NO_STRIPE_CUSTOMER", "No existe un cliente de Stripe asociado a esta cuenta. Parece que no has completado el proceso de suscripción.", 400);
  }

  const returnUrl = `${getAppUrl()}/billing?academy=${body.academyId}`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    return apiSuccess({ portalUrl: session.url });
  } catch (stripeError) {
    console.error("[billing/portal] Stripe error:", stripeError);
    return apiError("STRIPE_ERROR", "Error al conectar con el portal de pagos. Intenta de nuevo más tarde.", 500);
  }
});

// Rate-limited POST handler: 10 requests per minute
export const POST = withRateLimit(
  async (request) => {
    return (await portalHandler(request, {} as any)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 10, window: 60 }
);

