import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, plans, subscriptions, profiles } from "@/db/schema";
import { getActiveSubscription } from "@/lib/limits";
import { withTenant } from "@/lib/authz";

const BodySchema = z.object({
  academyId: z.string().uuid(),
});

export const POST = withTenant(async (request, context) => {
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

  let subscription: { stripeCustomerId: string | null; planCode: string | null; status: string | null } | null = null;

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

  return NextResponse.json({
    planCode: subscription?.planCode ?? effective.planCode,
    status: subscription?.status ?? "active",
    athleteLimit: effective.athleteLimit,
    classLimit: effective.classLimit,
    hasStripeCustomer: Boolean(subscription?.stripeCustomerId),
  });
});

