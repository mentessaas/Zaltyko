import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, subscriptions } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

const BodySchema = z.object({
  academyId: z.string().uuid(),
});

export const POST = withTenant(async (request, context) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 500 });
  }

  const body = BodySchema.parse(await request.json());

  const [academy] = await db
    .select({
      tenantId: academies.tenantId,
      stripeCustomerId: subscriptions.stripeCustomerId,
    })
    .from(academies)
    .leftJoin(subscriptions, eq(subscriptions.academyId, academies.id))
    .where(eq(academies.id, body.academyId))
    .limit(1);

  if (!academy) {
    return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
  }

  if (!academy.stripeCustomerId) {
    return NextResponse.json({ error: "NO_STRIPE_CUSTOMER" }, { status: 400 });
  }

  if (context.profile.role !== "admin" && academy.tenantId !== context.tenantId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/billing?academy=${body.academyId}`;

  const session = await stripe.billingPortal.sessions.create({
    customer: academy.stripeCustomerId,
    return_url: returnUrl,
  });

  return NextResponse.json({ portalUrl: session.url });
});

