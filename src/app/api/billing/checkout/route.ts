import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, plans, subscriptions, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { getStripeClient } from "@/lib/stripe/client";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  planCode: z.enum(["free", "pro", "premium"]),
});

const handler = withTenant(async (request, context) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 500 });
  }

  const stripe = getStripeClient();

  const json = await request.json();
  const body = BodySchema.parse(json);

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

  if (!context.profile || (!isAdmin && academy.tenantId !== context.tenantId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
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

  const successUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/billing/success?academy=${body.academyId}`;
  const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/billing`;

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
});

// Aplicar rate limiting: 10 requests por minuto para checkout
// El rate limiting se aplica antes de withTenant
export const POST = withRateLimit(
  async (request) => {
    return (await handler(request, {} as any)) as NextResponse;
  },
  { identifier: getUserIdentifier }
);
