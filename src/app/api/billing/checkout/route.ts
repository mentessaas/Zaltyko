import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, plans, subscriptions, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { getStripeClient } from "@/lib/stripe/client";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess } from "@/lib/permissions";
import { getAppUrl, getOptionalEnvVar } from "@/lib/env";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  planCode: z.enum(["free", "pro", "premium"]),
});

const handler = withTenant(async (request, context) => {
  try {
    // Verificar Stripe antes de hacer cualquier otra cosa
    const stripeSecretKey = getOptionalEnvVar("STRIPE_SECRET_KEY");
    // Verificar que la clave existe y no está vacía
    if (!stripeSecretKey || stripeSecretKey.trim() === "") {
      return NextResponse.json({
        error: "STRIPE_NOT_CONFIGURED",
        message: "Stripe no está configurado. Contacta con soporte para habilitar los pagos."
      }, { status: 503 }); // 503 Service Unavailable es más apropiado que 500
    }

    let json;
    try {
      json = await request.json();
    } catch (error) {
      return NextResponse.json({ error: "INVALID_JSON", message: "El cuerpo de la petición no es un JSON válido" }, { status: 400 });
    }

    let body;
    try {
      body = BodySchema.parse(json);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({
          error: "VALIDATION_ERROR",
          message: "Los datos proporcionados no son válidos",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        }, { status: 400 });
      }
      throw error;
    }

    // Inicializar Stripe después de validar que la clave existe
    let stripe;
    try {
      stripe = getStripeClient();
    } catch (error) {
      return NextResponse.json({
        error: "STRIPE_INIT_ERROR",
        message: error instanceof Error ? error.message : "Error al inicializar Stripe. Contacta con soporte."
      }, { status: 500 });
    }

    // Obtener tenantId desde la academia si no está disponible en el contexto
    let effectiveTenantId = context.tenantId;
    if (!effectiveTenantId && body.academyId) {
      const [academyForTenant] = await db
        .select({ tenantId: academies.tenantId })
        .from(academies)
        .where(eq(academies.id, body.academyId))
        .limit(1);

      if (academyForTenant?.tenantId) {
        effectiveTenantId = academyForTenant.tenantId;
      }
    }

    if (!effectiveTenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED", message: "No se pudo determinar el tenant. Asegúrate de tener acceso a la academia." }, { status: 400 });
    }

    // Verificar acceso a la academia
    const academyAccess = await verifyAcademyAccess(body.academyId, effectiveTenantId);
    if (!academyAccess.allowed) {
      return NextResponse.json({ error: academyAccess.reason ?? "ACADEMY_NOT_FOUND", message: "No tienes acceso a esta academia" }, { status: 404 });
    }

    const [academy] = await db
      .select({
        id: academies.id,
        tenantId: academies.tenantId,
        name: academies.name,
        ownerId: academies.ownerId,
      })
      .from(academies)
      .where(eq(academies.id, body.academyId))
      .limit(1);

    if (!academy) {
      return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
    }

    const isAdmin = context.profile?.role === "admin" || context.profile?.role === "super_admin";

    if (!context.profile || (!isAdmin && academy.tenantId !== effectiveTenantId)) {
      return NextResponse.json({ error: "FORBIDDEN", message: "No tienes permisos para realizar esta acción" }, { status: 403 });
    }

    if (!academy.ownerId) {
      return NextResponse.json({ error: "ACADEMY_HAS_NO_OWNER" }, { status: 400 });
    }

    const [owner] = await db
      .select({
        userId: profiles.userId,
        name: profiles.name,
      })
      .from(profiles)
      .where(eq(profiles.id, academy.ownerId))
      .limit(1);

    if (!owner) {
      return NextResponse.json({ error: "OWNER_NOT_FOUND" }, { status: 404 });
    }

    const [existingSubscription] = await db
      .select({
        stripeCustomerId: subscriptions.stripeCustomerId,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, owner.userId))
      .limit(1);

    const [plan] = await db.select().from(plans).where(eq(plans.code, body.planCode)).limit(1);

    if (!plan?.stripePriceId) {
      return NextResponse.json({ error: "PLAN_NOT_AVAILABLE" }, { status: 400 });
    }

    let customerId = existingSubscription?.stripeCustomerId ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: owner.name ?? academy.name,
        metadata: {
          userId: owner.userId,
          tenantId: academy.tenantId,
        },
      });

      customerId = customer.id;

      const [existingSub] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.userId, owner.userId))
        .limit(1);

      if (existingSub) {
        await db
          .update(subscriptions)
          .set({ stripeCustomerId: customerId })
          .where(eq(subscriptions.userId, owner.userId));
      } else {
        await db.insert(subscriptions).values({
          userId: owner.userId,
          planId: plan.id,
          stripeCustomerId: customerId,
          status: "incomplete",
        });
      }
    }

    const successUrl = `${getAppUrl()}/billing/success?academy=${body.academyId}`;
    const cancelUrl = `${getAppUrl()}/billing`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
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
          userId: owner.userId,
          tenantId: academy.tenantId,
          planCode: plan.code,
        },
      },
      metadata: {
        userId: owner.userId,
        tenantId: academy.tenantId,
        planCode: plan.code,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/billing/checkout", method: "POST" });
  }
});

// Aplicar rate limiting: 10 requests por minuto para checkout
export const POST = withRateLimit(
  async (request) => {
    return (await handler(request, {} as { params?: Record<string, string> })) as NextResponse;
  },
  { identifier: getUserIdentifier }
);
