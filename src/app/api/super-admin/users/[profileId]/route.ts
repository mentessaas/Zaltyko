import { apiSuccess, apiError } from "@/lib/api-response";
import { eq, count, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { profiles, memberships, academies, subscriptions, plans, athletes, coaches, classes } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { logAdminAction } from "@/lib/admin-logs";
import { getAuthUserEmail, updateAuthUserEmail, deleteAuthUser } from "@/lib/supabase/admin-operations";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
// @service-role auth-admin:read-update-email. Super-admin user management requires Supabase Auth admin APIs.
/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */

const updateUserSchema = z.object({
  role: z.enum(["owner", "admin", "coach", "athlete", "parent", "super_admin"]).nullable().optional(),
  isSuspended: z.boolean().optional(),
  name: z.string().trim().min(1).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  planId: z.string().trim().min(1).nullable().optional(),
  force: z.boolean().optional(),
  reason: z.string().trim().min(5).max(500).optional(),
});

interface RouteParams {
  profileId?: string;
}

async function resolveParams(params: unknown): Promise<RouteParams> {
  if (!params) {
    return {};
  }
  if (typeof params === "object" && params !== null && "then" in params && typeof params.then === "function") {
    return await (params as Promise<RouteParams>);
  }
  if (typeof params === "object" && params !== null) {
    return params as RouteParams;
  }
  return {};
}

export const GET = withSuperAdmin(async (_request, context) => {
  if (!context || !context.profile) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const resolvedParams = await resolveParams(context.params);
  const profileId = resolvedParams?.profileId;
  if (!profileId) {
    return apiError("PROFILE_ID_REQUIRED", "Profile ID is required", 400);
  }

  const [profile] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      name: profiles.name,
      role: profiles.role,
      tenantId: profiles.tenantId,
      activeAcademyId: profiles.activeAcademyId,
      isSuspended: profiles.isSuspended,
      canLogin: profiles.canLogin,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile) {
    return apiError("PROFILE_NOT_FOUND", "Profile not found", 404);
  }

  const userMemberships = await db
    .select({
      id: memberships.id,
      academyId: memberships.academyId,
      role: memberships.role,
      academyName: academies.name,
      academyType: academies.academyType,
    })
    .from(memberships)
    .leftJoin(academies, eq(memberships.academyId, academies.id))
    .where(eq(memberships.userId, profile.userId));

  // Get user subscription separately
  const [userSubscription] = await db
    .select({
      id: subscriptions.id,
      planId: subscriptions.planId,
      planCode: plans.code,
      planNickname: plans.nickname,
      status: subscriptions.status,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
    })
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, profile.userId))
    .limit(1);

  // Get statistics: academies owned, total athletes, coaches, classes
  const ownedAcademies = await db
    .select({ id: academies.id })
    .from(academies)
    .where(eq(academies.ownerId, profile.id));

  const academyIds = ownedAcademies.map((a) => a.id);

  const stats = {
    academiesOwned: ownedAcademies.length,
    totalAthletes: 0,
    totalCoaches: 0,
    totalClasses: 0,
  };

  if (academyIds.length > 0) {
    const [athletesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(athletes)
      .where(inArray(athletes.academyId, academyIds));

    const [coachesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(coaches)
      .where(inArray(coaches.academyId, academyIds));

    const [classesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .where(inArray(classes.academyId, academyIds));

    stats.totalAthletes = Number(athletesResult?.count ?? 0);
    stats.totalCoaches = Number(coachesResult?.count ?? 0);
    stats.totalClasses = Number(classesResult?.count ?? 0);
  }

  const authEmail = await getAuthUserEmail(profile.userId);

  return apiSuccess({
    ...profile,
    email: authEmail,
    subscription: userSubscription
      ? {
          id: userSubscription.id,
          planId: userSubscription.planId,
          planCode: userSubscription.planCode,
          planNickname: userSubscription.planNickname,
          status: userSubscription.status,
          stripeCustomerId: userSubscription.stripeCustomerId,
          stripeSubscriptionId: userSubscription.stripeSubscriptionId,
        }
      : null,
    memberships: userMemberships.map((m) => ({
      id: m.id,
      academyId: m.academyId,
      role: m.role,
      academyName: m.academyName,
      academyType: m.academyType,
    })),
    stats,
  });
});

export const PATCH = withSuperAdmin(async (request, context) => {
  if (!context || !context.profile) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const resolvedParams = await resolveParams(context.params);
  const profileId = resolvedParams?.profileId;
  if (!profileId) {
    return apiError("PROFILE_ID_REQUIRED", "Profile ID is required", 400);
  }

  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!existing) {
    return apiError("PROFILE_NOT_FOUND", "Profile not found", 404);
  }

  if (existing.role === "super_admin") {
    return apiError("IMMUTABLE_SUPER_ADMIN", "Cannot modify super admin profile", 400);
  }

  const json = await request.json().catch(() => ({}));
  const parsed = updateUserSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Datos inválidos", 400);
  }
  const body = parsed.data;
  const updates: Record<string, unknown> = {};
  const auditChanges: Record<string, unknown> = {};
  const changesAccess =
    (body.role !== undefined && body.role !== existing.role) ||
    (typeof body.isSuspended === "boolean" && body.isSuspended !== existing.isSuspended);

  if (changesAccess && !body.reason) {
    return apiError("REASON_REQUIRED", "Indica el motivo del cambio de acceso", 400);
  }

  if (body.role && body.role !== existing.role) {
    updates.role = body.role;
    auditChanges.role = { from: existing.role, to: body.role };
  }

  if (typeof body.isSuspended === "boolean" && body.isSuspended !== existing.isSuspended) {
    updates.isSuspended = body.isSuspended;
    auditChanges.isSuspended = { from: existing.isSuspended, to: body.isSuspended };
  }

  if (body.name && body.name !== existing.name) {
    updates.name = body.name;
    auditChanges.name = { from: existing.name, to: body.name };
  }

  let planToApply: { id: string; code: string; violations: any } | null = null;

  if (body.planId) {
    const [plan] = await db
      .select({ id: plans.id, code: plans.code })
      .from(plans)
      .where(eq(plans.id, body.planId))
      .limit(1);

    if (!plan) {
      return apiError("PLAN_NOT_FOUND", "El plan seleccionado no existe", 404);
    }

    const { checkPlanLimitViolations } = await import("@/lib/limits");
    const violations = await checkPlanLimitViolations(
      existing.userId,
      plan.code as "free" | "pro" | "premium"
    );

    if (violations.requiresAction && !body.force) {
      return apiError("PLAN_LIMIT_VIOLATIONS", "Plan limit violations detected", 400);
    }

    planToApply = { id: plan.id, code: plan.code, violations };
    auditChanges.planId = plan.id;
  }

  if (body.email) {
    await updateAuthUserEmail({
      userId: existing.userId,
      email: body.email,
    });
    auditChanges.email = "updated";
  }

  if (Object.keys(updates).length === 0 && !body.email && !planToApply) {
    return apiError("NO_CHANGES", "No changes provided", 400);
  }

  let updated;
  try {
    updated = await db.transaction(async (tx) => {
      let profileUpdated = existing;
      if (Object.keys(updates).length > 0) {
        const [nextProfile] = await tx
          .update(profiles)
          .set(updates)
          .where(eq(profiles.id, profileId))
          .returning({
            id: profiles.id,
            userId: profiles.userId,
            name: profiles.name,
            role: profiles.role,
            isSuspended: profiles.isSuspended,
          });
        if (!nextProfile) throw new Error("PROFILE_NOT_FOUND");
        profileUpdated = nextProfile as typeof existing;
      }

      if (planToApply) {
        const [existingSubscription] = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(eq(subscriptions.userId, existing.userId))
          .limit(1);

        if (existingSubscription) {
          await tx
            .update(subscriptions)
            .set({ planId: planToApply.id })
            .where(eq(subscriptions.id, existingSubscription.id));
        } else {
          await tx.insert(subscriptions).values({
            userId: existing.userId,
            planId: planToApply.id,
            status: "active",
          });
        }
      }

      return profileUpdated;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PROFILE_NOT_FOUND") {
      return apiError("PROFILE_NOT_FOUND", "Profile not found", 404);
    }
    logger.error("Error applying super-admin user changes", error);
    return apiError("USER_UPDATE_FAILED", "No se pudieron aplicar todos los cambios", 500);
  }

  if (planToApply?.violations?.requiresAction && body.force) {
    const authEmail = await getAuthUserEmail(existing.userId);
    if (authEmail) {
      try {
        const { sendEmail } = await import("@/lib/brevo");
        const { config } = await import("@/config");
        await sendEmail({
          to: authEmail,
          subject: "Cambio de plan completado - Zaltyko",
          html: `<p>Tu plan de Zaltyko ha cambiado a <strong>${planToApply.code.toUpperCase()}</strong>. Algunos recursos superan los límites actuales; revisa tu panel para ajustarlos.</p>`,
          text: `Tu plan ha cambiado a ${planToApply.code.toUpperCase()}. Revisa los recursos que superan los límites.`,
          replyTo: config.brevo.supportEmail,
        });
      } catch (error) {
        logger.error("Error sending plan change notification", error);
      }
    }
  }

  await logAdminAction({
    userId: context.userId,
    tenantId: null,
    action: "user.updated",
    resourceType: "profile",
    resourceId: profileId,
    resourceName: existing.name,
    description: `Super Admin actualizó el usuario ${existing.name ?? profileId}`,
    meta: { profileId, changes: auditChanges, reason: body.reason ?? null },
  });

  return apiSuccess(updated);
});

