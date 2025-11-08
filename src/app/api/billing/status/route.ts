import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, plans, subscriptions } from "@/db/schema";
import { getActiveSubscription } from "@/lib/limits";
import { withTenant } from "@/lib/authz";

const BodySchema = z.object({
  academyId: z.string().uuid(),
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  const [academy] = await db
    .select({
      tenantId: academies.tenantId,
      stripeCustomerId: subscriptions.stripeCustomerId,
      planCode: plans.code,
      status: subscriptions.status,
    })
    .from(academies)
    .leftJoin(subscriptions, eq(subscriptions.academyId, academies.id))
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(academies.id, body.academyId))
    .limit(1);

  if (!academy) {
    return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
  }

  if (context.profile.role !== "admin" && academy.tenantId !== context.tenantId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const effective = await getActiveSubscription(body.academyId);

  return NextResponse.json({
    planCode: academy.planCode ?? effective.planCode,
    status: academy.status ?? "active",
    athleteLimit: effective.athleteLimit,
    classLimit: effective.classLimit,
    hasStripeCustomer: Boolean(academy.stripeCustomerId),
  });
});

