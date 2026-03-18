import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, subscriptions, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { getStripeClient } from "@/lib/stripe/client";
import { getAppUrl, getOptionalEnvVar } from "@/lib/env";

const BodySchema = z.object({
  academyId: z.string().uuid({
    message: "El ID de la academia debe ser un UUID válido",
  }),
});

export const POST = withTenant(async (request, context) => {
  // Verificar configuración de Stripe
  const stripeSecretKey = getOptionalEnvVar("STRIPE_SECRET_KEY");
  if (!stripeSecretKey || stripeSecretKey.trim() === "") {
    return NextResponse.json(
      {
        error: "STRIPE_NOT_CONFIGURED",
        message: "El sistema de pagos no está configurado. Contacta con soporte para habilitar la gestión de pagos.",
      },
      { status: 503 }
    );
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    console.error("[billing/portal] Error initializing Stripe:", error);
    return NextResponse.json(
      {
        error: "STRIPE_INIT_ERROR",
        message: "Error al conectar con el sistema de pagos. Intenta de nuevo más tarde.",
      },
      { status: 500 }
    );
  }

  // Validar body
  let body;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Los datos proporcionados no son válidos",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "INVALID_JSON", message: "El cuerpo de la petición no es un JSON válido" },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: "ACADEMY_NOT_FOUND", message: "La academia especificada no existe" },
      { status: 404 }
    );
  }

  // Verificar acceso
  const isAdmin = context.profile.role === "admin" || context.profile.role === "super_admin";
  if (!isAdmin && academy.tenantId !== context.tenantId) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "No tienes acceso a los datos de facturación de esta academia" },
      { status: 403 }
    );
  }

  // Verificar que la academia tiene owner
  if (!academy.ownerId) {
    return NextResponse.json(
      { error: "ACADEMY_HAS_NO_OWNER", message: "La academia no tiene un propietario asignado" },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: "OWNER_NOT_FOUND", message: "No se encontró el propietario de la academia" },
      { status: 404 }
    );
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
    return NextResponse.json(
      {
        error: "NO_STRIPE_CUSTOMER",
        message: "No existe un cliente de Stripe asociado a esta cuenta. Parece que no has completado el proceso de suscripción.",
      },
      { status: 400 }
    );
  }

  const returnUrl = `${getAppUrl()}/billing?academy=${body.academyId}`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ portalUrl: session.url });
  } catch (stripeError) {
    console.error("[billing/portal] Stripe error:", stripeError);
    return NextResponse.json(
      {
        error: "STRIPE_ERROR",
        message: "Error al conectar con el portal de pagos. Intenta de nuevo más tarde.",
      },
      { status: 500 }
    );
  }
});

