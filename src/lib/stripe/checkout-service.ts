import Stripe from "stripe";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, plans, subscriptions, profiles, authUsers } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe/client";
import { getAppUrl } from "@/lib/env";
import { verifyAcademyAccess } from "@/lib/permissions";
import { logger } from "@/lib/logger";

export interface CreateCheckoutSessionParams {
  academyId: string;
  planCode: "free" | "pro" | "premium";
  userId: string;
  tenantId: string;
}

export interface CheckoutSessionResult {
  checkoutUrl: string | null;
}

/**
 * Obtiene o crea un cliente de Stripe para un usuario
 */
export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const stripe = getStripeClient();

  // Buscar suscripción existente
  const [existingSubscription] = await db
    .select({
      stripeCustomerId: subscriptions.stripeCustomerId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (existingSubscription?.stripeCustomerId) {
    return existingSubscription.stripeCustomerId;
  }

  // Obtener perfil del usuario para el email
  const [profile] = await db
    .select({
      email: authUsers.email,
      name: profiles.name,
    })
    .from(profiles)
    .innerJoin(authUsers, eq(authUsers.id, profiles.userId))
    .where(eq(profiles.userId, userId))
    .limit(1);

  // Crear cliente en Stripe (idempotente: misma key = mismo cliente)
  const customer = await stripe.customers.create(
    {
      email: profile?.email ?? undefined,
      name: profile?.name ?? undefined,
      metadata: { userId },
    },
    { idempotencyKey: `customer_${userId}` }
  );

  // Obtener plan free para el caso de nueva suscripción
  const [freePlan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.code, "free"))
    .limit(1);

  // Upsert atómico: evita race conditions con el unique index en userId
  await db
    .insert(subscriptions)
    .values({
      userId,
      planId: freePlan?.id,
      stripeCustomerId: customer.id,
      status: "incomplete",
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: { stripeCustomerId: customer.id },
    });

  // Re-leer por si otra request ganó la race y ya tenía un customerId
  const [latest] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  return latest?.stripeCustomerId ?? customer.id;
}

/**
 * Crea una sesión de checkout de Stripe
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<CheckoutSessionResult> {
  const stripe = getStripeClient();

  // Validar que la academia existe y pertenece al tenant
  const [academy] = await db
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(eq(academies.id, params.academyId))
    .limit(1);

  if (!academy) {
    throw new Error("ACADEMY_NOT_FOUND");
  }

  if (academy.tenantId !== params.tenantId) {
    throw new Error("ACADEMY_TENANT_MISMATCH");
  }

  // Verificar acceso a la academia
  await verifyAcademyAccess(params.academyId, params.tenantId);

  // Obtener plan
  const [plan] = await db
    .select({
      id: plans.id,
      code: plans.code,
      stripePriceId: plans.stripePriceId,
    })
    .from(plans)
    .where(eq(plans.code, params.planCode))
    .limit(1);

  if (!plan) {
    throw new Error("PLAN_NOT_FOUND");
  }

  if (!plan.stripePriceId) {
    throw new Error("PLAN_PRICE_NOT_CONFIGURED");
  }

  // Obtener owner de la academia
  if (!academy.ownerId) {
    throw new Error("ACADEMY_HAS_NO_OWNER");
  }

  const [owner] = await db
    .select({
      userId: profiles.userId,
    })
    .from(profiles)
    .where(eq(profiles.id, academy.ownerId))
    .limit(1);

  if (!owner) {
    throw new Error("OWNER_NOT_FOUND");
  }

  // Obtener o crear cliente de Stripe
  const customerId = await getOrCreateStripeCustomer(owner.userId);

  // Crear sesión de checkout
  const successUrl = `${getAppUrl()}/billing/success?academy=${params.academyId}`;
  const cancelUrl = `${getAppUrl()}/billing`;

  const session = await stripe.checkout.sessions.create(
    {
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
          tenantId: params.tenantId,
          planCode: plan.code,
        },
      },
      metadata: {
        userId: owner.userId,
        tenantId: params.tenantId,
        planCode: plan.code,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
    { idempotencyKey: `checkout_${owner.userId}_${plan.code}_${Date.now()}` }
  );

  return {
    checkoutUrl: session.url,
  };
}

