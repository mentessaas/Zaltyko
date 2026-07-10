import { apiSuccess, apiError } from "@/lib/api-response";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, subscriptions, plans, profiles } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { logAdminAction } from "@/lib/admin-logs";
import { getSuperAdminAcademyDetail } from "@/lib/super-admin";

export const dynamic = "force-dynamic";

const reasonSchema = z.string().trim().min(5).max(500);

export const GET = withSuperAdmin(async (_request, context) => {
  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;
  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const academy = await getSuperAdminAcademyDetail(academyId);

  if (!academy) {
    return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  return apiSuccess(academy);
});

export const PATCH = withSuperAdmin(async (request, context) => {
  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;
  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body?.isSuspended === "boolean" && !reasonSchema.safeParse(body?.reason).success) {
    return apiError("REASON_REQUIRED", "Indica el motivo del cambio de acceso", 400);
  }
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

  // Edición completa: tipo, país, región y ciudad.
  if (typeof body?.academyType === "string" && body.academyType.trim().length > 0) {
    updates.academyType = body.academyType.trim();
  }
  if (typeof body?.country === "string") {
    updates.country = body.country.trim() || null;
  }
  if (typeof body?.region === "string") {
    updates.region = body.region.trim() || null;
  }
  if (typeof body?.city === "string") {
    updates.city = body.city.trim() || null;
  }

  if (Object.keys(updates).length === 0 && !planUpdate) {
    return apiError("NO_CHANGES", "No changes provided", 400);
  }

  const [updated] = await db
    .update(academies)
    .set(updates)
    .where(eq(academies.id, academyId))
    .returning({
      id: academies.id,
      name: academies.name,
      isSuspended: academies.isSuspended,
      ownerId: academies.ownerId,
    });

  if (!updated) {
    return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  if (planUpdate) {
    if (!updated.ownerId) {
      return apiError("ACADEMY_HAS_NO_OWNER", "Academy has no owner", 400);
    }

    const [owner] = await db
      .select({
        userId: profiles.userId,
      })
      .from(profiles)
      .where(eq(profiles.id, updated.ownerId))
      .limit(1);

    if (!owner) {
      return apiError("OWNER_NOT_FOUND", "Owner not found", 404);
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
    resourceType: "academy",
    resourceId: academyId,
    resourceName: updated.name,
    description: body?.isSuspended
      ? `Super Admin suspendió la academia ${updated.name ?? academyId}`
      : `Super Admin actualizó la academia ${updated.name ?? academyId}`,
    meta: {
      academyId,
      updates,
      reason: typeof body?.reason === "string" ? body.reason.trim() : null,
    },
  });

  return apiSuccess(updated);
});

export const DELETE = withSuperAdmin(async (request, context) => {
  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;
  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const body = await request.json().catch(() => ({}));
  const reason = reasonSchema.safeParse(body?.reason);
  if (!reason.success) {
    return apiError("REASON_REQUIRED", "Indica el motivo de la eliminación", 400);
  }

  const [removed] = await db
    .delete(academies)
    .where(eq(academies.id, academyId))
    .returning({ id: academies.id, name: academies.name });

  if (!removed) {
    return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  await logAdminAction({
    userId: context.userId,
    tenantId: null,
    action: "academy.deleted",
    resourceType: "academy",
    resourceId: academyId,
    resourceName: removed.name,
    description: `Super Admin eliminó la academia ${removed.name ?? academyId}; la cuenta del dueño se conserva`,
    meta: { academyId, ownerAccountRetained: true, reason: reason.data },
  });

  return apiSuccess({ ok: true });
});
