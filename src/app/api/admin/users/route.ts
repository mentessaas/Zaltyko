import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, invitations, profileRoleEnum } from "@/db/schema";
import { config } from "@/config";
import { sendEmail } from "@/lib/mailgun";
import { withTenant } from "@/lib/authz";
import { withRateLimit, getUserIdentifier, type RateLimitContext } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess } from "@/lib/permissions";
import { getAppUrl } from "@/lib/env";

const profileRoles = [
  "super_admin",
  "admin",
  "owner",
  "coach",
  "athlete",
  "parent",
] as const;

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(profileRoles),
  tenantId: z.string().uuid().optional(),
  academyIds: z.array(z.string().uuid()).optional(),
  defaultAcademyId: z.string().uuid().optional(),
});

// Aplicar rate limiting: 20 requests por minuto para invitaciones
const handler = withTenant(async (request, context) => {
  try {
    const body = InviteSchema.parse(await request.json());

  if (!context || !context.profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const isSuperAdmin = context.profile.role === "super_admin";
  const isAdmin = isSuperAdmin || context.profile.role === "admin";

  if (body.role === "super_admin" && !isSuperAdmin) {
    return NextResponse.json({ error: "NO_AUTH_SUPER_ADMIN" }, { status: 403 });
  }

  if (!isAdmin && context.profile.role !== "owner") {
    return NextResponse.json({ error: "NO_AUTH" }, { status: 403 });
  }

  const effectiveTenantId = isSuperAdmin
    ? body.tenantId ?? context.tenantId ?? ""
    : context.tenantId;

  if (!effectiveTenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

    const academyIds = body.academyIds ?? [];

    if (academyIds.length > 0) {
      // Verificar acceso a todas las academias
      for (const academyId of academyIds) {
        const academyAccess = await verifyAcademyAccess(academyId, effectiveTenantId);
        if (!academyAccess.allowed) {
          return NextResponse.json({ error: academyAccess.reason ?? "ACADEMY_NOT_FOUND" }, { status: 400 });
        }
      }
    }

  const defaultAcademyId = body.defaultAcademyId ?? academyIds[0] ?? null;

  if (defaultAcademyId && !academyIds.includes(defaultAcademyId)) {
    academyIds.push(defaultAcademyId);
  }

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
    await sendEmail({
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
      replyTo: config.mailgun.forwardRepliesTo,
      text: `Has sido invitado a unirte a ${config.appName}. Visita ${inviteUrl.toString()} para completar tu registro. El enlace expira en 7 días.`,
    });
    } catch (error) {
      console.error("Error enviando la invitación", error);
      return NextResponse.json({ error: "MAIL_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});

// Aplicar rate limiting: 20 requests por minuto para invitaciones
// El rate limiting se aplica antes de withTenant
export const POST = withRateLimit(
  async (request, context?: RateLimitContext) => {
    return (await handler(request, context ?? {})) as NextResponse;
  },
  { identifier: getUserIdentifier }
);


