import { apiSuccess, apiError } from "@/lib/api-response";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { profiles, subscriptions, plans } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { logAdminAction } from "@/lib/admin-logs";
import { getAuthUserEmail, updateAuthUserEmail } from "@/lib/supabase/admin-operations";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSuperAdminUserDetail, SUPER_ADMIN_PROFILE_ROLES } from "@/lib/superAdminUsers";

export const dynamic = "force-dynamic";
// @service-role auth-admin:read-update-email. Super-admin user management requires Supabase Auth admin APIs.

interface RouteParams {
  profileId?: string;
}

const patchUserSchema = z.object({
  name: z.string().trim().min(1).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  role: z.enum(SUPER_ADMIN_PROFILE_ROLES).nullable().optional(),
  isSuspended: z.boolean().optional(),
  planId: z.string().trim().min(1).nullable().optional(),
  force: z.boolean().optional(),
  confirmSuperAdminPromotion: z.boolean().optional(),
});

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

  const profile = await getSuperAdminUserDetail(profileId);

  if (!profile) {
    return apiError("PROFILE_NOT_FOUND", "Profile not found", 404);
  }
  return apiSuccess(profile);
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

  const parsed = patchUserSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid user update payload", 400, parsed.error.flatten());
  }

  const body = parsed.data;
  const updates: Record<string, unknown> = {};

  const existingRole = existing.role as string;

  if (body.role === "super_admin" && body.role !== existingRole && !body.confirmSuperAdminPromotion) {
    return apiError(
      "SUPER_ADMIN_PROMOTION_CONFIRMATION_REQUIRED",
      "Promoting a user to super_admin requires explicit backend confirmation",
      400,
    );
  }

  if (body.role && body.role !== existingRole) {
    updates.role = body.role;
  }

  if (typeof body?.isSuspended === "boolean" && body.isSuspended !== existing.isSuspended) {
    updates.isSuspended = body.isSuspended;
  }

  if (typeof body?.name === "string" && body.name !== existing.name) {
    updates.name = body.name;
  }

  if (typeof body?.email === "string" && body.email.trim().length > 0) {
    await updateAuthUserEmail({
      userId: existing.userId,
      email: body.email.trim(),
    });
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
        return apiError("PLAN_LIMIT_VIOLATIONS", "Plan limit violations detected", 400);
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
        const authEmail = await getAuthUserEmail(existing.userId);

        if (authEmail) {
          try {
            const { sendEmail } = await import("@/lib/brevo");
            const { config } = await import("@/config");

            const academyViolation = violations.violations.find((v) => v.resource === "academies");
            const athleteViolation = violations.violations.find((v) => v.resource === "athletes");
            const classViolation = violations.violations.find((v) => v.resource === "classes");
            const groupViolation = violations.violations.find((v) => v.resource === "groups");

            await sendEmail({
              to: authEmail,
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
                    Si tienes alguna pregunta, contacta a nuestro equipo de soporte en ${config.brevo.supportEmail}
                  </p>
                </div>
              `,
              text: `Tu plan ha sido cambiado a ${plan.code.toUpperCase()}. Algunos recursos exceden los límites. Visita tu panel para ajustar.`,
              replyTo: config.brevo.supportEmail,
            });
          } catch (error) {
            logger.error("Error sending plan change notification", error);
          }
        }
      }
    }
  }

  if (Object.keys(updates).length === 0 && !body.email && !body.planId) {
    return apiError("NO_CHANGES", "No changes provided", 400);
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
    action: updates.role ? "user.role_changed" : "user.updated",
    meta: {
      profileId,
      updates,
      ...(updates.role ? { oldRole: existing.role, newRole: updates.role } : {}),
    },
  });

  return apiSuccess(updated);
});