// DELETE /api/super-admin/users/[profileId] — borra el perfil y la cuenta de Auth.
// Ojo: por CASCADE, si el usuario es dueño de una academia, esa academia se elimina también.
export const DELETE = withSuperAdmin(async (request, context) => {
  if (!context?.profile) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401);
  }
  const { profileId } = await resolveParams(context.params);
  if (!profileId) {
    return apiError("PROFILE_ID_REQUIRED", "Profile ID is required", 400);
  }

  const body = await request.json().catch(() => ({}));
  const reason = z.string().trim().min(5).max(500).safeParse(body?.reason);
  if (!reason.success) {
    return apiError("REASON_REQUIRED", "Indica el motivo de la eliminación", 400);
  }

  const [target] = await db
    .select({ id: profiles.id, userId: profiles.userId, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!target) {
    return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
  }

  // No permitir que el super-admin se borre a sí mismo.
  if (target.userId && target.userId === context.userId) {
    return apiError("CANNOT_DELETE_SELF", "No puedes eliminar tu propia cuenta", 400);
  }

  // No permitir borrar el último super_admin.
  if (target.role === "super_admin") {
    const [{ value: superAdmins }] = await db
      .select({ value: count() })
      .from(profiles)
      .where(eq(profiles.role, "super_admin"));
    if (Number(superAdmins) <= 1) {
      return apiError("LAST_SUPER_ADMIN", "No puedes eliminar el último super administrador", 400);
    }
  }

  // Delete Auth first so an Auth failure never leaves a deleted profile with a live login.
  if (target.userId) {
    try {
      await deleteAuthUser(target.userId);
    } catch (error) {
      logger.error("No se pudo borrar la cuenta de Auth", error, { profileId });
      return apiError("AUTH_DELETE_FAILED", "No se pudo eliminar la cuenta de acceso", 502);
    }
  }

  const [removed] = await db
    .delete(profiles)
    .where(eq(profiles.id, profileId))
    .returning({ id: profiles.id });

  if (!removed) {
    return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
  }

  await logAdminAction({
    userId: context.userId,
    tenantId: null,
    action: "user.deleted",
    resourceType: "profile",
    resourceId: profileId,
    description: `Super Admin eliminó el usuario ${profileId}`,
    meta: { profileId, role: target.role, reason: reason.data },
  });

  return apiSuccess({ ok: true });
});
