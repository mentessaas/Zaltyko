import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, subscriptions, plans, profiles } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { logAdminAction } from "@/lib/admin-logs";

export const dynamic = "force-dynamic";

export const GET = withSuperAdmin(async (_request, context) => {
  const academyId = context.params?.academyId;
  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      academyType: academies.academyType,
      country: academies.country,
      region: academies.region,
      ownerId: academies.ownerId,
      isSuspended: academies.isSuspended,
      suspendedAt: academies.suspendedAt,
      createdAt: academies.createdAt,
      tenantId: academies.tenantId,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
  }

  const [subscription] = academy.ownerId
    ? await (async () => {
        const [owner] = await db
          .select({
            userId: profiles.userId,
          })
          .from(profiles)
          .where(eq(profiles.id, academy.ownerId))
          .limit(1);

        if (!owner) {
          return [null];
        }

        return await db
          .select({
            id: subscriptions.id,
            status: subscriptions.status,
            planId: subscriptions.planId,
            planCode: plans.code,
            planNickname: plans.nickname,
            planPrice: plans.priceEur,
          })
          .from(subscriptions)
          .leftJoin(plans, eq(subscriptions.planId, plans.id))
          .where(eq(subscriptions.userId, owner.userId))
          .limit(1);
      })()
    : [null];

  const [owner] = academy.ownerId
    ? await db
        .select({
          id: profiles.id,
          name: profiles.name,
          userId: profiles.userId,
        })
        .from(profiles)
        .where(eq(profiles.id, academy.ownerId))
        .limit(1)
    : [null];

  return NextResponse.json({
    ...academy,
    subscription: subscription || null,
    owner: owner || null,
  });
});

export const PATCH = withSuperAdmin(async (request, context) => {
  const academyId = context.params?.academyId;
  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  let planUpdate: { planId: string } | null = null;

  if (typeof body?.name === "string" && body.name.trim().length > 0) {
    updates.name = body.name.trim();
  }

  if (typeof body?.isSuspended === "boolean") {
    updates.isSuspended = body.isSuspended;
    updates.suspendedAt = body.isSuspended ? new Date() : null;
  }

  if (typeof body?.planId === "string" && body.planId.trim().length > 0) {
    const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, body.planId)).limit(1);
    if (plan) {
      planUpdate = { planId: plan.id };
    }
  }

  if (Object.keys(updates).length === 0 && !planUpdate) {
    return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });
  }

  const [updated] = await db
    .update(academies)
    .set(updates)
    .where(eq(academies.id, academyId))
    .returning({
      id: academies.id,
      name: academies.name,
      isSuspended: academies.isSuspended,
    });

  if (!updated) {
    return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
  }

  if (planUpdate) {
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

    const [existingSubscription] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.userId, owner.userId))
      .limit(1);

    if (existingSubscription) {
      await db
        .update(subscriptions)
        .set({ planId: planUpdate.planId })
        .where(eq(subscriptions.id, existingSubscription.id));
    } else {
      await db.insert(subscriptions).values({
        userId: owner.userId,
        planId: planUpdate.planId,
        status: "active",
      });
    }
  }

  await logAdminAction({
    userId: context.userId,
    tenantId: null,
    action: body?.isSuspended ? "academy.suspended" : "academy.updated",
    meta: {
      academyId,
      updates,
    },
  });

  return NextResponse.json(updated);
});

export const DELETE = withSuperAdmin(async (_request, context) => {
  const academyId = context.params?.academyId;
  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const [removed] = await db
    .delete(academies)
    .where(eq(academies.id, academyId))
    .returning({ id: academies.id, name: academies.name });

  if (!removed) {
    return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
  }

  await logAdminAction({
    userId: context.userId,
    tenantId: null,
    action: "academy.deleted",
    meta: { academyId },
  });

  return NextResponse.json({ ok: true });
});

