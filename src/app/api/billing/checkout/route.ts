import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { getStripeClient } from "@/lib/stripe/client";
import { handleApiError } from "@/lib/api-error-handler";
import { getAppUrl, getOptionalEnvVar } from "@/lib/env";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getBillingAcademyAccess } from "@/lib/billing/access";
import { isSubscriptionManaged } from "@/lib/billing/subscription-status";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  // `pro` = Starter y `premium` = Growth. Network es venta acompañada.
  planCode: z.enum(["pro", "premium"]),
});

const handler = withTenant(async (request, context) => {
  try {
    // Verificar Stripe antes de hacer cualquier otra cosa
    const stripeSecretKey = getOptionalEnvVar("STRIPE_SECRET_KEY");
    // Verificar que la clave existe y no está vacía
    if (!stripeSecretKey || stripeSecretKey.trim() === "") {
      return apiError("STRIPE_NOT_CONFIGURED", "Stripe no está configurado. Contacta con soporte para habilitar los pagos.", 503);
    }

    let json;
    try {
      json = await request.json();
    } catch (_error) {
      return apiError("INVALID_JSON", "El cuerpo de la petición no es un JSON válido", 400);
    }

    let body;
    try {
      body = BodySchema.parse(json);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return apiError("VALIDATION_ERROR", "Los datos proporcionados no son válidos", 400);
      }
      throw error;
    }

    // Inicializar Stripe después de validar que la clave existe
    let stripe;
    try {
      stripe = getStripeClient();
    } catch (error) {
      return apiError("STRIPE_INIT_ERROR", "Error al inicializar Stripe. Contacta con soporte.", 500);
    }

    const academy = await getBillingAcademyAccess({
      academyId: body.academyId,
      userId: context.userId,
      profileId: context.profile.id,
      profileRole: context.profile.role,
    });
    if (!academy) {
      return apiError("BILLING_FORBIDDEN", "Solo la persona propietaria puede gestionar la suscripción", 403);
    }

    const [existingSubscription] = await db
      .select({
        stripeCustomerId: subscriptions.stripeCustomerId,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, academy.ownerUserId))
      .limit(1);

    if (isSubscriptionManaged(existingSubscription ?? { stripeSubscriptionId: null, status: null })) {
      return apiError(
        "SUBSCRIPTION_ALREADY_EXISTS",
        "Ya existe una suscripción. Usa el portal de Stripe para cambiarla o cancelarla.",
        409
      );
    }

    const [plan] = await db.select().from(plans).where(eq(plans.code, body.planCode)).limit(1);

    if (!plan?.stripePriceId) {
      return apiError("PLAN_NOT_AVAILABLE", "Plan no disponible", 400);
    }

    let customerId = existingSubscription?.stripeCustomerId ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          name: academy.ownerName ?? academy.name,
          metadata: {
            userId: academy.ownerUserId,
            academyId: academy.id,
            tenantId: academy.tenantId,
          },
        },
        { idempotencyKey: `customer_${academy.ownerUserId}` }
      );

      customerId = customer.id;

      await db
        .insert(subscriptions)
        .values({
          userId: academy.ownerUserId,
          planId: plan.id,
          stripeCustomerId: customerId,
          status: "incomplete",
        })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: { stripeCustomerId: customerId },
        });

      // Re-leer el customerId en caso de que otra request ganó la race
      const [latest] = await db
        .select({ stripeCustomerId: subscriptions.stripeCustomerId })
        .from(subscriptions)
        .where(eq(subscriptions.userId, academy.ownerUserId))
        .limit(1);
      customerId = latest?.stripeCustomerId ?? customerId;
    }

    const successUrl = `${getAppUrl()}/app/${body.academyId}/billing?checkout=success`;
    const cancelUrl = `${getAppUrl()}/app/${body.academyId}/billing?checkout=cancelled`;
    const requestedIdempotencyKey = request.headers.get("idempotency-key")?.trim();
    const requestBucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const checkoutIdempotencyKey = requestedIdempotencyKey
      ? `checkout_${academy.ownerUserId}_${requestedIdempotencyKey}`.slice(0, 255)
      : `checkout_${academy.ownerUserId}_${plan.code}_${requestBucket}`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: academy.id,
        allow_promotion_codes: false,
        payment_method_types: ["card"],
        line_items: [
          {
            price: plan.stripePriceId,
            quantity: 1,
          },
        ],
        subscription_data: {
          metadata: {
            userId: academy.ownerUserId,
            academyId: academy.id,
            tenantId: academy.tenantId,
            planCode: plan.code,
          },
        },
        metadata: {
          userId: academy.ownerUserId,
          academyId: academy.id,
          tenantId: academy.tenantId,
          planCode: plan.code,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      { idempotencyKey: checkoutIdempotencyKey }
    );

    return apiSuccess({ checkoutUrl: session.url });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/billing/checkout", method: "POST" }) as NextResponse;
  }
});

// Aplicar rate limiting: 10 requests por minuto para checkout
export const POST = withRateLimit(
  async (request) => {
    return (await handler(request, {} as { params?: Record<string, string> })) as NextResponse;
  },
  { identifier: getUserIdentifier }
);
