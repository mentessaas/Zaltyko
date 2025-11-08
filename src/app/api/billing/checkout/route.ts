import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, plans, subscriptions } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

const BodySchema = z.object({
  academyId: z.string().uuid(),
  planCode: z.enum(["free", "pro", "premium"]),
});

export const POST = withTenant(async (request, context) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 500 });
  }

  const json = await request.json();
  const body = BodySchema.parse(json);

  const [academy] = await db
    .select({
      tenantId: academies.tenantId,
      name: academies.name,
      stripeCustomerId: subscriptions.stripeCustomerId,
    })
    .from(academies)
    .leftJoin(subscriptions, eq(subscriptions.academyId, academies.id))
    .where(eq(academies.id, body.academyId))
    .limit(1);

  if (!academy) {
    return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
  }

  if (!context.profile || (context.profile.role !== "admin" && academy.tenantId !== context.tenantId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const [plan] = await db.select().from(plans).where(eq(plans.code, body.planCode)).limit(1);

  if (!plan?.stripePriceId) {
    return NextResponse.json({ error: "PLAN_NOT_AVAILABLE" }, { status: 400 });
  }

  let customerId = academy.stripeCustomerId ?? undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: academy.name,
      metadata: {
        academyId: body.academyId,
        tenantId: academy.tenantId,
      },
    });

    customerId = customer.id;
    await db
      .update(subscriptions)
      .set({ stripeCustomerId: customerId })
      .where(eq(subscriptions.academyId, body.academyId));
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
        academyId: body.academyId,
        tenantId: academy.tenantId,
        planCode: plan.code,
      },
    },
    metadata: {
      academyId: body.academyId,
      tenantId: academy.tenantId,
      planCode: plan.code,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return NextResponse.json({ checkoutUrl: session.url });
});
