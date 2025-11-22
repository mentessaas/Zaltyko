import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, subscriptions, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { getStripeClient } from "@/lib/stripe/client";
import { getAppUrl, getOptionalEnvVar } from "@/lib/env";

const BodySchema = z.object({
  academyId: z.string().uuid(),
});

export const POST = withTenant(async (request, context) => {
  if (!getOptionalEnvVar("STRIPE_SECRET_KEY")) {
    return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 500 });
  }

  const stripe = getStripeClient();

  const body = BodySchema.parse(await request.json());

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
    return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
  }

  const isAdmin = context.profile.role === "admin" || context.profile.role === "super_admin";

  if (!isAdmin && academy.tenantId !== context.tenantId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (!academy.ownerId) {
    return NextResponse.json({ error: "ACADEMY_HAS_NO_OWNER" }, { status: 400 });
  }

  const [owner] = await db
    .select({
      userId: profiles.userId,
    })
    .from(profiles)
    .where(eq(profiles.id, academy.ownerId))
    .limit(1);

  if (!owner) {
    return NextResponse.json({ error: "OWNER_NOT_FOUND" }, { status: 404 });
  }

  const [subscription] = await db
    .select({
      stripeCustomerId: subscriptions.stripeCustomerId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, owner.userId))
    .limit(1);

  if (!subscription?.stripeCustomerId) {
    return NextResponse.json({ error: "NO_STRIPE_CUSTOMER" }, { status: 400 });
  }

  const returnUrl = `${getAppUrl()}/billing?academy=${body.academyId}`;

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl,
  });

  return NextResponse.json({ portalUrl: session.url });
});

