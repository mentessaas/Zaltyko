import { NextResponse } from "next/server";
import { eq, count, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { profiles, memberships, academies, subscriptions, plans, athletes, coaches, classes } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { logAdminAction } from "@/lib/admin-logs";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const resolvedParams = await resolveParams(context.params);
  const profileId = resolvedParams?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "PROFILE_ID_REQUIRED" }, { status: 400 });
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
    return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
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

  const adminClient = getSupabaseAdminClient();
  const { data: authUser } = await adminClient.auth.admin.getUserById(profile.userId);

  return NextResponse.json({
    ...profile,
    email: authUser?.user?.email ?? null,
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
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const resolvedParams = await resolveParams(context.params);
  const profileId = resolvedParams?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "PROFILE_ID_REQUIRED" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
  }

  if (existing.role === "super_admin") {
    return NextResponse.json({ error: "IMMUTABLE_SUPER_ADMIN" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (typeof body?.role === "string" && body.role !== existing.role) {
    updates.role = body.role;
  }

  if (typeof body?.isSuspended === "boolean" && body.isSuspended !== existing.isSuspended) {
    updates.isSuspended = body.isSuspended;
  }

  if (typeof body?.name === "string" && body.name.trim().length > 0 && body.name.trim() !== existing.name) {
    updates.name = body.name.trim();
  }

  if (typeof body?.email === "string" && body.email.trim().length > 0) {
    const adminClient = getSupabaseAdminClient();
    const { error: updateError } = await adminClient.auth.admin.updateUserById(existing.userId, {
      email: body.email.trim(),
    });
    if (updateError) {
      return NextResponse.json({ error: "EMAIL_UPDATE_FAILED", message: updateError.message }, { status: 400 });
    }
  }

  // Handle plan update
  if (typeof body?.planId === "string" && body.planId.trim().length > 0) {
    const [plan] = await db.select({ id: plans.id, code: plans.code }).from(plans).where(eq(plans.id, body.planId)).limit(1);
    if (plan) {
      // Check for limit violations before changing plan
      const { checkPlanLimitViolations } = await import("@/lib/limits");
      const violations = await checkPlanLimitViolations(existing.userId, plan.code as "free" | "pro" | "premium");

      // If there are violations and force flag is not set, return violations info
      if (violations.requiresAction && !body.force) {
        return NextResponse.json(
          {
            error: "PLAN_LIMIT_VIOLATIONS",
            violations: violations.violations,
            requiresAction: true,
          },
          { status: 400 }
        );
      }

      const [existingSubscription] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.userId, existing.userId))
        .limit(1);

      if (existingSubscription) {
        await db
          .update(subscriptions)
          .set({ planId: plan.id })
          .where(eq(subscriptions.id, existingSubscription.id));
      } else {
        await db.insert(subscriptions).values({
          userId: existing.userId,
          planId: plan.id,
          status: "active",
        });
      }

      // If violations exist and force is true, send notification email
      if (violations.requiresAction && body.force) {
        const adminClient = getSupabaseAdminClient();
        const { data: authUser } = await adminClient.auth.admin.getUserById(existing.userId);

        if (authUser?.user?.email) {
          try {
            const { sendEmail } = await import("@/lib/mailgun");
            const { config } = await import("@/config");

            const academyViolation = violations.violations.find((v) => v.resource === "academies");
            const athleteViolation = violations.violations.find((v) => v.resource === "athletes");
            const classViolation = violations.violations.find((v) => v.resource === "classes");
            const groupViolation = violations.violations.find((v) => v.resource === "groups");

            await sendEmail({
              to: authUser.user.email,
              subject: "⚠️ Cambio de plan - Ajustes necesarios - Zaltyko",
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #f59e0b;">Cambio de plan completado</h2>
                  <p>Hola ${existing.name ?? "Usuario"},</p>
                  <p>Tu plan ha sido cambiado a <strong>${plan.code.toUpperCase()}</strong>. Sin embargo, algunos de tus recursos exceden los límites del nuevo plan.</p>
                  
                  ${academyViolation ? `
                    <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0;">
                      <h3 style="color: #92400e; margin-top: 0;">Academias</h3>
                      <p style="color: #78350f;">Tienes <strong>${academyViolation.currentCount}</strong> academias, pero tu plan solo permite <strong>${academyViolation.limit}</strong>.</p>
                      <p style="color: #78350f; font-size: 14px;">Debes elegir qué academias mantener activas.</p>
                    </div>
                  ` : ""}
                  
                  ${athleteViolation ? `
                    <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0;">
                      <h3 style="color: #92400e; margin-top: 0;">Atletas</h3>
                      <p style="color: #78350f;">Tienes <strong>${athleteViolation.currentCount}</strong> atletas en ${athleteViolation.academyName ? `la academia "${athleteViolation.academyName}"` : "una academia"}, pero tu plan solo permite <strong>${athleteViolation.limit}</strong>.</p>
                      <p style="color: #78350f; font-size: 14px;">Debes reducir el número de atletas activos.</p>
                    </div>
                  ` : ""}
                  
                  ${classViolation ? `
                    <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0;">
                      <h3 style="color: #92400e; margin-top: 0;">Clases</h3>
                      <p style="color: #78350f;">Tienes <strong>${classViolation.currentCount}</strong> clases en ${classViolation.academyName ? `la academia "${classViolation.academyName}"` : "una academia"}, pero tu plan solo permite <strong>${classViolation.limit}</strong>.</p>
                      <p style="color: #78350f; font-size: 14px;">Debes reducir el número de clases activas.</p>
                    </div>
                  ` : ""}
                  
                  ${groupViolation ? `
                    <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0;">
                      <h3 style="color: #92400e; margin-top: 0;">Grupos</h3>
                      <p style="color: #78350f;">Tienes <strong>${groupViolation.currentCount}</strong> grupos en ${groupViolation.academyName ? `la academia "${groupViolation.academyName}"` : "una academia"}, pero tu plan solo permite <strong>${groupViolation.limit}</strong>.</p>
                      <p style="color: #78350f; font-size: 14px;">Debes reducir el número de grupos activos.</p>
                    </div>
                  ` : ""}
                  
                  <div style="background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #1e40af; margin-top: 0;">¿Qué hacer ahora?</h3>
                    <ol style="color: #1e3a8a; padding-left: 20px;">
                      <li>Visita tu <a href="${getAppUrl()}/dashboard/plan-limits" style="color: #2563eb; font-weight: bold;">panel de ajustes de plan</a></li>
                      <li>Revisa los recursos que exceden los límites</li>
                      <li>Elige qué mantener activo según tu plan</li>
                      <li>O considera <a href="${getAppUrl()}/dashboard" style="color: #2563eb; font-weight: bold;">actualizar tu plan</a> para mantener todos tus recursos</li>
                    </ol>
                  </div>
                  
                  <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
                    Si tienes alguna pregunta, contacta a nuestro equipo de soporte en ${config.mailgun.supportEmail}
                  </p>
                </div>
              `,
              text: `Tu plan ha sido cambiado a ${plan.code.toUpperCase()}. Algunos recursos exceden los límites. Visita tu panel para ajustar.`,
              replyTo: config.mailgun.supportEmail,
            });
          } catch (error) {
            console.error("Error sending plan change notification", error);
          }
        }
      }
    }
  }

  if (Object.keys(updates).length === 0 && !body?.email && !body?.planId) {
    return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });
  }

  const [updated] = await db
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

  await logAdminAction({
    userId: context.userId,
    tenantId: null,
    action: "user.updated",
    meta: { profileId, updates },
  });

  return NextResponse.json(updated);
});

