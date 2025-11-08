import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies, memberships, plans, profiles, subscriptions } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const BodySchema = z.object({
  name: z.string().min(3),
  country: z.string().optional(),
  region: z.string().optional(),
  tenantId: z.string().uuid().optional(),
  ownerProfileId: z.string().uuid().optional(),
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  const isAdmin = context.profile.role === "admin";

  const ownerProfile = body.ownerProfileId
    ? (
        await db
          .select()
          .from(profiles)
          .where(eq(profiles.id, body.ownerProfileId))
          .limit(1)
      )[0]
    : context.profile;

  if (!ownerProfile) {
    return NextResponse.json({ error: "OWNER_PROFILE_NOT_FOUND" }, { status: 404 });
  }

  const tenantId =
    (isAdmin && body.tenantId) || ownerProfile.tenantId || crypto.randomUUID();

  const academyId = crypto.randomUUID();

  const [freePlan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.code, "free"))
    .limit(1);

  await db.insert(academies).values({
    id: academyId,
    tenantId,
    name: body.name,
    country: body.country,
    region: body.region,
    ownerId: ownerProfile.id,
  });

  await db
    .insert(memberships)
    .values({
      userId: ownerProfile.userId,
      academyId,
      role: "owner",
    })
    .onConflictDoNothing();

  if (ownerProfile.tenantId !== tenantId) {
    await db
      .update(profiles)
      .set({ tenantId })
      .where(eq(profiles.id, ownerProfile.id));
  }

  await db
    .insert(subscriptions)
    .values({
      academyId,
      planId: freePlan?.id ?? null,
      status: "active",
    })
    .onConflictDoNothing();

  return NextResponse.json({ id: academyId, tenantId });
});
