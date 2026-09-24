import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, invitations } from "@/db/schema";
import { config } from "@/config";
import { withTenant } from "@/lib/authz";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess } from "@/lib/permissions";
import { getAppUrl } from "@/lib/env";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { sendEmailWithLogging } from "@/lib/email/email-service";

const profileRoles = [
  "super_admin",
  "admin",
  "owner",
  "coach",
  "athlete",
  "parent",
] as const;

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(profileRoles),
  tenantId: z.string().uuid().optional(),
  academyIds: z.array(z.string().uuid()).max(50).optional(),
  defaultAcademyId: z.string().uuid().optional(),
});

// Aplicar rate limiting: 20 requests por minuto para invitaciones
const handler = withTenant(async (request, context) => {
  try {
    const body = InviteSchema.parse(await request.json());

    if (!context || !context.profile) {
      return apiError("UNAUTHORIZED", "No autorizado", 401);
    }

    const isSuperAdmin = context.profile.role === "super_admin";
    const isAdmin = isSuperAdmin || context.profile.role === "admin";

    if (body.role === "super_admin" && !isSuperAdmin) {
      return apiError("NO_AUTH_SUPER_ADMIN", "No autorizado para crear super_admin", 403);
    }

    if (!isAdmin && context.profile.role !== "owner") {
      return apiError("NO_AUTH", "No autorizado", 403);
    }

    const effectiveTenantId = isSuperAdmin
      ? body.tenantId ?? context.tenantId ?? ""
      : context.tenantId;

    if (!effectiveTenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }

    const academyIds = Array.from(new Set([
      ...(body.academyIds ?? []),
      ...(body.defaultAcademyId ? [body.defaultAcademyId] : []),
    ]));

    if (academyIds.length > 0) {
      // Verificar acceso a todas las academias
      for (const academyId of academyIds) {
        const academyAccess = await verifyAcademyAccess(academyId, effectiveTenantId);
        if (!academyAccess.allowed) {
          return apiError("ACADEMY_NOT_FOUND", academyAccess.reason ?? "Academia no encontrada", 400);
        }
      }
    }

    // `defaultAcademyId` is included in the verified set above; never append
    // an unchecked academy after authorization (cross-tenant invitation risk).
    const defaultAcademyId = body.defaultAcademyId ?? academyIds[0] ?? null;

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

    await db
      .insert(invitations)
      .values({
        tenantId: effectiveTenantId,
        email: body.email.toLowerCase(),
        role: body.role,
        token,
        status: "pending",
        invitedBy: context.userId,
        academyIds,
        expiresAt,
        defaultAcademyId,
      })
      .onConflictDoUpdate({
        target: [invitations.tenantId, invitations.email],
        // The uniqueness constraint is intentionally partial so accepted and
        // cancelled invitations can be retained for audit/history.
        where: sql`${invitations.status} = 'pending'`,
        set: {
          role: body.role,
          token,
          status: "pending",
          invitedBy: context.userId,
          academyIds,
          expiresAt,
          defaultAcademyId,
          acceptedAt: null,
          supabaseUserId: null,
          createdAt: new Date(),
        },
      });

    const baseUrl = getAppUrl();
    const inviteUrl = new URL("/auth/invite", baseUrl);
    inviteUrl.searchParams.set("token", token);

    try {
      await sendEmailWithLogging({
        to: body.email,
        subject: `Invitación a ${config.appName}`,
        html: `
        <p>Hola,</p>
        <p>Has sido invitado a unirte a ${config.appName}. Haz clic en el siguiente botón para completar tu registro:</p>
        <p>
          <a href="${inviteUrl.toString()}" style="padding: 12px 20px; border-radius: 9999px; background: linear-gradient(90deg,#22c55e,#84cc16); color: #0d1b1e; font-weight: 600; text-decoration: none;">
            Aceptar invitación
          </a>
        </p>
        <p>Este enlace expira en 7 días.</p>
        <p>Si no esperabas esta invitación, ignora este mensaje.</p>
      `,
        replyTo: config.brevo.forwardRepliesTo,
        text: `Has sido invitado a unirte a ${config.appName}. Visita ${inviteUrl.toString()} para completar tu registro. El enlace expira en 7 días.`,
        template: "legacy-admin-invitation",
        tenantId: effectiveTenantId,
        academyId: defaultAcademyId ?? undefined,
        dedupeKey: `legacy-admin-invitation:${effectiveTenantId}:${body.email}`,
      });
    } catch (error) {
      logger.error("Error enviando la invitación", error);
      return apiError("MAIL_ERROR", "Error al enviar el correo", 500);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});

// Aplicar rate limiting: 20 requests por minuto para invitaciones
// El rate limiting se aplica antes de withTenant
export const POST = withRateLimit(
  async (request, context?: any) => {
    return (await handler(request, context ?? {})) as any;
  },
  { identifier: getUserIdentifier }
);
